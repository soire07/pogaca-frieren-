"""Independent held-out and fixed-prompt evaluation for native Neural v2 checkpoints."""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import random
from pathlib import Path
from typing import Any, Sequence

import torch

from .chat_format import format_benchmark_prompt
from .native_runtime import generate_native_text, load_native_checkpoint
from .quality_evaluation import (
    DECODING_SETTINGS,
    build_report,
    empty_score_template,
    load_prompt_set,
    render_markdown,
)
from .training import DIALOGUE_SEPARATOR, encode_dialogue_stream_with_loss_mask, load_licensed_corpus

EVALUATION_VERSION = "native-heldout-v1"


def _load_split(paths: Sequence[str | Path]) -> tuple[str, list[dict[str, Any]], list[str]]:
    if not paths:
        raise ValueError("At least one independent heldout corpus directory is required.")
    documents: list[str] = []
    manifests: list[dict[str, Any]] = []
    raw_manifests: list[bytes] = []
    for path in paths:
        root = Path(path)
        documents.extend(load_licensed_corpus(root))
        raw = (root / "corpus_manifest.json").read_bytes()
        manifest = json.loads(raw.decode("utf-8"))
        manifests.append(manifest)
        raw_manifests.append(raw)
    if not documents:
        raise ValueError("Heldout corpus contains no documents.")
    digest = hashlib.sha256()
    for raw in raw_manifests:
        digest.update(len(raw).to_bytes(8, "big"))
        digest.update(raw)
    licenses = sorted({
        entry["license"]
        for manifest in manifests
        for entry in manifest["documents"]
    })
    sources = sorted({
        entry["source"]
        for manifest in manifests
        for entry in manifest["documents"]
    })
    return DIALOGUE_SEPARATOR.join(documents), manifests, [digest.hexdigest(), *licenses, *sources]


@torch.no_grad()
def evaluate_native_heldout(
    model: torch.nn.Module,
    tokenizer: Any,
    heldout_text: str,
    *,
    device: str = "cpu",
) -> dict[str, Any]:
    """Compute token-weighted cross entropy over every assistant target in heldout data."""
    token_ids, loss_mask = encode_dialogue_stream_with_loss_mask(heldout_text, tokenizer)
    if len(token_ids) < 3 or not any(loss_mask[1:]):
        raise ValueError("Heldout split must contain assistant response targets.")
    target_device = torch.device(device)
    ids = torch.tensor(token_ids, dtype=torch.long)
    mask = torch.tensor(loss_mask, dtype=torch.bool)
    was_training = model.training
    model.eval()
    total_loss = 0.0
    total_targets = 0
    try:
        context_size = int(model.config.max_seq_len)
        for start in range(0, len(ids) - 1, context_size):
            stop = min(start + context_size, len(ids) - 1)
            x = ids[start:stop].unsqueeze(0).to(target_device)
            target_ids = ids[start + 1:stop + 1]
            target_mask = mask[start + 1:stop + 1]
            count = int(target_mask.sum().item())
            if count == 0:
                continue
            y = target_ids.masked_fill(~target_mask, -100).unsqueeze(0).to(target_device)
            _, loss = model(x, targets=y)
            total_loss += float(loss.item()) * count
            total_targets += count
    finally:
        model.train(was_training)
    if total_targets == 0:
        raise ValueError("Heldout split produced no supervised assistant targets.")
    average_loss = total_loss / total_targets
    return {
        "split": "heldout",
        "evaluation_version": EVALUATION_VERSION,
        "loss": average_loss,
        "perplexity": math.exp(min(average_loss, 80.0)),
        "sample_count": total_targets,
        "dataset_sha256": hashlib.sha256(heldout_text.encode("utf-8")).hexdigest(),
        "loss_objective_version": 2,
    }


