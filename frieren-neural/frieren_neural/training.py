"""Small, resumable next-token training pipeline for Frieren Neural."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import random
import tempfile
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Sequence

import torch
from torch import Tensor

from .model import GPTConfig, GPTLanguageModel
from .tokenizer import BPETokenizer


SUPPORTED_SUFFIXES = {".txt", ".md"}


@dataclass(frozen=True)
class TrainingConfig:
    max_steps: int = 1_000
    eval_interval: int = 100
    eval_batches: int = 20
    batch_size: int = 16
    block_size: int = 128
    learning_rate: float = 3e-4
    weight_decay: float = 0.1
    validation_fraction: float = 0.1
    seed: int = 1337
    d_model: int = 128
    n_heads: int = 4
    n_layers: int = 4
    dropout: float = 0.1
    grad_clip: float = 1.0
    tokenizer_vocab_size: int = 512
    tokenizer_min_frequency: int = 2

    def __post_init__(self) -> None:
        if self.max_steps < 1 or self.eval_interval < 1 or self.eval_batches < 1:
            raise ValueError("Training steps and evaluation intervals must be positive.")
        if self.batch_size < 1 or self.block_size < 2:
            raise ValueError("batch_size must be positive and block_size must be at least 2.")
        if self.learning_rate <= 0 or self.weight_decay < 0 or self.grad_clip <= 0:
            raise ValueError("Learning rate and gradient clipping must be positive; weight decay cannot be negative.")
        if not 0.0 < self.validation_fraction < 0.5:
            raise ValueError("validation_fraction must be between 0 and 0.5.")
        if self.d_model < 1 or self.n_heads < 1 or self.n_layers < 1 or self.d_model % self.n_heads:
            raise ValueError("Model dimensions must be positive and d_model divisible by n_heads.")
        if not 0.0 <= self.dropout < 1.0:
            raise ValueError("dropout must be in [0, 1).")
        if self.tokenizer_vocab_size < BPETokenizer.BASE_VOCAB_SIZE or self.tokenizer_min_frequency < 1:
            raise ValueError("BPE vocabulary must be at least 260 and minimum frequency must be positive.")


def load_text_corpus(path: str | Path) -> list[str]:
    """Load UTF-8 .txt/.md documents from a file or directory in stable order."""
    root = Path(path)
    if not root.exists():
        raise FileNotFoundError(f"Corpus path does not exist: {root}")
    files = [root] if root.is_file() else sorted(
        item for item in root.rglob("*") if item.is_file() and item.suffix.lower() in SUPPORTED_SUFFIXES
    )
    documents: list[str] = []
    for file_path in files:
        if file_path.suffix.lower() not in SUPPORTED_SUFFIXES:
            continue
        text = file_path.read_text(encoding="utf-8").strip()
        if text:
            documents.append(text)
    if not documents:
        raise ValueError(f"No non-empty UTF-8 .txt or .md documents found in {root}")
    return documents



def load_licensed_corpus(path: str | Path) -> list[str]:
    """Load a corpus only when every text file has explicit source/license metadata."""
    root = Path(path)
    if not root.is_dir():
        raise ValueError("Licensed corpus path must be a directory.")
    root_resolved = root.resolve()
    manifest_path = root / "corpus_manifest.json"
    if not manifest_path.is_file() or not manifest_path.resolve().is_relative_to(root_resolved):
        raise ValueError("A corpus_manifest.json file inside the corpus directory is required before CLI training.")
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ValueError("corpus_manifest.json must be valid UTF-8 JSON.") from error
    entries = manifest.get("documents") if isinstance(manifest, dict) else None
    if not isinstance(manifest, dict) or manifest.get("schema_version") != 1 or not isinstance(entries, list) or not entries:
        raise ValueError("Corpus manifest must use schema_version 1 and contain a non-empty documents list.")

    declared: set[str] = set()
    documents: list[str] = []
    for entry in entries:
        if not isinstance(entry, dict):
            raise ValueError("Each corpus manifest document must be an object.")
        relative_path = entry.get("path")
        metadata = (entry.get("source"), entry.get("license"), entry.get("usage"))
        if (not isinstance(relative_path, str) or not relative_path.strip()
                or any(not isinstance(value, str) or not value.strip() or "replace" in value.lower()
                       for value in metadata)):
            raise ValueError("Every corpus entry needs a path, source, license, and usage description.")
        file_path = (root / relative_path).resolve()
        if not file_path.is_relative_to(root_resolved):
            raise ValueError(f"Corpus file must stay inside the corpus directory: {relative_path}")
        if file_path.suffix.lower() not in SUPPORTED_SUFFIXES or not file_path.is_file():
            raise ValueError(f"Corpus file must exist and end in .txt or .md: {relative_path}")
        canonical_path = file_path.relative_to(root_resolved).as_posix()
        if canonical_path in declared:
            raise ValueError(f"Duplicate corpus manifest path: {canonical_path}")
        declared.add(canonical_path)
        content = file_path.read_text(encoding="utf-8").strip()
        if not content:
            raise ValueError(f"Corpus file is empty: {canonical_path}")
        documents.append(content)

    actual_files: set[str] = set()
    for file_path in root.rglob("*"):
        if file_path.is_file() and file_path.suffix.lower() in SUPPORTED_SUFFIXES:
            resolved = file_path.resolve()
            if not resolved.is_relative_to(root_resolved):
                raise ValueError("Corpus symlinks must not point outside the corpus directory.")
            actual_files.add(resolved.relative_to(root_resolved).as_posix())
    if actual_files != declared:
        raise ValueError("Manifest paths must exactly match all .txt/.md files in the corpus directory.")
    return documents


def split_corpus_text(
    documents: Sequence[str], validation_fraction: float = 0.1
) -> tuple[str, str]:
    """Chronologically split raw text before tokenizer training to prevent validation leakage."""
    if not documents or any(not isinstance(item, str) or not item.strip() for item in documents):
        raise ValueError("documents must contain non-empty strings.")
    if not 0.0 < validation_fraction < 0.5:
        raise ValueError("validation_fraction must be between 0 and 0.5.")
    combined = "\n".join(item.strip() for item in documents)
    validation_size = max(1, int(len(combined) * validation_fraction))
    training_size = len(combined) - validation_size
    if training_size < 2 or validation_size < 2:
        raise ValueError("Corpus text must contain at least four characters for a useful split.")
    return combined[:training_size], combined[training_size:]

def split_tokens(tokens: Tensor, validation_fraction: float = 0.1) -> tuple[Tensor, Tensor]:
    """Split a token stream chronologically to reduce train/validation leakage."""
    if tokens.ndim != 1:
        raise ValueError("tokens must be a one-dimensional tensor.")
    if not 0.0 < validation_fraction < 0.5:
        raise ValueError("validation_fraction must be between 0 and 0.5.")
    validation_size = max(1, int(len(tokens) * validation_fraction))
    training_size = len(tokens) - validation_size
    if training_size < 2 or validation_size < 2:
        raise ValueError("Token stream must contain at least four tokens for a useful split.")
    return tokens[:training_size], tokens[training_size:]


def _sample_batch(
    data: Tensor, *, batch_size: int, block_size: int, device: torch.device, generator: torch.Generator
) -> tuple[Tensor, Tensor]:
    if len(data) <= block_size:
        raise ValueError(f"Each token split must contain more than block_size ({block_size}) tokens.")
    starts = torch.randint(len(data) - block_size, (batch_size,), generator=generator)
    inputs = torch.stack([data[int(start) : int(start) + block_size] for start in starts])
    targets = torch.stack([data[int(start) + 1 : int(start) + block_size + 1] for start in starts])
    return inputs.to(device), targets.to(device)


@torch.no_grad()
def evaluate_loss(
    model: GPTLanguageModel,
    data: Tensor,
    *,
    batch_size: int,
    block_size: int,
    batches: int = 20,
    seed: int = 1337,
) -> float:
    """Return mean next-token loss over deterministic random windows."""
    if batches < 1:
        raise ValueError("batches must be positive.")
    was_training = model.training
    model.eval()
    losses: list[float] = []
    generator = torch.Generator(device="cpu").manual_seed(seed)
    try:
        for _ in range(batches):
            inputs, targets = _sample_batch(
                data, batch_size=batch_size, block_size=block_size,
                device=next(model.parameters()).device, generator=generator
            )
            _, loss = model(inputs, targets=targets)
            losses.append(float(loss.item()))
    finally:
        model.train(was_training)
    return sum(losses) / len(losses)


@torch.no_grad()
def _evaluate_pair(
    model: GPTLanguageModel, train_data: Tensor, validation_data: Tensor, config: TrainingConfig,
    device: torch.device, seed: int,
) -> tuple[float, float]:
    was_training = model.training
    model.eval()
    generator = torch.Generator(device="cpu").manual_seed(seed)
    results = []
    try:
        for data in (train_data, validation_data):
            values = []
            for _ in range(config.eval_batches):
                x, y = _sample_batch(data, batch_size=config.batch_size, block_size=config.block_size,
                                     device=device, generator=generator)
                _, loss = model(x, targets=y)
                values.append(float(loss.item()))
            results.append(sum(values) / len(values))
    finally:
        model.train(was_training)
    return results[0], results[1]


def _atomic_save(payload: dict[str, object], destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary_name: str | None = None
    try:
        with tempfile.NamedTemporaryFile(dir=destination.parent, suffix=".tmp", delete=False) as temporary:
            temporary_name = temporary.name
        torch.save(payload, temporary_name)
        os.replace(temporary_name, destination)
    finally:
        if temporary_name and os.path.exists(temporary_name):
            os.unlink(temporary_name)


def train_model(
    documents: Sequence[str],
    checkpoint_path: str | Path,
    config: TrainingConfig | None = None,
    *,
    resume: bool = False,
    device: str | torch.device | None = None,
) -> dict[str, float | int | str]:
    """Train a small GPT model and atomically save a resumable checkpoint."""
    settings = config or TrainingConfig()
    if not documents or any(not isinstance(item, str) or not item.strip() for item in documents):
        raise ValueError("documents must contain non-empty strings.")
    random.seed(settings.seed)
    torch.manual_seed(settings.seed)
    selected_device = torch.device(device or ("cuda" if torch.cuda.is_available() else "cpu"))
    corpus_fingerprint = hashlib.sha256(json.dumps(list(documents), ensure_ascii=False, separators=(",", ":")).encode("utf-8")).hexdigest()
    train_text, validation_text = split_corpus_text(documents, settings.validation_fraction)
    tokenizer = BPETokenizer.train(
        [train_text], vocab_size=settings.tokenizer_vocab_size, min_frequency=settings.tokenizer_min_frequency
    )
    train_data = torch.tensor(tokenizer.encode(train_text) + [tokenizer.eos_id], dtype=torch.long)
    validation_data = torch.tensor(tokenizer.encode(validation_text) + [tokenizer.eos_id], dtype=torch.long)
    if min(len(train_data), len(validation_data)) <= settings.block_size:
        raise ValueError("Both train and validation splits must be longer than block_size.")

    model_config = GPTConfig(
        vocab_size=tokenizer.vocab_size, d_model=settings.d_model, n_heads=settings.n_heads,
        n_layers=settings.n_layers, max_seq_len=settings.block_size, dropout=settings.dropout
    )
    model = GPTLanguageModel(model_config).to(selected_device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=settings.learning_rate, weight_decay=settings.weight_decay)
    checkpoint = Path(checkpoint_path)
    start_step = 0

    if resume:
        if not checkpoint.is_file():
            raise FileNotFoundError(f"Cannot resume; checkpoint not found: {checkpoint}")
        saved = torch.load(checkpoint, map_location=selected_device, weights_only=True)
        if saved.get("format_version") != 2:
            raise ValueError("Unsupported checkpoint format; start a fresh run with the current trainer.")
        saved_training_config = dict(saved.get("training_config", {}))
        current_training_config = asdict(settings)
        saved_training_config.pop("max_steps", None)
        current_training_config.pop("max_steps", None)
        if (saved.get("model_config") != asdict(model_config)
                or saved.get("tokenizer") != tokenizer.to_dict()
                or saved.get("corpus_sha256") != corpus_fingerprint
                or saved_training_config != current_training_config):
            raise ValueError("Checkpoint corpus/model/training settings do not match this run (max_steps may increase).")
        model.load_state_dict(saved["model_state"])
        optimizer.load_state_dict(saved["optimizer_state"])
        start_step = int(saved["step"])
        if settings.max_steps < start_step:
            raise ValueError("max_steps cannot be lower than the checkpoint step when resuming.")
        train_loss = float(saved["train_loss"])
        validation_loss = float(saved["validation_loss"])

    batch_generator = torch.Generator(device="cpu").manual_seed(settings.seed + start_step)
    if resume:
        batch_generator.set_state(saved["batch_generator_state"].cpu())
        torch.set_rng_state(saved["torch_rng_state"].cpu())
        if selected_device.type == "cuda" and saved.get("cuda_rng_states") is not None:
            torch.cuda.set_rng_state_all(saved["cuda_rng_states"])
    final_step = start_step
    for step in range(start_step + 1, settings.max_steps + 1):
        final_step = step
        model.train()
        x, y = _sample_batch(train_data, batch_size=settings.batch_size, block_size=settings.block_size,
                             device=selected_device, generator=batch_generator)
        _, loss = model(x, targets=y)
        optimizer.zero_grad(set_to_none=True)
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), settings.grad_clip)
        optimizer.step()

        if step % settings.eval_interval == 0 or step == settings.max_steps:
            train_loss, validation_loss = _evaluate_pair(
                model, train_data, validation_data, settings, selected_device, settings.seed + step
            )
            _atomic_save({
                "format_version": 2,
                "step": step,
                "model_config": asdict(model_config),
                "training_config": asdict(settings),
                "tokenizer": tokenizer.to_dict(),
                "corpus_sha256": corpus_fingerprint,
                "model_state": model.state_dict(),
                "optimizer_state": optimizer.state_dict(),
                "batch_generator_state": batch_generator.get_state(),
                "torch_rng_state": torch.get_rng_state(),
                "cuda_rng_states": torch.cuda.get_rng_state_all() if selected_device.type == "cuda" else None,
                "train_loss": train_loss,
                "validation_loss": validation_loss,
            }, checkpoint)

    return {
        "step": final_step,
        "train_loss": train_loss,
        "validation_loss": validation_loss,
        "checkpoint": str(checkpoint),
        "device": str(selected_device),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Train the Frieren Neural language model.")
    parser.add_argument("--data", required=True, help="Directory of UTF-8 .txt/.md files with corpus_manifest.json provenance")
    parser.add_argument("--checkpoint", default="checkpoints/frieren-neural.pt")
    parser.add_argument("--steps", type=int, default=1_000)
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--block-size", type=int, default=128)
    parser.add_argument("--resume", action="store_true")
    parser.add_argument("--device", default=None, help="cpu, cuda, or omit for automatic selection")
    args = parser.parse_args()
    documents = load_licensed_corpus(args.data)
    config = TrainingConfig(max_steps=args.steps, batch_size=args.batch_size, block_size=args.block_size)
    metrics = train_model(documents, args.checkpoint, config, resume=args.resume, device=args.device)
    print(json.dumps(metrics, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()


def load_checkpoint(
    checkpoint_path: str | Path, *, device: str | torch.device | None = None
) -> tuple[GPTLanguageModel, BPETokenizer, dict[str, float | int | str]]:
    """Load a versioned checkpoint using PyTorch's restricted weights-only loader."""
    selected_device = torch.device(device or ("cuda" if torch.cuda.is_available() else "cpu"))
    payload = torch.load(checkpoint_path, map_location=selected_device, weights_only=True)
    if not isinstance(payload, dict) or payload.get("format_version") != 2:
        raise ValueError("Unsupported or invalid Frieren Neural checkpoint.")
    try:
        if not isinstance(payload.get("tokenizer"), dict) or not isinstance(payload.get("model_config"), dict):
            raise ValueError("Checkpoint model/tokenizer payloads must be dictionaries.")
        tokenizer = BPETokenizer.from_dict(payload["tokenizer"])
        model_config = GPTConfig(**payload["model_config"])
        model = GPTLanguageModel(model_config).to(selected_device)
        model.load_state_dict(payload["model_state"])
    except (KeyError, TypeError, ValueError) as error:
        raise ValueError("Checkpoint is missing valid model or tokenizer data.") from error
    model.eval()
    metadata: dict[str, float | int | str] = {
        "step": int(payload["step"]),
        "corpus_sha256": str(payload["corpus_sha256"]),
        "train_loss": float(payload["train_loss"]),
        "validation_loss": float(payload["validation_loss"]),
    }
    return model, tokenizer, metadata


