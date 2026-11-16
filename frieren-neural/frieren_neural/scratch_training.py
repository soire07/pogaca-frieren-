"""Reproducible, resumable CPU training for Frieren Neural's own model."""
import argparse
import hashlib
import json
import random
from pathlib import Path

import torch

from .scratch_model import FrierenNeuralConfig, FrierenNeuralModel
from .tokenizer import BPETokenizer
from .training import (
    _atomic_save,
    _sample_batch,
    DIALOGUE_ENCODING_VERSION,
    LOSS_OBJECTIVE_VERSION,
    encode_dialogue_stream_with_loss_mask,
    load_licensed_corpus,
    split_corpus_text,
)

ARCHITECTURE_ID = "frieren-neural-transformer-v2"


def split_native_corpus(documents, validation_fraction=0.1):
    return split_corpus_text(documents, validation_fraction)


def _validate_resume_step(checkpoint_step: int, total_steps: int) -> int:
    if isinstance(checkpoint_step, bool) or not isinstance(checkpoint_step, int) or checkpoint_step < 0:
        raise ValueError("Resume checkpoint step must be a non-negative integer.")
    if isinstance(total_steps, bool) or not isinstance(total_steps, int) or total_steps <= checkpoint_step:
        raise ValueError("Total steps must be greater than the checkpoint step to resume training.")
    return checkpoint_step + 1


def _validate_resume_payload(payload, *, training_corpus_sha256: str, manifest_sha256: str):
    if not isinstance(payload, dict) or payload.get("format_version") != 2 or payload.get("architecture_id") != ARCHITECTURE_ID:
        raise ValueError("Resume checkpoint is not a supported native v2 training checkpoint.")
    if payload.get("training_corpus_sha256") != training_corpus_sha256:
        raise ValueError("Resume checkpoint training corpus does not match the current corpus.")
    if payload.get("manifest_sha256") != manifest_sha256:
        raise ValueError("Resume checkpoint license manifest does not match the current corpus.")
    for field in ("optimizer_state", "batch_generator_state", "torch_rng_state", "model_state", "tokenizer", "model_config"):
        if field not in payload:
            raise ValueError(f"Resume checkpoint is missing required {field} state.")
    checkpoint_step = payload.get("step")
    if isinstance(checkpoint_step, bool) or not isinstance(checkpoint_step, int) or checkpoint_step < 0:
        raise ValueError("Resume checkpoint step must be a non-negative integer.")
    if payload["dialogue_encoding_version"] != DIALOGUE_ENCODING_VERSION:
        raise ValueError("Resume checkpoint dialogue encoding version is unsupported.")
    if payload["loss_objective_version"] != LOSS_OBJECTIVE_VERSION:
        raise ValueError("Resume checkpoint loss objective version is unsupported.")
    if not isinstance(payload["optimizer_state"], dict):
        raise ValueError("Resume checkpoint optimizer state is invalid.")
    if not isinstance(payload["batch_generator_state"], torch.Tensor) or not isinstance(payload["torch_rng_state"], torch.Tensor):
        raise ValueError("Resume checkpoint random generator state is invalid.")
    return payload


