"""Shared user/assistant prompt serialization for training and inference."""

from __future__ import annotations


def format_benchmark_prompt(prompt: str) -> str:
    """Apply the same user/assistant template used by the training corpus."""
    if not isinstance(prompt, str) or not prompt.strip():
        raise ValueError("Benchmark prompt must be a non-empty string.")
    normalized = prompt.rstrip()
    if normalized.endswith("Asistan:"):
        return normalized
    return f"Kullanıcı: {normalized}\nAsistan:"
