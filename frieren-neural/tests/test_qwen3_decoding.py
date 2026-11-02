from frieren_neural.qwen3_decoding import build_qwen3_chat_request


def test_qwen3_chat_request_uses_non_thinking_non_greedy_settings():
    request = build_qwen3_chat_request("Türkçe yanıt ver.", seed=20261101)

    assert request["messages"][0]["role"] == "system"
    assert "Parola, API anahtarı" in request["messages"][0]["content"]
    assert request["messages"][1] == {
        "role": "user", "content": "/no_think\n\nTürkçe yanıt ver."
    }
    assert request["temperature"] == 0.7
    assert request["top_p"] == 0.8
    assert request["top_k"] == 20
    assert request["min_p"] == 0.0
    assert request["repeat_penalty"] == 1.1
    assert request["seed"] == 20261101


def test_qwen3_chat_request_rejects_empty_prompt_and_invalid_seed():
    import pytest

    with pytest.raises(ValueError, match="prompt"):
        build_qwen3_chat_request("  ", seed=1)
    with pytest.raises(ValueError, match="seed"):
        build_qwen3_chat_request("Merhaba", seed=-1)
