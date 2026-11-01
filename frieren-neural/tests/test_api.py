from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi.testclient import TestClient

from fastapi import HTTPException, Request

from frieren_neural.api import (app, clear_runtime_cache, _generation_capacity, _generation_slots, _login_attempts, _login_attempts_lock, _login_rate_limit)


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


def test_web_home_is_same_origin_and_does_not_embed_api_credentials(api_client):
    response = api_client.get("/")
    assert response.status_code == 200
    assert "Frieren Neural" in response.text
    csp = response.headers["Content-Security-Policy"]
    assert "nonce-" in csp
    assert "unsafe-inline" not in csp
    assert response.headers["Cache-Control"] == "no-store"
    assert "FRIEREN_API_TOKEN" not in response.text


def test_web_login_rate_limits_repeated_failures(api_client, monkeypatch):
    monkeypatch.setenv("FRIEREN_WEB_PASSWORD", "p" * 24)
    monkeypatch.setenv("FRIEREN_SESSION_SECRET", "s" * 48)
    headers = {"Origin": "https://testserver"}
    for _ in range(5):
        response = api_client.post(
            "/web/login",
            json={"password": "wrong-password-long"},
            headers=headers,
        )
        assert response.status_code == 401
    response = api_client.post(
        "/web/login",
        json={"password": "wrong-password-long"},
        headers=headers,
    )
    assert response.status_code == 429



def test_generation_capacity_rejects_excess_waiters_and_releases_slots():
    assert _generation_slots.acquire(blocking=False)
    assert _generation_slots.acquire(blocking=False)
    try:
        with pytest.raises(HTTPException) as error:
            with _generation_capacity():
                pass
        assert error.value.status_code == 503
    finally:
        _generation_slots.release()
        _generation_slots.release()


def test_generation_capacity_releases_slot_after_exception():
    with pytest.raises(RuntimeError):
        with _generation_capacity():
            raise RuntimeError("simulated generation failure")
    assert _generation_slots.acquire(blocking=False)
    _generation_slots.release()



def test_login_rate_limit_is_atomic_under_concurrent_attempts():
    scope = {
        "type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1",
        "method": "POST", "scheme": "https", "path": "/", "raw_path": b"/",
        "query_string": b"", "headers": [], "client": ("198.51.100.42", 12345),
        "server": ("testserver", 443),
    }
    request = Request(scope)
    with _login_attempts_lock:
        _login_attempts.pop("198.51.100.42", None)

    def attempt():
        try:
            _login_rate_limit(request)
            return "accepted"
        except HTTPException as error:
            return error.status_code

    with ThreadPoolExecutor(max_workers=12) as pool:
        results = list(pool.map(lambda _: attempt(), range(12)))

    assert results.count("accepted") == 5
    assert results.count(429) == 7
    with _login_attempts_lock:
        _login_attempts.pop("198.51.100.42", None)



def test_login_rate_limiter_bounds_distinct_client_memory_and_prunes_expired(monkeypatch):
    import time
    import frieren_neural.api as api

    scope = {
        "type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1",
        "method": "POST", "scheme": "https", "path": "/", "raw_path": b"/",
        "query_string": b"", "headers": [], "client": ("203.0.113.250", 12345),
        "server": ("testserver", 443),
    }
    request = Request(scope)
    now = time.monotonic()
    with api._login_attempts_lock:
        api._login_attempts.clear()
        api._login_attempts.update({f"192.0.2.{index}": [now] for index in range(api._MAX_LOGIN_CLIENTS)})

    with pytest.raises(HTTPException) as error:
        api._login_rate_limit(request)
    assert error.value.status_code == 429
    assert len(api._login_attempts) == api._MAX_LOGIN_CLIENTS
    assert "203.0.113.250" not in api._login_attempts

    with api._login_attempts_lock:
        api._login_attempts.clear()
        api._login_attempts.update({f"192.0.2.{index}": [now - 301] for index in range(api._MAX_LOGIN_CLIENTS)})
    assert api._login_rate_limit(request) == "203.0.113.250"
    assert len(api._login_attempts) == 1
    with api._login_attempts_lock:
        api._login_attempts.clear()


def test_session_token_rejects_malformed_and_oversized_fields(monkeypatch):
    import time
    from frieren_neural.api import _create_session_token, _valid_session_token

    secret = "s" * 48
    valid = _create_session_token(secret)
    assert _valid_session_token(valid, secret)
    assert not _valid_session_token(None, secret)
    assert not _valid_session_token("9" * 5_000 + "." + "a" * 64, secret)
    assert not _valid_session_token("١٧٣٠٠٠٠٠٠٠٠٠٠. " + "a" * 64, secret)
    assert not _valid_session_token(str(int(time.time()) - 1) + "." + "a" * 64, secret)
    assert not _valid_session_token(valid.split(".", 1)[0] + "." + "g" * 64, secret)


def test_generation_capacity_covers_checkpoint_loading(api_client, monkeypatch, tmp_path):
    import time
    from threading import Event

    import frieren_neural.api as api

    checkpoint = tmp_path / "placeholder.pt"
    checkpoint.write_bytes(b"test")
    monkeypatch.setenv("FRIEREN_API_TOKEN", "a" * 40)
    monkeypatch.setenv("FRIEREN_CHECKPOINT", str(checkpoint))
    monkeypatch.setenv("FRIEREN_DEVICE", "cpu")

    load_started = Event()
    allow_load_to_finish = Event()

    def blocked_load(*_args, **_kwargs):
        load_started.set()
        assert allow_load_to_finish.wait(timeout=5)
        return object(), object(), {"step": 7}

    monkeypatch.setattr(api, "_load_runtime", blocked_load)
    monkeypatch.setattr(api, "generate_text", lambda *_args, **_kwargs: "Frieren")
    headers = {"Authorization": "Bearer " + "a" * 40}
    payload = {"prompt": "Frieren", "max_new_tokens": 1}

    with ThreadPoolExecutor(max_workers=3) as pool:
        first = pool.submit(api_client.post, "/generate", json=payload, headers=headers)
        assert load_started.wait(timeout=5)

        second = pool.submit(api_client.post, "/generate", json=payload, headers=headers)
        deadline = time.monotonic() + 5
        while api._generation_slots._value != 0 and time.monotonic() < deadline:
            time.sleep(0.01)
        assert api._generation_slots._value == 0

        rejected = api_client.post("/generate", json=payload, headers=headers)
        assert rejected.status_code == 503

        allow_load_to_finish.set()
        assert first.result(timeout=5).status_code == 200
        assert second.result(timeout=5).status_code == 200


def test_health_check_does_not_bypass_generation_capacity(api_client, monkeypatch, tmp_path):
    import frieren_neural.api as api

    checkpoint = tmp_path / "health-model.pt"
    checkpoint.write_bytes(b"placeholder")
    monkeypatch.setenv("FRIEREN_CHECKPOINT", str(checkpoint))
    load_called = False

    def unexpected_load(*_args, **_kwargs):
        nonlocal load_called
        load_called = True
        raise AssertionError("health check must not load while capacity is full")

    monkeypatch.setattr(api, "_load_runtime", unexpected_load)
    assert api._generation_slots.acquire(blocking=False)
    assert api._generation_slots.acquire(blocking=False)
    try:
        response = api_client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "busy"}
        assert not load_called
    finally:
        api._generation_slots.release()
        api._generation_slots.release()