def run(data_dirs, checkpoint, steps=6000, seed=20261106, device="cpu", resume=False):
    if isinstance(steps, bool) or not isinstance(steps, int) or steps < 1:
        raise ValueError("steps must be a positive integer.")
    torch.set_num_threads(2)
    random.seed(seed)
    torch.manual_seed(seed)

    docs = []
    licenses = []
    manifests = []
    for folder in data_dirs:
        root = Path(folder)
        docs.extend(load_licensed_corpus(root))
        raw = (root / "corpus_manifest.json").read_bytes()
        manifests.append(hashlib.sha256(raw).hexdigest())
        licenses.extend(item["license"] for item in json.loads(raw)["documents"])

    train_text, val_text = split_native_corpus(docs, validation_fraction=0.1)
    corpus_digest = hashlib.sha256(train_text.encode()).hexdigest()
    manifest_digest = hashlib.sha256("".join(manifests).encode()).hexdigest()
    checkpoint_path = Path(checkpoint)
    payload = None
    if resume:
        if not checkpoint_path.is_file():
            raise FileNotFoundError(f"Cannot resume: checkpoint not found at {checkpoint_path}.")
        payload = _validate_resume_payload(
            torch.load(checkpoint_path, map_location="cpu", weights_only=True),
            training_corpus_sha256=corpus_digest,
            manifest_sha256=manifest_digest,
        )
        tokenizer = BPETokenizer.from_dict(payload["tokenizer"])
        config = FrierenNeuralConfig(**payload["model_config"])
    else:
        tokenizer = BPETokenizer.train([train_text], vocab_size=1024, min_frequency=2)
        config = FrierenNeuralConfig(
            vocab_size=tokenizer.vocab_size, d_model=256, n_layers=6,
            n_heads=8, n_kv_heads=4, max_seq_len=256,
        )

    if config.vocab_size != tokenizer.vocab_size:
        raise ValueError("Checkpoint vocabulary does not match its tokenizer.")

    def encode(text):
        ids, mask = encode_dialogue_stream_with_loss_mask(text, tokenizer)
        return torch.tensor(ids), torch.tensor(mask, dtype=torch.bool)

    train, train_mask = encode(train_text)
    validation, validation_mask = encode(val_text)
    block_size = min(256, config.max_seq_len)
    if len(train) <= block_size or len(validation) <= block_size:
        raise ValueError("Training and validation splits must each exceed the model context length.")

    model = FrierenNeuralModel(config).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=2e-4, weight_decay=0.1)
    batch_generator = torch.Generator().manual_seed(seed + 1)
    start_step = 1
    if payload is not None:
        model.load_state_dict(payload["model_state"], strict=True)
        optimizer.load_state_dict(payload["optimizer_state"])
        batch_generator.set_state(payload["batch_generator_state"])
        torch.set_rng_state(payload["torch_rng_state"])
        start_step = _validate_resume_step(payload["step"], steps)

    for step in range(start_step, steps + 1):
        x, y = _sample_batch(
            train, batch_size=4, block_size=block_size, device=torch.device(device),
            generator=batch_generator, target_mask=train_mask,
        )
        _, loss = model(x, y)
        optimizer.zero_grad(set_to_none=True)
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()

        if step == 1 or step % 250 == 0 or step == steps:
            model.eval()
            with torch.no_grad():
                vx, vy = _sample_batch(
                    validation, batch_size=4, block_size=block_size,
                    device=torch.device(device), generator=batch_generator,
                    target_mask=validation_mask,
                )
                _, validation_loss = model(vx, vy)
            model.train()
            print(json.dumps({
                "step": step, "total_steps": steps,
                "train_loss": float(loss.detach().item()),
                "validation_loss": float(validation_loss.detach().item()),
            }, ensure_ascii=False), flush=True)

            saved = {
                "format_version": 2,
                "architecture_id": model.architecture_id,
                "pretrained_weights": False,
                "dialogue_encoding_version": DIALOGUE_ENCODING_VERSION,
                "loss_objective_version": LOSS_OBJECTIVE_VERSION,
                "model_config": config.to_dict(),
                "model_state": model.state_dict(),
                "tokenizer": tokenizer.to_dict(),
                "step": step,
                "seed": seed,
                "training_corpus_sha256": corpus_digest,
                "manifest_sha256": manifest_digest,
                "licenses": sorted(set(licenses)),
                "training_config": {
                    "steps": steps, "d_model": config.d_model,
                    "n_layers": config.n_layers, "n_heads": config.n_heads,
                    "n_kv_heads": config.n_kv_heads, "context": config.max_seq_len,
                },
                "optimizer_state": optimizer.state_dict(),
                "batch_generator_state": batch_generator.get_state(),
                "torch_rng_state": torch.get_rng_state(),
            }
            _atomic_save(saved, checkpoint_path)

    return {"step": steps, "architecture_id": model.architecture_id, "pretrained_weights": False}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", action="append", required=True)
    parser.add_argument("--checkpoint", required=True)
    parser.add_argument("--steps", type=int, default=6000)
    parser.add_argument("--seed", type=int, default=20261106)
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--resume", action="store_true", help="Resume from a compatible native v2 checkpoint.")
    args = parser.parse_args()
    print(json.dumps(run(
        args.data, args.checkpoint, args.steps, args.seed, args.device, resume=args.resume,
    ), indent=2))


if __name__ == "__main__":
    main()
