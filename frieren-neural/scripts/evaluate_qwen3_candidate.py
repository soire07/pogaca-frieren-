"""Evaluate a pinned, pretrained Qwen3 GGUF candidate without touching production."""
from __future__ import annotations

import hashlib
import json
import os
import resource
import tempfile
import urllib.request
from pathlib import Path

from llama_cpp import Llama
from frieren_neural.quality_evaluation import PROMPT_SET_VERSION, load_prompt_set

MODEL_REPOSITORY = "unsloth/Qwen3-0.6B-GGUF"
MODEL_REVISION = "17429132c7b3c2dbe0ec7e06ee085aa89a96994f"
MODEL_FILENAME = "Qwen3-0.6B-Q2_K.gguf"
MODEL_SHA256 = "0e850e08a48e9df1d1e0fc9959157e893215040f673e382c9da4339c74b12d3d"
MODEL_BYTES_LIMIT = 320 * 1024 * 1024
MODEL_URL = (
    f"https://huggingface.co/{MODEL_REPOSITORY}/resolve/"
    f"{MODEL_REVISION}/{MODEL_FILENAME}"
)


def download_model(target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    digest = hashlib.sha256()
    size = 0
    temporary = target.with_suffix(target.suffix + ".part")
    temporary.unlink(missing_ok=True)
    request = urllib.request.Request(
        MODEL_URL, headers={"User-Agent": "FrierenNeural-CandidateEval/1.0"}
    )
    try:
        with urllib.request.urlopen(request, timeout=120) as response, temporary.open("wb") as output:
            declared = response.headers.get("Content-Length")
            if declared and int(declared) > MODEL_BYTES_LIMIT:
                raise ValueError("Candidate model exceeds the 320 MiB download limit.")
            while chunk := response.read(1024 * 1024):
                size += len(chunk)
                if size > MODEL_BYTES_LIMIT:
                    raise ValueError("Candidate model exceeded the 320 MiB download limit.")
                digest.update(chunk)
                output.write(chunk)
        if digest.hexdigest() != MODEL_SHA256:
            raise ValueError("Candidate model SHA-256 mismatch; refusing inference.")
        temporary.replace(target)
    except Exception:
        temporary.unlink(missing_ok=True)
        raise


def main() -> None:
    output_dir = Path(os.environ.get("FRIEREN_CANDIDATE_OUTPUT", "quality-reports/qwen3-candidate"))
    output_dir.mkdir(parents=True, exist_ok=True)
    model_path = Path(tempfile.gettempdir()) / MODEL_FILENAME
    download_model(model_path)

    model = Llama(
        model_path=str(model_path),
        n_ctx=512,
        n_threads=2,
        n_batch=32,
        n_gpu_layers=0,
        use_mmap=True,
        verbose=False,
    )
    outputs = []
    for item in load_prompt_set():
        result = model.create_chat_completion(
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Türkçe yanıt veren, doğru ve dikkatli bir asistansın. "
                        "Kısa ve açık cevap ver. Bilmediğin şeyi uydurma. "
                        "Gizli akıl yürütme gösterme; yalnızca nihai cevabı ver."
                    ),
                },
                {"role": "user", "content": item["prompt"]},
            ],
            max_tokens=96,
            temperature=0.2,
            top_p=0.8,
            seed=20261107,
        )
        choices = result.get("choices") or []
        message = (choices[0].get("message") or {}) if choices else {}
        completion = message.get("content")
        if not isinstance(completion, str) or not completion.strip():
            raise RuntimeError(f"Empty completion for {item['id']}")
        # llama-cpp-python 0.3.36 does not expose chat_format_kwargs.
        # Qwen3 may emit a visible think block; retain only its final answer.
        if "<think>" in completion:
            if "</think>" not in completion:
                raise RuntimeError(f"Unterminated Qwen3 think block for {item['id']}")
            completion = completion.split("</think>", 1)[1].strip()
        if not completion:
            raise RuntimeError(f"Qwen3 returned no final answer for {item['id']}")
        outputs.append(
            {
                "id": item["id"],
                "category": item["category"],
                "prompt": item["prompt"],
                "review_hint": item["review_hint"],
                "completion": completion.strip(),
            }
        )
        print(f"{item['id']}: {completion.strip()[:240]}", flush=True)

    peak_rss_mb = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024
    report = {
        "schema_version": 1,
        "candidate_status": "EVALUATION_ONLY_NOT_READY",
        "prompt_set_version": PROMPT_SET_VERSION,
        "model": {
            "repository": MODEL_REPOSITORY,
            "revision": MODEL_REVISION,
            "filename": MODEL_FILENAME,
            "sha256": MODEL_SHA256,
            "license": "Apache-2.0",
        },
        "runtime": {
            "n_ctx": 512,
            "n_threads": 2,
            "n_batch": 32,
            "peak_rss_mb_on_github_runner": round(peak_rss_mb, 2),
        },
        "output_count": len(outputs),
        "outputs": outputs,
        "release_gate": (
            "NOT READY: requires separate 512 MiB Render runtime verification, "
            "valid held-out metrics, two independent human reviews and baseline comparison."
        ),
    }
    (output_dir / "quality-report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    lines = [
        "# Qwen3 0.6B candidate — evaluation only",
        "",
        "- Decision: **NOT READY**",
        f"- Model: `{MODEL_REPOSITORY}@{MODEL_REVISION}`",
        f"- SHA-256: `{MODEL_SHA256}`",
        f"- Outputs: {len(outputs)}/24",
        f"- GitHub runner peak RSS: {peak_rss_mb:.2f} MiB",
        "",
        "This run is a candidate benchmark only. GitHub runner memory is not proof of Render Free compatibility.",
        "Do not connect this candidate to production until Render memory, held-out quality, two independent human reviews and baseline comparison pass.",
        "",
    ]
    for item in outputs:
        lines.extend([f"## {item['id']} — {item['category']}", "", f"**Prompt:** {item['prompt']}", "", item["completion"], ""])
    (output_dir / "quality-report.md").write_text("\n".join(lines), encoding="utf-8")


if __name__ == "__main__":
    main()
