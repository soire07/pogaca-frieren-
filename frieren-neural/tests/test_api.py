import pytest
from fastapi.testclient import TestClient

from frieren_neural.api import app, clear_runtime_cache


@pytest.fixture
def api_client():
    with TestClient(app, base_url="https://testserver") as client:
        yield client
    clear_runtime_cache()


def test_health_does_not_expose_secrets_and_reports_missing_checkpoint(api_client, monkeypatch, tmp_path):
    monkeypatch.delenv("FRIEREN_API_TOKEN", raising=False)
    monkeypatch.setenv("FRIEREN_CHECKPOINT", str(tmp_path / "missing.pt"))
    response = api_client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "model_unavailable"}
    assert "token" not in response.text.lower()


def test_generation_fails_closed_without_server_token(api_client, monkeypatch):
    monkeypatch.delenv("FRIEREN_API_TOKEN", raising=False)
    response = api_client.post("/generate", json={"prompt": "Frieren"})
    assert response.status_code == 503


def test_generation_rejects_invalid_bearer_token(api_client, monkeypatch):
    monkeypatch.setenv("FRIEREN_API_TOKEN", "x" * 40)
    response = api_client.post(
        "/generate",
        json={"prompt": "Frieren"},
        headers={"Authorization": "Bearer " + "y" * 40},
    )
    assert response.status_code == 401


def test_generation_uses_checkpoint_and_returns_prompt_prefix(api_client, monkeypatch, tmp_path):
    from frieren_neural.training import TrainingConfig, train_model

    checkpoint = tmp_path / "api-model.pt"
    train_model(
        ["Frieren learns magic. Fern studies spells. " * 10],
        checkpoint,
        TrainingConfig(
            max_steps=1, eval_interval=1, eval_batches=1, batch_size=1, block_size=8,
            d_model=16, n_heads=2, n_layers=1, dropout=0.0, tokenizer_vocab_size=280,
        ),
        device="cpu",
    )
    monkeypatch.setenv("FRIEREN_API_TOKEN", "a" * 40)
    monkeypatch.setenv("FRIEREN_CHECKPOINT", str(checkpoint))
    monkeypatch.setenv("FRIEREN_DEVICE", "cpu")
    clear_runtime_cache()
    response = api_client.post(
        "/generate",
        json={"prompt": "Frieren", "max_new_tokens": 2, "top_k": 1},
        headers={"Authorization": "Bearer " + "a" * 40},
    )
    assert response.status_code == 200
    assert response.json()["text"].startswith("Frieren")
    assert response.json()["step"] == 1


def test_generation_validates_request_limits(api_client):
    response = api_client.post("/generate", json={"prompt": "x", "max_new_tokens": 9999})
    assert response.status_code == 422



def test_authorization_header_must_use_bearer_scheme(api_client, monkeypatch):
    monkeypatch.setenv("FRIEREN_API_TOKEN", "z" * 40)
    response = api_client.post(
        "/generate",
        json={"prompt": "Frieren"},
        headers={"Authorization": "z" * 40},
    )
    assert response.status_code == 401


def test_web_login_requires_strong_secrets_and_same_origin(api_client, monkeypatch):
    monkeypatch.delenv("FRIEREN_WEB_PASSWORD", raising=False)
    monkeypatch.delenv("FRIEREN_SESSION_SECRET", raising=False)
    response = api_client.post(
        "/web/login",
        json={"password": "p" * 24},
        headers={"Origin": "https://testserver"},
    )
    assert response.status_code == 503

    monkeypatch.setenv("FRIEREN_WEB_PASSWORD", "p" * 24)
    monkeypatch.setenv("FRIEREN_SESSION_SECRET", "s" * 48)
    response = api_client.post("/web/login", json={"password": "wrong-password-long"}, headers={"Origin": "https://attacker.example"})
    assert response.status_code == 403


def test_web_login_sets_http_only_secure_session_cookie(api_client, monkeypatch):
    monkeypatch.setenv("FRIEREN_WEB_PASSWORD", "p" * 24)
    monkeypatch.setenv("FRIEREN_SESSION_SECRET", "s" * 48)
    response = api_client.post(
        "/web/login",
        json={"password": "p" * 24},
        headers={"Origin": "https://testserver"},
    )
    assert response.status_code == 200
    cookie = response.headers["set-cookie"].lower()
    assert "httponly" in cookie
    assert "secure" in cookie
    assert "samesite=strict" in cookie


def test_web_generation_requires_a_valid_session(api_client, monkeypatch):
    monkeypatch.setenv("FRIEREN_WEB_PASSWORD", "p" * 24)
    monkeypatch.setenv("FRIEREN_SESSION_SECRET", "s" * 48)
    response = api_client.post(
        "/web/generate",
        json={"prompt": "Frieren"},
        headers={"Origin": "https://testserver"},
    )
    assert response.status_code == 401


def test_web_login_and_generation_use_server_side_session(api_client, monkeypatch, tmp_path):
    from frieren_neural.training import TrainingConfig, train_model

    checkpoint = tmp_path / "web-model.pt"
    train_model(
        ["Frieren learns magic. Fern studies spells. " * 10],
        checkpoint,
        TrainingConfig(
            max_steps=1, eval_interval=1, eval_batches=1, batch_size=1, block_size=8,
            d_model=16, n_heads=2, n_layers=1, dropout=0.0, tokenizer_vocab_size=280,
        ),
        device="cpu",
    )
    monkeypatch.setenv("FRIEREN_WEB_PASSWORD", "p" * 24)
    monkeypatch.setenv("FRIEREN_SESSION_SECRET", "s" * 48)
    monkeypatch.setenv("FRIEREN_CHECKPOINT", str(checkpoint))
    monkeypatch.setenv("FRIEREN_DEVICE", "cpu")
    clear_runtime_cache()
    login = api_client.post(
        "/web/login",
        json={"password": "p" * 24},
        headers={"Origin": "https://testserver"},
    )
    assert login.status_code == 200
    response = api_client.post(
        "/web/generate",
        json={"prompt": "Frieren", "max_new_tokens": 2, "top_k": 1},
        headers={"Origin": "https://testserver"},
    )
    assert response.status_code == 200
    assert response.json()["text"].startswith("Frieren")
