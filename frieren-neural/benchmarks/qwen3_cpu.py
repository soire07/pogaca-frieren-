"""Isolated, CPU-only benchmark for the pinned Qwen3-0.6B instruction model.

This is an evaluation adapter only. It never modifies Frieren Neural checkpoints,
training data, production services, or deployment configuration.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import platform
import resource
import statistics
import time
from pathlib import Path
from typing import Any

from frieren_neural.quality_evaluation import PROMPTS, PROMPT_SET_VERSION, empty_score_template

MODEL_ID = "Qwen/Qwen3-0.6B"
MODEL_REVISION = "c1899de289a04d12100db370d81485cdf75e47ca"
MODEL_LICENSE = "Apache-2.0"
MAX_NEW_TOKENS = 256


def benchmark_prompt_digest() -> str:
    payload = json.dumps(
        [{"id": case_id, "category": category, "prompt": prompt}
         for case_id, category, prompt, _hint in PROMPTS],
        ensure_ascii=False, separators=(",", ":"), sort_keys=True,
    ).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def peak_rss_mib() -> float:
    # Linux reports ru_maxrss in KiB; macOS reports bytes.
    value = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    return round(value / (1024 if platform.system() == "Linux" else 1024 * 1024), 2)


def build_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Qwen3-0.6B CPU benchmark",
        "",
        f"- Decision: **{report['decision']}**",
        f"- Model: {report['model_id']} @ `{report['model_revision']}`",
        f"- License: {report['license']}",
        f"- Prompt set: {report['prompt_set_version']} ({report['prompt_count']} cases)",
        f"- Prompt SHA-256: `{report['prompt_set_sha256']}`",
        f"- Device / dtype: {report['device']} / {report['dtype']}",
        f"- Model load seconds: {report['model_load_seconds']}",
        f"- Generation total seconds: {report['generation_total_seconds']}",
        f"- Per-case latency median / p95: {report['latency_median_seconds']} / {report['latency_p95_seconds']} seconds",
        f"- Peak process RSS: {report['peak_rss_mib']} MiB",
        f"- Runtime: Python {report['python_version']}; PyTorch {report['torch_version']}; Transformers {report['transformers_version']}",
        "",
        "## Responses",
        "",
    ]
    for item in report["outputs"]:
        lines.extend([
            f"### {item['id']} — {item['category']}", "",
            f"Prompt: {item['prompt']}", "", "Output:", "",
            item["output"] or "(empty)", "",
            f"Latency: {item['latency_seconds']} seconds", "",
        ])
    lines.extend([
        "## Review status", "",
        "No model-generated score is used. Two independent human reviews and a comparable, human-scored baseline are still required.",
        "This run is a hardware/runtime and response-quality evidence artifact, not approval for deployment.", "",
    ])
    return "\n".join(lines)


def run_benchmark(output_dir: Path, *, limit: int | None = None, threads: int = 2) -> dict[str, Any]:
    import torch
    import transformers
    from transformers import AutoModelForCausalLM, AutoTokenizer

    if threads < 1:
        raise ValueError("threads must be at least 1")
    torch.set_num_threads(threads)
    cases = PROMPTS[:limit] if limit is not None else PROMPTS
    if len(cases) != len(PROMPTS):
        raise ValueError("A release benchmark must run all 24 fixed prompts; --limit is only for local smoke tests.")

    started = time.perf_counter()
    tokenizer = AutoTokenizer.from_pretrained(
        MODEL_ID, revision=MODEL_REVISION, trust_remote_code=False,
    )
    model = AutoModelForCausalLM.from_pretrained(
        MODEL_ID, revision=MODEL_REVISION, torch_dtype=torch.float32,
        low_cpu_mem_usage=True, trust_remote_code=False,
    )
    model.to("cpu")
    model.eval()
    load_seconds = round(time.perf_counter() - started, 3)

    outputs: list[dict[str, Any]] = []
    generation_started = time.perf_counter()
    with torch.inference_mode():
        for case_index, (case_id, category, prompt, _hint) in enumerate(cases):
            encoded = tokenizer.apply_chat_template(
                [{"role": "user", "content": prompt}],
                tokenize=True, add_generation_prompt=True,
                enable_thinking=False, return_dict=True, return_tensors="pt",
            )
            input_ids = encoded["input_ids"].to("cpu")
            attention_mask = encoded.get("attention_mask")
            if attention_mask is not None:
                attention_mask = attention_mask.to("cpu")
            torch.manual_seed(20261101 + case_index)
            started_case = time.perf_counter()
            generated = model.generate(
                input_ids=input_ids, attention_mask=attention_mask,
                max_new_tokens=MAX_NEW_TOKENS, do_sample=True,
                temperature=0.7, top_p=0.8, top_k=20, repetition_penalty=1.1,
                use_cache=True, pad_token_id=tokenizer.eos_token_id,
                eos_token_id=tokenizer.eos_token_id,
            )
            elapsed = round(time.perf_counter() - started_case, 3)
            response_ids = generated[0, input_ids.shape[1]:]
            response = tokenizer.decode(response_ids, skip_special_tokens=True).strip()
            outputs.append({
                "id": case_id, "category": category, "prompt": prompt,
                "output": response, "latency_seconds": elapsed,
                "generated_tokens": int(response_ids.numel()),
            })

    latencies = [item["latency_seconds"] for item in outputs]
    sorted_latencies = sorted(latencies)
    p95_index = min(len(sorted_latencies) - 1, max(0, int(0.95 * len(sorted_latencies)) - 1))
    report: dict[str, Any] = {
        "schema_version": 1,
        "decision": "HUMAN REVIEW REQUIRED — NOT APPROVED FOR DEPLOYMENT",
        "model_id": MODEL_ID, "model_revision": MODEL_REVISION,
        "license": MODEL_LICENSE, "prompt_set_version": PROMPT_SET_VERSION,
        "prompt_count": len(cases), "prompt_set_sha256": benchmark_prompt_digest(),
        "device": "cpu", "dtype": "float32", "threads": threads,
        "max_new_tokens": MAX_NEW_TOKENS,
        "decoding_settings": {"do_sample": True, "temperature": 0.7, "top_p": 0.8, "top_k": 20, "repetition_penalty": 1.1, "seed_base": 20261101},
        "model_load_seconds": load_seconds,
        "generation_total_seconds": round(time.perf_counter() - generation_started, 3),
        "latency_median_seconds": round(statistics.median(latencies), 3),
        "latency_p95_seconds": sorted_latencies[p95_index],
        "peak_rss_mib": peak_rss_mib(),
        "python_version": platform.python_version(),
        "torch_version": torch.__version__,
        "transformers_version": transformers.__version__,
        "outputs": outputs,
        "human_review": {"completed": False, "reviewers_required": 2},
        "production_deployed": False,
    }
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "qwen3-quality-report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8",
    )
    (output_dir / "qwen3-quality-report.md").write_text(
        build_markdown(report), encoding="utf-8",
    )
    (output_dir / "human-scores.template.json").write_text(
        json.dumps(empty_score_template(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8",
    )
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, default=Path("benchmark-results/qwen3-0.6b"))
    parser.add_argument("--threads", type=int, default=2)
    args = parser.parse_args()
    report = run_benchmark(args.output_dir, threads=args.threads)
    print(json.dumps({key: report[key] for key in (
        "decision", "model_revision", "prompt_count", "model_load_seconds",
        "generation_total_seconds", "latency_median_seconds", "latency_p95_seconds",
        "peak_rss_mib",
    )}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
