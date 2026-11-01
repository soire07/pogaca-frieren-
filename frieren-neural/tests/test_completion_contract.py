import pytest
from fastapi.testclient import TestClient

import frieren_neural.api as api
from frieren_neural.discord_adapter import extract_answer


@pytest.fixture
def client():
    with TestClient(api.app, base_url="https://testserver") as test_client:
        yield test_client
    api.clear_runtime_cache()


def _stub_generation(monkeypatch, tmp_path):
    checkpoint = tmp_path / "stub-checkpoint.pt"
    checkpoint.write_bytes(b"stub")
    monkeypatch.setenv("FRIEREN_CHECKPOINT", str(checkpoint))
    monkeypatch.setenv("FRIEREN_DEVICE", "cpu")
    monkeypatch.setattr(api, "_load_runtime", lambda *_args, **_kwargs: (object(), object(), {"step": 9}))
    monkeypatch.setattr(
        api, "generate_text",
        lambda _model, _tokenizer, prompt, **_kwargs: prompt + " Cevap burada.",
    )


def test_authenticated_api_exposes_completion_without_breaking_legacy_text(
    client, monkeypatch, tmp_path
):
    _stub_generation(monkeypatch, tmp_path)
    monkeypatch.setenv("FRIEREN_API_TOKEN", "a" * 40)
    prompt = "Frieren kimdir?"

    response = client.post(
        "/generate",
        json={"prompt": prompt},
        headers={"Authorization": "Bearer " + "a" * 40},
    )

    assert response.status_code == 200
    assert response.json()["text"] == prompt + " Cevap burada."
    assert response.json()["completion"] == "Cevap burada."


def test_authenticated_web_chat_exposes_completion_without_prompt_echo(
    client, monkeypatch, tmp_path
):
    _stub_generation(monkeypatch, tmp_path)
    monkeypatch.setenv("FRIEREN_WEB_PASSWORD", "p" * 24)
    monkeypatch.setenv("FRIEREN_SESSION_SECRET", "s" * 48)
    captured = {}

    def capture_prompt(_model, _tokenizer, prompt, **_kwargs):
        captured["prompt"] = prompt
        return prompt + " Cevap burada."

    monkeypatch.setattr(api, "generate_text", capture_prompt)
    headers = {"Origin": "https://testserver"}
    login = client.post("/web/login", json={"password": "p" * 24}, headers=headers)
    assert login.status_code == 200

    response = client.post(
        "/web/generate",
        json={"prompt": "Frieren kimdir?"},
        headers=headers,
    )

    assert response.status_code == 200
    assert captured["prompt"] == "Kullanıcı: Frieren kimdir?\nAsistan:"
    assert response.json()["completion"] == "Cevap burada."


def test_discord_answer_extractor_prefers_completion_and_supports_legacy_api():
    assert extract_answer(
        {"text": "Frieren kimdir? Cevap burada.", "completion": "Cevap burada."},
        "Frieren kimdir?",
    ) == "Cevap burada."
    assert extract_answer(
        {"text": "Frieren kimdir? Cevap burada."},
        "Frieren kimdir?",
    ) == "Cevap burada."
    assert extract_answer({"text": "  "}, "Frieren kimdir?") is None



def test_api_serializes_plain_user_prompt_with_the_training_chat_template(
    client, monkeypatch, tmp_path
):
    _stub_generation(monkeypatch, tmp_path)
    monkeypatch.setenv("FRIEREN_API_TOKEN", "a" * 40)
    captured = {}

    def capture_prompt(_model, _tokenizer, prompt, **_kwargs):
        captured["prompt"] = prompt
        return prompt + "Doğrudan yanıt."

    monkeypatch.setattr(api, "generate_text", capture_prompt)
    user_prompt = "Frieren kimdir?"

    response = client.post(
        "/generate",
        json={"prompt": user_prompt},
        headers={"Authorization": "Bearer " + "a" * 40},
    )

    assert response.status_code == 200
    assert captured["prompt"] == "Kullanıcı: Frieren kimdir?\nAsistan:"
    assert response.json()["text"] == user_prompt + " Doğrudan yanıt."
    assert response.json()["completion"] == "Doğrudan yanıt."
