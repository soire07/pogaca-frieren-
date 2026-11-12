"""Validate and compare matched Qwen3 CPU benchmark reports."""
from __future__ import annotations

import hashlib
import json
import statistics
from pathlib import Path
from typing import Any


def _outputs_digest(outputs: list[dict[str, Any]]) -> str:
    canonical = json.dumps(outputs, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def build_comparison(candidate: dict[str, Any], baseline: dict[str, Any]) -> dict[str, Any]:
    """Compare only reports produced with the same prompts and inference settings."""
    invariant_keys = (
        "prompt_set_version", "prompt_count", "device", "threads",
        "context_tokens", "max_new_tokens", "decoding_settings",
    )
    mismatches = [key for key in invariant_keys if candidate.get(key) != baseline.get(key)]
    if mismatches:
        raise ValueError(f"Benchmark conditions differ: {', '.join(mismatches)}")

    candidate_outputs = candidate.get("outputs")
    baseline_outputs = baseline.get("outputs")
    if not isinstance(candidate_outputs, list) or not isinstance(baseline_outputs, list):
        raise ValueError("Both reports must contain output arrays.")
    candidate_prompts = [(item.get("id"), item.get("prompt")) for item in candidate_outputs]
    baseline_prompts = [(item.get("id"), item.get("prompt")) for item in baseline_outputs]
    if len(candidate_outputs) != candidate.get("prompt_count") or candidate_prompts != baseline_prompts:
        raise ValueError("Prompt IDs/order/text must match exactly in both reports.")

    candidate_generation = float(candidate["generation_total_seconds"])
    baseline_generation = float(baseline["generation_total_seconds"])
    if candidate_generation <= 0 or baseline_generation <= 0:
        raise ValueError("Generation durations must be positive.")

    per_case = []
    for larger, smaller in zip(candidate_outputs, baseline_outputs):
        per_case.append({
            "id": larger["id"],
            "candidate_latency_seconds": larger["latency_seconds"],
            "baseline_latency_seconds": smaller["latency_seconds"],
        })

    return {
        "schema_version": 1,
        "decision": "PERFORMANCE_COMPARISON_ONLY — HUMAN QUALITY REVIEW REQUIRED",
        "conditions_match": True,
        "prompt_set_version": candidate["prompt_set_version"],
        "prompt_count": candidate["prompt_count"],
        "threads": candidate["threads"],
        "context_tokens": candidate["context_tokens"],
        "max_new_tokens": candidate["max_new_tokens"],
        "decoding_settings": candidate["decoding_settings"],
        "candidate": {
            "model_id": candidate["model_id"],
            "model_sha256": candidate["model_sha256"],
            "model_size_bytes": candidate["model_size_bytes"],
            "generation_total_seconds": candidate_generation,
            "latency_median_seconds": candidate["latency_median_seconds"],
            "latency_p95_seconds": candidate["latency_p95_seconds"],
            "peak_process_rss_mib": candidate["peak_process_rss_mib"],
            "outputs_sha256": _outputs_digest(candidate_outputs),
        },
        "baseline": {
            "model_id": baseline["model_id"],
            "model_sha256": baseline["model_sha256"],
            "model_size_bytes": baseline["model_size_bytes"],
            "generation_total_seconds": baseline_generation,
            "latency_median_seconds": baseline["latency_median_seconds"],
            "latency_p95_seconds": baseline["latency_p95_seconds"],
            "peak_process_rss_mib": baseline["peak_process_rss_mib"],
            "outputs_sha256": _outputs_digest(baseline_outputs),
        },
        "baseline_generation_speedup_factor": round(candidate_generation / baseline_generation, 3),
        "per_case_latency": per_case,
        "human_quality_scores": None,
        "human_review_required": True,
        "production_approval": False,
    }


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--candidate", type=Path, required=True)
    parser.add_argument("--baseline", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    candidate = json.loads(args.candidate.read_text(encoding="utf-8"))
    baseline = json.loads(args.baseline.read_text(encoding="utf-8"))
    comparison = build_comparison(candidate, baseline)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(comparison, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "conditions_match": comparison["conditions_match"],
        "baseline_generation_speedup_factor": comparison["baseline_generation_speedup_factor"],
        "candidate_peak_process_rss_mib": comparison["candidate"]["peak_process_rss_mib"],
        "baseline_peak_process_rss_mib": comparison["baseline"]["peak_process_rss_mib"],
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
