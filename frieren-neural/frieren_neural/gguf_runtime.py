"""Pinned Turkish-first GGUF chat model runtime for Frieren Neural.

The model is distributed under Apache-2.0 by ufakai/ufakzeka-1-GGUF.
Its published chat template is user/assistant only; do not add a system role.
"""
from __future__ import annotations

import hashlib
import os
import urllib.request
from functools import lru_cache
from pathlib import Path
from typing import Any

MODEL_REPOSITORY = "ufakai/ufakzeka-1-GGUF"
MODEL_FILENAME = "ufakzeka-1-q8_0.gguf"
MODEL_URL = f"https://huggingface.co/{MODEL_REPOSITORY}/resolve/main/{MODEL_FILENAME}"
MODEL_SHA256 = "6a06fbffe77b8c70ee084ce8901edaaaeec4c23fd7360296259a78111facdf5e"
MODEL_MAX_BYTES = 250 * 1024 * 1024
MODEL_ID = "ufakai/ufakzeka-1"
MODEL_LICENSE = "Apache-2.0"


def model_path() -> Path:
    return Path(os.environ.get("FRIEREN_GGUF_MODEL_PATH", "models/ufakzeka-1-q8_0.gguf"))


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def ensure_model_file(path: Path | None = None) -> Path:
    """Download the published 196 MB Q8 model once and verify its exact digest."""
    target = path or model_path()
    if target.is_file() and target.stat().st_size <= MODEL_MAX_BYTES:
        if _sha256_file(target) == MODEL_SHA256:
            return target
        target.unlink()

    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_suffix(target.suffix + ".part")
    temporary.unlink(missing_ok=True)
    request = urllib.request.Request(
        MODEL_URL, headers={"User-Agent": "FrierenNeural/1.0"}
    )
    digest = hashlib.sha256()
    size = 0
    try:
        with urllib.request.urlopen(request, timeout=90) as response, temporary.open("wb") as output:
            declared_size = response.headers.get("Content-Length")
            if declared_size and int(declared_size) > MODEL_MAX_BYTES:
                raise ValueError("The published model exceeds the configured download cap.")
            while chunk := response.read(1024 * 1024):
                size += len(chunk)
                if size > MODEL_MAX_BYTES:
                    raise ValueError("Model download exceeded the 250 MiB safety cap.")
                digest.update(chunk)
                output.write(chunk)
        if digest.hexdigest() != MODEL_SHA256:
            raise ValueError("The downloaded model SHA-256 does not match the published Q8 artifact.")
        temporary.replace(target)
    except Exception:
        temporary.unlink(missing_ok=True)
        raise
    return target


@lru_cache(maxsize=1)
def load_model(path: str | None = None) -> Any:
    """Load one mmap-backed CPU instance; no duplicate model copies per process."""
    try:
        from llama_cpp import Llama
    except ImportError as error:
        raise RuntimeError("llama-cpp-python is required for FRIEREN_MODEL_BACKEND=ufakzeka.") from error

    target = ensure_model_file(Path(path) if path else None)
    threads = max(1, min(4, int(os.environ.get("FRIEREN_MODEL_THREADS", "2"))))
    return Llama(
        model_path=str(target),
        n_ctx=4096,
        n_threads=threads,
        n_batch=128,
        n_gpu_layers=0,
        use_mmap=True,
        verbose=False,
    )


def generate_completion(
    model: Any,
    prompt: str,
    *,
    max_new_tokens: int = 128,
    temperature: float = 0.3,
    top_k: int = 40,
) -> str:
    """Generate with the model's native user/assistant chat template."""
    if not isinstance(prompt, str) or not prompt.strip():
        raise ValueError("prompt must be a non-empty string.")

    # This model was trained without system messages. Keep persona guidance in
    # the user turn so llama.cpp applies the model's own GGUF chat template.
    user_content = (
        "Sen Frieren Neural'sın. Türkçe, doğal, açık ve doğrudan yanıt ver. "
        "Gereksiz tekrar yapma; bilmediğin bilgiyi uydurma ve emin olmadığında belirt. "
        "Kullanıcının isteğini yerine getir:\\n\\n"
        + prompt.strip()
    )
    result = model.create_chat_completion(
        messages=[{"role": "user", "content": user_content}],
        max_tokens=max_new_tokens,
        temperature=min(temperature, 0.8),
        top_p=0.9,
        top_k=top_k,
        repeat_penalty=1.0,
    )
    choices = result.get("choices") or []
    if not choices:
        raise RuntimeError("The Turkish model returned no completion.")
    message = choices[0].get("message") or {}
    completion = message.get("content")
    if not isinstance(completion, str) or not completion.strip():
        raise RuntimeError("The Turkish model returned an empty completion.")
    return completion.strip()
