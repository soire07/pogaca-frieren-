"""Authenticated, single-process inference API for Frieren Neural."""

from __future__ import annotations

import os
import secrets
import threading
from functools import lru_cache
from pathlib import Path
from typing import Annotated

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

from .training import generate_text, load_checkpoint


app = FastAPI(
    title="Frieren Neural",
    version="0.1.0",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)
_generation_lock = threading.Lock()


class GenerateRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=2_048)
    max_new_tokens: int = Field(default=80, ge=1, le=128)
    temperature: float = Field(default=0.8, gt=0.0, le=2.0)
    top_k: int = Field(default=40, ge=1, le=128)


@lru_cache(maxsize=1)
def _load_runtime(checkpoint_path: str, device: str) -> tuple[object, object, dict[str, float | int | str]]:
    return load_checkpoint(checkpoint_path, device=device)


def clear_runtime_cache() -> None:
    """Clear the loaded model after checkpoint or environment changes."""
    _load_runtime.cache_clear()


def _checkpoint_path() -> Path:
    return Path(os.environ.get("FRIEREN_CHECKPOINT", "checkpoints/frieren-neural.pt"))


def _authenticate(authorization: str | None) -> None:
    expected = os.environ.get("FRIEREN_API_TOKEN", "")
    if len(expected) < 32:
        raise HTTPException(status_code=503, detail="Generation API is not configured.")
    supplied = authorization.removeprefix("Bearer ").strip() if authorization else ""
    if not secrets.compare_digest(supplied, expected):
        raise HTTPException(status_code=401, detail="Invalid bearer token.")


@app.get("/health")
def health() -> dict[str, str]:
    if _checkpoint_path().is_file():
        return {"status": "ready"}
    return {"status": "model_unavailable"}


@app.post("/generate")
def generate(
    request: GenerateRequest,
    authorization: Annotated[str | None, Header()] = None,
) -> dict[str, str | int]:
    _authenticate(authorization)
    checkpoint = _checkpoint_path()
    if not checkpoint.is_file():
        raise HTTPException(status_code=503, detail="Model checkpoint is unavailable.")
    device = os.environ.get("FRIEREN_DEVICE", "cpu")
    try:
        model, tokenizer, metadata = _load_runtime(str(checkpoint.resolve()), device)
    except (OSError, RuntimeError, ValueError, KeyError) as error:
        raise HTTPException(status_code=503, detail="Model checkpoint could not be loaded.") from error
    try:
        with _generation_lock:
            result = generate_text(
                model, tokenizer, request.prompt, max_new_tokens=request.max_new_tokens,
                temperature=request.temperature, top_k=request.top_k
            )
    except (RuntimeError, ValueError) as error:
        raise HTTPException(status_code=422, detail="The prompt could not be processed.") from error
    return {"text": result, "step": int(metadata["step"])}
