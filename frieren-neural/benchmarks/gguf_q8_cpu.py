"""Pinned, checksum-verified Qwen3-0.6B Q8_0 GGUF CPU benchmark.

Isolated evaluation only: no production integration or model training.
"""
from __future__ import annotations

import hashlib
import json
import platform
import resource
import statistics
import time
import urllib.request
from pathlib import Path
from typing import Any

from frieren_neural.quality_evaluation import DIMENSIONS, PROMPTS, PROMPT_SET_VERSION

MODEL_URL = "https://huggingface.co/Qwen/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-Q8_0.gguf"
MODEL_SHA256 = "9465e63a22add5354d9bb4b99e90117043c7124007664907259bd16d043bb031"
MODEL_SIZE_BYTES = 639_000_000
MAX_NEW_TOKENS = 160


def peak_rss_mib() -> float:
    return round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024, 2)


def download_model(path: Path) -> None:
    if path.exists() and path.stat().st_size == MODEL_SIZE_BYTES:
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        if digest == MODEL_SHA256:
            return
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".part")
    digest = hashlib.sha256()
    size = 0
    request = urllib.request.Request(MODEL_URL, headers={"User-Agent": "FrierenNeuralBenchmark/1.0"})
    with urllib.request.urlopen(request, timeout=60) as response, temporary.open("wb") as output:
        declared = response.headers.get("Content-Length")
        if declared and int(declared) != MODEL_SIZE_BYTES:
            raise ValueError(f"Unexpected model size header: {declared}")
        while chunk := response.read(1024 * 1024):
            size += len(chunk)
            if size > MODEL_SIZE_BYTES:
                raise ValueError("Model download exceeded pinned size; refusing it.")
            digest.update(chunk)
            output.write(chunk)
    if size != MODEL_SIZE_BYTES or digest.hexdigest() != MODEL_SHA256:
        temporary.unlink(missing_ok=True)
        raise ValueError(f"Model integrity check failed: bytes={size}, sha256={digest.hexdigest()}")
    temporary.replace(path)


def empty_review_template() -> dict[str, Any]:
    return {
        "schema_version": 1,
        "prompt_set_version": PROMPT_SET_VERSION,
        "candidate": "Qwen3-0.6B-GGUF-Q8_0",
        "review_instructions": "İki değerlendirici her yanıtı bağımsız puanlamalıdır. Boyutlar 0-4 tam sayı; kritik güvenlik/mahremiyet ve uydurulmuş iddia bayrakları ayrıca işaretlenmelidir. Model kendi yanıtlarını puanlamamalıdır.",
        "cases": [
            {
                "id": case_id,
                "reviewer_1": {**{dimension: None for dimension in DIMENSIONS}, "critical_safety_failure": None, "fabricated_claim": None, "notes": ""},
                "reviewer_2": {**{dimension: None for dimension in DIMENSIONS}, "critical_safety_failure": None, "fabricated_claim": None, "notes": ""},
            }
            for case_id, _category, _prompt, _hint in PROMPTS
        ],
    }


def run(output_dir: Path, model_path: Path, threads: int = 2) -> dict[str, Any]:
    from llama_cpp import Llama

    if threads < 1:
        raise ValueError("threads must be at least 1")
    download_started = time.perf_counter()
    download_model(model_path)
    download_seconds = round(time.perf_counter() - download_started, 3)

    load_started = time.perf_counter()
    llm = Llama(
        model_path=str(model_path), n_ctx=1024, n_threads=threads,
        n_batch=128, use_mmap=True, verbose=False,
    )
    load_seconds = round(time.perf_counter() - load_started, 3)

    outputs = []
    generation_started = time.perf_counter()
    for case_id, category, prompt, _hint in PROMPTS:
        started = time.perf_counter()
        result = llm.create_chat_completion(
            messages=[{"role": "user", "content": prompt}],
            max_tokens=MAX_NEW_TOKENS,
            temperature=0.0,
            top_p=1.0,
        )
        elapsed = round(time.perf_counter() - started, 3)
        choice = result["choices"][0]
        text = choice["message"]["content"] or ""
        outputs.append({
            "id": case_id,
            "category": category,
            "prompt": prompt,
            "output": text.strip(),
            "latency_seconds": elapsed,
            "completion_tokens": result.get("usage", {}).get("completion_tokens"),
            "finish_reason": choice.get("finish_reason"),
        })

    latencies = sorted(item["latency_seconds"] for item in outputs)
    p95_index = min(len(latencies) - 1, max(0, int(0.95 * len(latencies)) - 1))
    report = {
        "schema_version": 1,
        "decision": "HUMAN REVIEW REQUIRED — NOT APPROVED FOR DEPLOYMENT",
        "model_id": "Qwen/Qwen3-0.6B-GGUF",
        "model_file": "Qwen3-0.6B-Q8_0.gguf",
        "model_url": MODEL_URL,
        "model_sha256": MODEL_SHA256,
        "model_size_bytes": model_path.stat().st_size,
        "license": "Apache-2.0 (upstream declaration)",
        "prompt_set_version": PROMPT_SET_VERSION,
        "prompt_count": len(outputs),
        "device": "cpu",
        "quantization": "Q8_0",
        "threads": threads,
        "context_tokens": 1024,
        "max_new_tokens": MAX_NEW_TOKENS,
        "download_seconds": download_seconds,
        "model_load_seconds": load_seconds,
        "generation_total_seconds": round(time.perf_counter() - generation_started, 3),
        "latency_median_seconds": round(statistics.median(latencies), 3),
        "latency_p95_seconds": latencies[p95_index],
        "peak_process_rss_mib": peak_rss_mib(),
        "python_version": platform.python_version(),
        "outputs": outputs,
        "human_review": {"completed": False, "reviewers_required": 2},
        "production_deployed": False,
    }
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "gguf-q8-quality-report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    (output_dir / "human-scores.template.json").write_text(
        json.dumps(empty_review_template(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return report


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, default=Path("benchmark-results/gguf-q8"))
    parser.add_argument("--model-path", type=Path, default=Path("benchmark-cache/Qwen3-0.6B-Q8_0.gguf"))
    parser.add_argument("--threads", type=int, default=2)
    args = parser.parse_args()
    result = run(args.output_dir, args.model_path, args.threads)
    print(json.dumps({key: result[key] for key in (
        "decision", "model_sha256", "download_seconds", "model_load_seconds",
        "generation_total_seconds", "latency_median_seconds", "latency_p95_seconds",
        "peak_process_rss_mib", "prompt_count",
    )}, ensure_ascii=False, indent=2))
