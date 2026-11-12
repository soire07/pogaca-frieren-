"""Pinned, checksum-verified Qwen3-1.7B Q4_K_M GGUF CPU benchmark.

Isolated evaluation only: no production integration or model training.
"""
from __future__ import annotations

import hashlib
import json
import platform
import re
import resource
import statistics
import time
import urllib.request
from pathlib import Path
from typing import Any

from frieren_neural.quality_evaluation import PROMPTS, PROMPT_SET_VERSION, empty_score_template
from frieren_neural.qwen3_decoding import build_qwen3_chat_request

MODEL_ID = "ggml-org/Qwen3-1.7B-GGUF"
MODEL_FILE = "Qwen3-1.7B-Q4_K_M.gguf"
MODEL_REVISION = "daeb8e2d528a760970442092f6bf1e55c3b659eb"
MODEL_LICENSE = "Apache-2.0 (upstream declaration)"
CANDIDATE_NAME = "Qwen3-1.7B-GGUF-Q4_K_M"
MODEL_URL = f"https://huggingface.co/{MODEL_ID}/resolve/{MODEL_REVISION}/{MODEL_FILE}"
MODEL_SHA256 = "d2387ca2dbfee2ffabce7120d3770dadca0b293052bc2f0e138fdc940d9bc7b5"
MODEL_MAX_SIZE_BYTES = 1400 * 1024 * 1024
MAX_NEW_TOKENS = 256


def peak_rss_mib() -> float:
    return round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024, 2)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def download_model(path: Path) -> None:
    if path.exists() and 0 < path.stat().st_size <= MODEL_MAX_SIZE_BYTES:
        if sha256_file(path) == MODEL_SHA256:
            return
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".part")
    digest = hashlib.sha256()
    size = 0
    request = urllib.request.Request(MODEL_URL, headers={"User-Agent": "FrierenNeuralBenchmark/1.0"})
    with urllib.request.urlopen(request, timeout=60) as response, temporary.open("wb") as output:
        declared = response.headers.get("Content-Length")
        if declared and int(declared) > MODEL_MAX_SIZE_BYTES:
            raise ValueError(f"Model exceeds the 1400 MiB safety cap: {declared}")
        while chunk := response.read(1024 * 1024):
            size += len(chunk)
            if size > MODEL_MAX_SIZE_BYTES:
                raise ValueError("Model download exceeded pinned size; refusing it.")
            digest.update(chunk)
            output.write(chunk)
    if size <= 0 or size > MODEL_MAX_SIZE_BYTES or digest.hexdigest() != MODEL_SHA256:
        temporary.unlink(missing_ok=True)
        raise ValueError(f"Model integrity check failed: bytes={size}, sha256={digest.hexdigest()}")
    temporary.replace(path)