def evaluate_native_checkpoint(
    checkpoint_path: str | Path,
    heldout_dirs: Sequence[str | Path],
    output_dir: str | Path,
    *,
    device: str = "cpu",
) -> dict[str, Any]:
    checkpoint = Path(checkpoint_path)
    if not checkpoint.is_file():
        raise FileNotFoundError(f"Native checkpoint not found: {checkpoint}")
    loaded = load_native_checkpoint(checkpoint, device=device)
    if loaded is None:
        raise ValueError("The supplied checkpoint is not a native Neural v2 checkpoint.")
    model, tokenizer, metadata = loaded
    heldout_text, manifests, provenance_values = _load_split(heldout_dirs)
    heldout = evaluate_native_heldout(model, tokenizer, heldout_text, device=device)
    heldout["checkpoint_training_loss_objective_version"] = 2

    outputs = []
    for item in load_prompt_set():
        random.seed(DECODING_SETTINGS["seed"])
        torch.manual_seed(DECODING_SETTINGS["seed"])
        prompt = format_benchmark_prompt(item["prompt"])
        generated = generate_native_text(
            model, tokenizer, prompt,
            max_new_tokens=DECODING_SETTINGS["max_new_tokens"],
            temperature=DECODING_SETTINGS["temperature"],
            top_k=DECODING_SETTINGS["top_k"],
        )
        outputs.append({
            "id": item["id"], "category": item["category"], "prompt": item["prompt"],
            "model_prompt": prompt, "review_hint": item["review_hint"], "output": generated.strip(),
        })

    checkpoint_sha = hashlib.sha256(checkpoint.read_bytes()).hexdigest()
    manifest_sha = provenance_values[0]
    licenses = sorted(set(metadata["licenses"]) | set(provenance_values[1:]))
    sources = sorted({
        entry["source"]
        for manifest in manifests
        for entry in manifest["documents"]
    })
    training_provenance = {
        "manifest_sha256": manifest_sha,
        "licenses": licenses,
        "sources": sources,
    }
    checkpoint_metadata = {
        **metadata,
        "tokenizer_type": "byte_pair_encoding",
        "tokenizer_vocab_size": tokenizer.vocab_size,
        "dialogue_encoding_version": 2,
        "loss_objective_version": 2,
        "training_objective": "assistant_response_only",
    }
    report = build_report(
        checkpoint_sha256=checkpoint_sha,
        checkpoint_step=int(metadata["step"]),
        outputs=outputs,
        scores=None,
        checkpoint_metadata=checkpoint_metadata,
        training_provenance=training_provenance,
        heldout_metrics=heldout,
        model_backend="scratch",
        artifact_sha256=checkpoint_sha,
    )
    report["heldout_metrics"] = heldout
    report["training_provenance"] = training_provenance
    report["checkpoint_metadata"] = checkpoint_metadata

    destination = Path(output_dir)
    destination.mkdir(parents=True, exist_ok=True)
    (destination / "quality-report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    (destination / "quality-report.md").write_text(
        render_markdown(report), encoding="utf-8"
    )
    (destination / "human-scores.template.json").write_text(
        json.dumps(empty_score_template(), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps({
        "decision": report["decision"],
        "checkpoint_sha256": checkpoint_sha,
        "checkpoint_step": metadata["step"],
        "heldout_loss": heldout["loss"],
        "heldout_perplexity": heldout["perplexity"],
        "heldout_supervised_tokens": heldout["sample_count"],
        "prompt_count": len(outputs),
        "report_dir": str(destination),
        "blocking_reasons": report["blocking_reasons"],
    }, ensure_ascii=False, indent=2))
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate native Neural v2 on independent heldout data and fixed Turkish prompts.")
    parser.add_argument("--checkpoint", required=True)
    parser.add_argument("--heldout", action="append", required=True)
    parser.add_argument("--output-dir", default="quality-reports/native-v2")
    parser.add_argument("--device", choices=("cpu", "cuda"), default="cpu")
    args = parser.parse_args()
    evaluate_native_checkpoint(args.checkpoint, args.heldout, args.output_dir, device=args.device)


if __name__ == "__main__":
    main()
