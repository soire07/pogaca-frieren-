"""Greedy 160-token benchmark of the preserved scratch checkpoint artifact."""
from __future__ import annotations

import argparse
import hashlib
import json
import platform
import re
import resource
import statistics
import time
from pathlib import Path
from typing import Any

import torch

from frieren_neural.quality_evaluation import (
    PROMPTS, PROMPT_SET_VERSION, empty_score_template, format_benchmark_prompt,
)
from frieren_neural.training import encode_generation_prompt, load_checkpoint

MAX_NEW_TOKENS = 160
EXPECTED_CHECKPOINT_SHA256 = "1f29fa42d0a98722181b37d24903385774b49eb52cc439696113a9574da672b7"


def peak_rss_mib() -> float:
    value = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    return round(value / (1024 if platform.system() == "Linux" else 1024 * 1024), 2)


def greedy_generate(model: Any, tokenizer: Any, prompt: str) -> tuple[str, int]:
    model_prompt = format_benchmark_prompt(prompt)
    prompt_ids = encode_generation_prompt(model_prompt, tokenizer)
    generated = torch.tensor([prompt_ids], dtype=torch.long, device=next(model.parameters()).device)
    generated_count = 0
    model.eval()
    with torch.inference_mode():
        for _ in range(MAX_NEW_TOKENS):
            context = generated[:, -model.config.max_seq_len:]
            logits = model(context)[:, -1, :]
            next_token = torch.argmax(logits, dim=-1, keepdim=True)
            token_id = int(next_token.item())
            generated = torch.cat((generated, next_token), dim=1)
            generated_count += 1
            if token_id == tokenizer.eos_id:
                break
    completion_ids = generated[0, len(prompt_ids):].tolist()
    if tokenizer.eos_id in completion_ids:
        completion_ids = completion_ids[:completion_ids.index(tokenizer.eos_id)]
    response = tokenizer.decode(completion_ids).strip()
    role_boundary = re.search(r"(?:^|\n)(?:Kullanıcı|Asistan):(?: |$)", response)
    if role_boundary:
        response = response[:role_boundary.start()].strip()
    return response, generated_count


def run(checkpoint: Path, output_dir: Path, threads: int = 2) -> dict[str, Any]:
    if threads < 1:
        raise ValueError("threads must be at least 1")
    if not checkpoint.is_file():
        raise FileNotFoundError(f"Checkpoint not found: {checkpoint}")
    checkpoint_sha = hashlib.sha256(checkpoint.read_bytes()).hexdigest()
    if checkpoint_sha != EXPECTED_CHECKPOINT_SHA256:
        raise ValueError(f"Checkpoint SHA-256 mismatch: {checkpoint_sha}")
    torch.set_num_threads(threads)
    load_started = time.perf_counter()
    model, tokenizer, metadata = load_checkpoint(checkpoint, device="cpu")
    load_seconds = round(time.perf_counter() - load_started, 3)

    outputs = []
    generation_started = time.perf_counter()
    for case_id, category, prompt, _hint in PROMPTS:
        started = time.perf_counter()
        response, generated_tokens = greedy_generate(model, tokenizer, prompt)
        outputs.append({
            "id": case_id, "category": category, "prompt": prompt,
            "output": response, "latency_seconds": round(time.perf_counter() - started, 3),
            "generated_tokens": generated_tokens,
        })
    latencies = sorted(item["latency_seconds"] for item in outputs)
    p95_index = min(len(latencies) - 1, max(0, int(0.95 * len(latencies)) - 1))
    report = {
        "schema_version": 1,
        "decision": "NOT READY — historical scratch checkpoint; human review required",
        "candidate": "Frieren Neural scratch checkpoint",
        "checkpoint_sha256": checkpoint_sha,
        "checkpoint_step": int(metadata["step"]),
        "checkpoint_metadata": metadata,
        "prompt_set_version": PROMPT_SET_VERSION,
        "prompt_count": len(outputs),
        "device": "cpu",
        "threads": threads,
        "decoding": "greedy argmax",
        "max_new_tokens": MAX_NEW_TOKENS,
        "model_load_seconds": load_seconds,
        "generation_total_seconds": round(time.perf_counter() - generation_started, 3),
        "latency_median_seconds": round(statistics.median(latencies), 3),
        "latency_p95_seconds": latencies[p95_index],
        "peak_process_rss_mib": peak_rss_mib(),
        "python_version": platform.python_version(),
        "torch_version": torch.__version__,
        "outputs": outputs,
        "human_review": {"completed": False, "reviewers_required": 2},
        "production_deployed": False,
        "historical_checkpoint_objective": metadata.get("loss_objective_version"),
    }
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "scratch-greedy-quality-report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    (output_dir / "human-scores.template.json").write_text(
        json.dumps(empty_score_template(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--checkpoint", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, default=Path("benchmark-results/scratch-greedy"))
    parser.add_argument("--threads", type=int, default=2)
    args = parser.parse_args()
    result = run(args.checkpoint, args.output_dir, args.threads)
    print(json.dumps({key: result[key] for key in (
        "decision", "checkpoint_sha256", "checkpoint_step", "prompt_count",
        "model_load_seconds", "generation_total_seconds", "latency_median_seconds",
        "latency_p95_seconds", "peak_process_rss_mib",
    )}, ensure_ascii=False, indent=2))
