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


def extract_answer(payload: dict, prompt: str) -> str | None:
    """Extract only generated text from the shared Neural API response contract."""
    if not isinstance(payload, dict) or not isinstance(prompt, str):
        return None
    completion = payload.get("completion")
    if isinstance(completion, str) and completion.strip():
        return completion.strip()
    text = payload.get("text")
    if not isinstance(text, str):
        return None
    answer = text.strip()
    if prompt and answer.startswith(prompt):
        answer = answer[len(prompt):].strip()
    return answer or None