def empty_review_template(outputs: list[dict[str, Any]]) -> dict[str, Any]:
    """Bind two-reviewer scoring to this exact model digest and generated outputs."""
    template = empty_score_template(checkpoint_sha256=MODEL_SHA256, outputs=outputs)
    template["candidate"] = CANDIDATE_NAME
    return template


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
    for case_index, (case_id, category, prompt, _hint) in enumerate(PROMPTS):
        started = time.perf_counter()
        result = llm.create_chat_completion(
            **build_qwen3_chat_request(prompt, seed=20261101 + case_index),
            max_tokens=MAX_NEW_TOKENS,
        )
        elapsed = round(time.perf_counter() - started, 3)
        choice = result["choices"][0]
        raw_text = choice["message"]["content"] or ""
        think_start = raw_text.find("<think>")
        think_end = raw_text.find("</think>", think_start + len("<think>")) if think_start >= 0 else -1
        reasoning_leakage = (
            think_start >= 0
            and (think_end < 0 or bool(raw_text[think_start + len("<think>"):think_end].strip()))
        )
        text = (
            "[REASONING LEAKAGE REDACTED]"
            if reasoning_leakage
            else re.sub(r"<think>\s*</think>\s*", "", raw_text).strip()
        )
        outputs.append({
            "id": case_id,
            "category": category,
            "prompt": prompt,
            "output": text,
            "reasoning_leakage": reasoning_leakage,
            "latency_seconds": elapsed,
            "completion_tokens": result.get("usage", {}).get("completion_tokens"),
            "finish_reason": choice.get("finish_reason"),
        })

    latencies = sorted(item["latency_seconds"] for item in outputs)
    p95_index = min(len(latencies) - 1, max(0, int(0.95 * len(latencies)) - 1))
    report = {
        "schema_version": 1,
        "decision": "HUMAN REVIEW REQUIRED — NOT APPROVED FOR DEPLOYMENT",
        "model_id": MODEL_ID,
        "model_file": MODEL_FILE,
        "model_url": MODEL_URL,
        "model_sha256": MODEL_SHA256,
        "model_size_bytes": model_path.stat().st_size,
        "license": MODEL_LICENSE,
        "prompt_set_version": PROMPT_SET_VERSION,
        "prompt_count": len(outputs),
        "device": "cpu",
        "quantization": "Q4_K_M",
        "model_revision": MODEL_REVISION,
        "threads": threads,
        "context_tokens": 1024,
        "max_new_tokens": MAX_NEW_TOKENS,
        "thinking_mode": "Qwen3 /no_think user-turn switch; non-empty reasoning redacted",
        "decoding_settings": {"temperature": 0.7, "top_p": 0.8, "top_k": 20, "min_p": 0.0, "repeat_penalty": 1.1, "seed_base": 20261101, "system_prompt_version": "tr-assistant-v1"},
        "download_seconds": download_seconds,
        "model_load_seconds": load_seconds,
        "generation_total_seconds": round(time.perf_counter() - generation_started, 3),
        "latency_median_seconds": round(statistics.median(latencies), 3),
        "latency_p95_seconds": latencies[p95_index],
        "peak_process_rss_mib": peak_rss_mib(),
        "python_version": platform.python_version(),
        "reasoning_leakage_count": sum(item["reasoning_leakage"] for item in outputs),
        "reasoning_leakage_case_ids": [item["id"] for item in outputs if item["reasoning_leakage"]],
        "outputs": outputs,
        "human_review": {"completed": False, "reviewers_required": 2},
        "production_deployed": False,
    }
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "gguf-q4-quality-report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    (output_dir / "human-scores.template.json").write_text(
        json.dumps(empty_review_template(outputs), ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return report


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, default=Path("benchmark-results/gguf-q4"))
    parser.add_argument("--model-path", type=Path, default=Path("benchmark-cache/Qwen3-1.7B-Q4_K_M.gguf"))
    parser.add_argument("--threads", type=int, default=2)
    parser.add_argument("--model-id", default=MODEL_ID)
    parser.add_argument("--model-file", default=MODEL_FILE)
    parser.add_argument("--model-revision", default=MODEL_REVISION)
    parser.add_argument("--model-url", default=MODEL_URL)
    parser.add_argument("--model-sha256", default=MODEL_SHA256)
    parser.add_argument("--model-license", default=MODEL_LICENSE)
    parser.add_argument("--candidate-name", default=CANDIDATE_NAME)
    parser.add_argument("--max-model-size-bytes", type=int, default=MODEL_MAX_SIZE_BYTES)
    args = parser.parse_args()
    MODEL_ID = args.model_id
    MODEL_FILE = args.model_file
    MODEL_REVISION = args.model_revision
    MODEL_URL = args.model_url
    MODEL_SHA256 = args.model_sha256
    MODEL_LICENSE = args.model_license
    CANDIDATE_NAME = args.candidate_name
    MODEL_MAX_SIZE_BYTES = args.max_model_size_bytes
    result = run(args.output_dir, args.model_path, args.threads)
    print(json.dumps({key: result[key] for key in (
        "decision", "model_sha256", "download_seconds", "model_load_seconds",
        "generation_total_seconds", "latency_median_seconds", "latency_p95_seconds",
        "peak_process_rss_mib", "prompt_count",
    )}, ensure_ascii=False, indent=2))
