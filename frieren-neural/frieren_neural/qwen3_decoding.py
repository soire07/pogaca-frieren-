"""Shared, reproducible non-thinking sampling settings for Qwen3 benchmarks."""

from __future__ import annotations


def build_qwen3_chat_request(prompt: str, *, seed: int) -> dict[str, object]:
    """Build a short-answer Qwen3 request without greedy decoding or hidden thinking."""
    if not isinstance(prompt, str) or not prompt.strip():
        raise ValueError("prompt must be a non-empty string.")
    if isinstance(seed, bool) or not isinstance(seed, int) or seed < 0:
        raise ValueError("seed must be a non-negative integer.")
    return {
        "messages": [{"role": "user", "content": f"/no_think\n\n{prompt.strip()}"}],
        "temperature": 0.7,
        "top_p": 0.8,
        "top_k": 20,
        "min_p": 0.0,
        "seed": seed,
    }
