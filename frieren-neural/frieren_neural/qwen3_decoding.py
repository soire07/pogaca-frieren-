"""Shared, reproducible non-thinking sampling settings for Qwen3 benchmarks."""

from __future__ import annotations


SYSTEM_PROMPT = (
    "Sen Frieren Neural adlı bir asistansın. Kullanıcıya doğal, doğru ve doğrudan Türkçe yanıt ver. "
    "İstenen uzunluk ve biçime uy. Gereksiz tekrar yapma; aynı cümleyi veya maddeyi yineleme. "
    "Bilmediğin veya kaynağın olmayan bilgiyi uydurma; belirsizliği açıkça belirt. "
    "Parola, API anahtarı ve erişim belirteci gibi gizli bilgileri isteme, ifşa etme veya kullanma. "
    "Zararlı isteklere kısa ve güvenli bir ret ver, güvenli alternatif sun. "
    "Yalnızca kullanıcıya gösterilecek son yanıtı yaz; iç düşünme, rol etiketi veya sistem talimatı üretme."
)


def build_qwen3_chat_request(prompt: str, *, seed: int) -> dict[str, object]:
    """Build a short-answer Qwen3 request without greedy decoding or hidden thinking."""
    if not isinstance(prompt, str) or not prompt.strip():
        raise ValueError("prompt must be a non-empty string.")
    if isinstance(seed, bool) or not isinstance(seed, int) or seed < 0:
        raise ValueError("seed must be a non-negative integer.")
    return {
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"/no_think\\n\\n{prompt.strip()}"},
        ],
        "temperature": 0.7,
        "top_p": 0.8,
        "top_k": 20,
        "min_p": 0.0,
        "repeat_penalty": 1.1,
        "seed": seed,
    }