@torch.no_grad()
def generate_text(
    model: GPTLanguageModel,
    tokenizer: BPETokenizer,
    prompt: str,
    *,
    max_new_tokens: int = 80,
    temperature: float = 0.8,
    top_k: int = 40,
) -> str:
    """Generate text from a prompt and stop decoding at the first generated EOS."""
    if not prompt:
        raise ValueError("prompt must not be empty.")
    device = next(model.parameters()).device
    input_ids = torch.tensor([tokenizer.encode(prompt)], dtype=torch.long, device=device)
    generated = model.generate(
        input_ids, max_new_tokens=max_new_tokens, temperature=temperature, top_k=top_k
    )[0].tolist()
    for index in range(len(input_ids[0]), len(generated)):
        if generated[index] == tokenizer.eos_id:
            generated = generated[:index]
            break
    return tokenizer.decode(generated)


def evaluate_checkpoint(
    checkpoint_path: str | Path,
    documents: Sequence[str],
    *,
    batch_size: int = 16,
    batches: int = 20,
    seed: int = 1337,
    device: str | torch.device | None = None,
) -> dict[str, float | int]:
    """Evaluate a checkpoint on a distinct, caller-supplied held-out corpus."""
    if not documents or any(not isinstance(item, str) or not item.strip() for item in documents):
        raise ValueError("Evaluation documents must contain non-empty strings.")
    fingerprint = hashlib.sha256(
        json.dumps(list(documents), ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    model, tokenizer, metadata = load_checkpoint(checkpoint_path, device=device)
    if fingerprint == metadata["corpus_sha256"]:
        raise ValueError("Evaluation corpus must be separate from the training corpus.")
    evaluation_text = "\n".join(item.strip() for item in documents)
    tokens = torch.tensor(tokenizer.encode(evaluation_text) + [tokenizer.eos_id], dtype=torch.long)
    loss = evaluate_loss(
        model, tokens, batch_size=batch_size, block_size=model.config.max_seq_len,
        batches=batches, seed=seed
    )
    try:
        perplexity = math.exp(loss)
    except OverflowError:
        perplexity = math.inf
    return {"step": int(metadata["step"]), "loss": loss, "perplexity": perplexity}


def evaluation_main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate a Frieren Neural checkpoint on a held-out corpus.")
    parser.add_argument("--data", required=True, help="Separate licensed corpus directory with corpus_manifest.json")
    parser.add_argument("--checkpoint", default="checkpoints/frieren-neural.pt")
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--batches", type=int, default=20)
    parser.add_argument("--seed", type=int, default=1337)
    parser.add_argument("--device", default=None)
    args = parser.parse_args()
    documents = load_licensed_corpus(args.data)
    metrics = evaluate_checkpoint(
        args.checkpoint, documents, batch_size=args.batch_size, batches=args.batches,
        seed=args.seed, device=args.device
    )
    print(json.dumps(metrics, ensure_ascii=False, indent=2))
