from concurrent.futures import ThreadPoolExecutor
import hashlib
import json

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
    assert response.status_code == 503
    assert response.json() == {"status": "model_unavailable"}
    assert "token" not in response.text.lower()


def test_health_returns_503_when_runtime_cannot_load_model(api_client, monkeypatch, tmp_path):
    import frieren_neural.api as api

    checkpoint = tmp_path / "broken.pt"
    checkpoint.write_bytes(b"placeholder")
    monkeypatch.setenv("FRIEREN_CHECKPOINT", str(checkpoint))
    monkeypatch.setenv("FRIEREN_MODEL_BACKEND", "scratch")
    monkeypatch.setattr(api, "_load_active_runtime", lambda: (_ for _ in ()).throw(RuntimeError("model load failed")))

    response = api_client.get("/health")
    assert response.status_code == 503
    assert response.json() == {"status": "model_unavailable"}


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
        assert response.status_code == 503
        assert response.json() == {"status": "busy"}
        assert not load_called
    finally:
        api._generation_slots.release()
        api._generation_slots.release()


def test_shared_generation_capacity_uses_postgres_session_lock(monkeypatch):
    import sys
    from types import SimpleNamespace
    import frieren_neural.api as api

    class Cursor:
        def fetchone(self):
            return (True,)

    class Connection:
        closed = False
        def __enter__(self):
            return self
        def __exit__(self, *_args):
            self.closed = True
        def execute(self, query, params=()):
            self.query = query
            self.params = params
            return Cursor()

    connection = Connection()
    monkeypatch.setenv("FRIEREN_DATABASE_URL", "postgresql://test")
    monkeypatch.setitem(sys.modules, "psycopg", SimpleNamespace(
        connect=lambda *args, **kwargs: connection
    ))

    with api._generation_capacity():
        assert connection.params == (api._GENERATION_LOCK_IDS[0],)
        assert "pg_try_advisory_lock" in connection.query
    assert connection.closed


def test_shared_generation_capacity_fails_closed_when_database_is_unavailable(monkeypatch):
    import sys
    from types import SimpleNamespace
    import frieren_neural.api as api

    def unavailable(*_args, **_kwargs):
        raise OSError("database unavailable")

    monkeypatch.setenv("FRIEREN_DATABASE_URL", "postgresql://test")
    monkeypatch.setitem(sys.modules, "psycopg", SimpleNamespace(connect=unavailable))
    with pytest.raises(HTTPException) as error:
        with api._generation_capacity():
            pass
    assert error.value.status_code == 503
    assert error.value.detail == "Shared generation capacity is temporarily unavailable."


def test_shared_login_rate_limit_uses_atomic_database_transaction(monkeypatch):
    import sys
    from types import SimpleNamespace
    import frieren_neural.api as api

    class Cursor:
        def __init__(self, row=None):
            self.row = row
        def fetchone(self):
            return self.row

    class Transaction:
        def __enter__(self):
            return self
        def __exit__(self, *_args):
            return False

    class Connection:
        def __init__(self):
            self.statements = []
        def __enter__(self):
            return self
        def __exit__(self, *_args):
            return False
        def transaction(self):
            return Transaction()
        def execute(self, query, params=()):
            self.statements.append((query, params))
            if "count(*) FROM neural_login_attempts WHERE client_key" in query:
                return Cursor((0,))
            if "count(DISTINCT client_key)" in query:
                return Cursor((1,))
            return Cursor()

    connection = Connection()
    monkeypatch.setenv("FRIEREN_DATABASE_URL", "postgresql://test")
    monkeypatch.setitem(sys.modules, "psycopg", SimpleNamespace(
        connect=lambda *args, **kwargs: connection
    ))
    scope = {
        "type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1",
        "method": "POST", "scheme": "https", "path": "/", "raw_path": b"/",
        "query_string": b"", "headers": [], "client": ("198.51.100.42", 12345),
        "server": ("testserver", 443),
    }
    key = api._login_rate_limit(Request(scope))
    assert key.startswith("db:")
    sql = " ".join(statement for statement, _ in connection.statements)
    assert "pg_advisory_xact_lock" in sql
    assert "DELETE FROM neural_login_attempts" in sql
    assert "INSERT INTO neural_login_attempts" in sql


def test_shared_login_rate_limit_fails_closed_when_database_is_unavailable(monkeypatch):
    import sys
    from types import SimpleNamespace
    import frieren_neural.api as api

    def unavailable(*_args, **_kwargs):
        raise OSError("database unavailable")

    monkeypatch.setenv("FRIEREN_DATABASE_URL", "postgresql://test")
    monkeypatch.setitem(sys.modules, "psycopg", SimpleNamespace(connect=unavailable))
    scope = {
        "type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1",
        "method": "POST", "scheme": "https", "path": "/", "raw_path": b"/",
        "query_string": b"", "headers": [], "client": ("198.51.100.42", 12345),
        "server": ("testserver", 443),
    }
    with pytest.raises(HTTPException) as error:
        api._login_rate_limit(Request(scope))
    assert error.value.status_code == 503


def test_health_runs_one_fixed_generation_smoke_only_when_enabled(api_client, monkeypatch):
    import frieren_neural.api as api

    monkeypatch.setenv("FRIEREN_MODEL_BACKEND", "ufakzeka")
    monkeypatch.setenv("FRIEREN_HEALTH_GENERATION_SMOKE", "1")
    monkeypatch.setattr(api, "_load_active_runtime", lambda: object())
    calls = []
    monkeypatch.setattr(
        api,
        "_generate_reply",
        lambda *args, **kwargs: (calls.append((args, kwargs)) or ("Merhaba.", 0, "ufakai/ufakzeka-1")),
    )
    api._run_generation_smoke.cache_clear()
    first = api_client.get("/health")
    second = api_client.get("/health")
    assert first.status_code == 200
    assert first.json()["generation_smoke"] == "pass"
    assert second.json()["generation_smoke"] == "pass"
    assert len(calls) == 1
    api._run_generation_smoke.cache_clear()



def test_learning_signals_require_api_authentication(api_client, monkeypatch):
    monkeypatch.setenv("FRIEREN_API_TOKEN", "a" * 40)
    response = api_client.post("/learning/signals", json={
        "guild_id": "12345678901234567", "user_id": "22345678901234567",
        "signals": [{"signal_type": "correction", "dimension": "correctness"}]
    })
    assert response.status_code == 401


def test_learning_signals_validate_scope_and_signal_contract(api_client, monkeypatch):
    monkeypatch.setenv("FRIEREN_API_TOKEN", "a" * 40)
    headers = {"Authorization": "Bearer " + "a" * 40}
    invalid_scope = api_client.post("/learning/signals", headers=headers, json={
        "guild_id": "not-a-discord-id", "user_id": "22345678901234567",
        "signals": [{"signal_type": "correction", "dimension": "correctness"}]
    })
    invalid_signal = api_client.post("/learning/signals", headers=headers, json={
        "guild_id": "12345678901234567", "user_id": "22345678901234567",
        "signals": [{"signal_type": "unknown", "dimension": "correctness"}]
    })
    assert invalid_scope.status_code == 422
    assert invalid_signal.status_code == 422


def test_learning_signal_endpoint_stores_only_validated_metadata(api_client, monkeypatch):
    import frieren_neural.api as api
    monkeypatch.setenv("FRIEREN_API_TOKEN", "a" * 40)
    captured = []
    monkeypatch.setattr(api, "_store_learning_signals", lambda payload: captured.append(payload) or len(payload.signals))
    response = api_client.post("/learning/signals", headers={"Authorization": "Bearer " + "a" * 40}, json={
        "guild_id": "12345678901234567", "user_id": "22345678901234567",
        "signals": [
            {"signal_type": "correction", "dimension": "correctness"},
            {"signal_type": "uncertainty", "dimension": "grounding"}
        ]
    })
    assert response.status_code == 200
    assert response.json() == {"accepted": True, "stored": 2}
    assert not hasattr(captured[0], "prompt")
    assert not hasattr(captured[0], "message")
    assert not hasattr(captured[0], "answer")


def test_learning_insights_are_aggregate_only_and_require_api_authentication(api_client, monkeypatch):
    import frieren_neural.api as api
    monkeypatch.setenv("FRIEREN_API_TOKEN", "a" * 40)
    monkeypatch.setattr(api, "_learning_insights", lambda: [
        {"dimension": "grounding", "signal_type": "uncertainty", "occurrences": 4}
    ])
    assert api_client.get("/learning/insights").status_code == 401
    allowed = api_client.get("/learning/insights", headers={"Authorization": "Bearer " + "a" * 40})
    assert allowed.status_code == 200
    assert allowed.json() == {"signals": [
        {"dimension": "grounding", "signal_type": "uncertainty", "occurrences": 4}
    ]}
    assert "user_id" not in allowed.text



def test_learning_scope_hash_is_pseudonymous_and_separates_users_and_guilds(monkeypatch):
    import frieren_neural.api as api

    monkeypatch.setenv("FRIEREN_API_TOKEN", "s" * 48)
    guild_a, user_a = api._learning_scope_hash("12345678901234567", "22345678901234567")
    guild_b, user_b = api._learning_scope_hash("12345678901234567", "32345678901234567")
    other_guild, other_user = api._learning_scope_hash("42345678901234567", "22345678901234567")
    assert len(guild_a) == len(user_a) == 64
    assert guild_a == guild_b
    assert user_a != user_b
    assert guild_a != other_guild
    assert user_a != other_user
    assert "12345678901234567" not in guild_a
    assert "22345678901234567" not in user_a



def test_learning_signal_postgres_migration_deduplication_retention_and_aggregation(api_client, monkeypatch):
    import os
    from pathlib import Path
    import psycopg
    import frieren_neural.api as api

    from urllib.parse import urlparse
    if os.environ.get("CI") != "true":
        pytest.skip("PostgreSQL integration test runs only in GitHub Actions.")
    database_url = "postgresql://postgres:postgres@localhost:5432/neural_test"
    parsed = urlparse(database_url)
    if parsed.hostname not in {"localhost", "127.0.0.1"} or parsed.path.lstrip("/") != "neural_test":
        pytest.skip("Refusing to run destructive migration test outside the isolated neural_test database.")
    monkeypatch.setenv("FRIEREN_DATABASE_URL", database_url)
    monkeypatch.setenv("FRIEREN_API_TOKEN", "ci-neural-test-token-with-more-than-32-characters")

    shared_migration = Path(__file__).parents[1] / "migrations" / "001_shared_admission.sql"
    learning_migration = Path(__file__).parents[1] / "migrations" / "002_learning_signals.sql"
    shared_sql = shared_migration.read_text(encoding="utf-8")
    learning_sql = learning_migration.read_text(encoding="utf-8")
    with psycopg.connect(database_url) as connection:
        connection.execute("DROP TABLE IF EXISTS neural_learning_signals")
        connection.execute("DROP TABLE IF EXISTS neural_login_attempts")
        connection.execute(shared_sql)
        connection.execute(shared_sql)  # Both migrations must be safe to reapply.
        connection.execute(learning_sql)
        connection.execute(learning_sql)
        assert connection.execute("SELECT to_regclass('public.neural_login_attempts')").fetchone()[0] == "neural_login_attempts"
        assert connection.execute("SELECT to_regclass('public.neural_learning_signals')").fetchone()[0] == "neural_learning_signals"
        connection.execute("TRUNCATE neural_learning_signals, neural_login_attempts")

    monkeypatch.setenv("FRIEREN_API_TOKEN", "ci-neural-test-token-with-more-than-32-characters")
    first_user = api.LearningSignalsRequest(
        guild_id="55555555555555555",
        user_id="66666666666666666",
        signals=[
            api.LearningSignal(signal_type="correction", dimension="correctness"),
            api.LearningSignal(signal_type="uncertainty", dimension="grounding"),
        ],
    )
    second_user = api.LearningSignalsRequest(
        guild_id="55555555555555555",
        user_id="77777777777777777",
        signals=[api.LearningSignal(signal_type="correction", dimension="correctness")],
    )

    headers = {"Authorization": "Bearer " + os.environ["FRIEREN_API_TOKEN"]}
    first_response = api_client.post("/learning/signals", headers=headers, json=first_user.model_dump())
    duplicate_response = api_client.post("/learning/signals", headers=headers, json=first_user.model_dump())
    second_response = api_client.post("/learning/signals", headers=headers, json=second_user.model_dump())
    assert first_response.status_code == 200 and first_response.json() == {"accepted": True, "stored": 2}
    assert duplicate_response.status_code == 200 and duplicate_response.json() == {"accepted": True, "stored": 0}
    assert second_response.status_code == 200 and second_response.json() == {"accepted": True, "stored": 1}

    # Exercise the actual shared-admission and persistent login-rate-limit paths
    # against the same isolated PostgreSQL database used by the learning API.
    with api._generation_capacity():
        pass
    scope = {
        "type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1",
        "method": "POST", "scheme": "https", "path": "/", "raw_path": b"/",
        "query_string": b"", "headers": [], "client": ("198.51.100.42", 12345),
        "server": ("testserver", 443),
    }
    login_request = Request(scope)
    login_key = None
    for _ in range(api._MAX_LOGIN_ATTEMPTS):
        login_key = api._login_rate_limit(login_request)
        assert login_key.startswith("db:")
    with pytest.raises(HTTPException) as rate_limit_error:
        api._login_rate_limit(login_request)
    assert rate_limit_error.value.status_code == 429
    api._clear_login_attempts(login_key)
    assert api._login_rate_limit(login_request).startswith("db:")
    api._clear_login_attempts(login_key)

    insights_response = api_client.get("/learning/insights", headers=headers)
    assert insights_response.status_code == 200
    insights = insights_response.json()["signals"]
    assert insights == [
        {"dimension": "correctness", "signal_type": "correction", "occurrences": 2},
        {"dimension": "grounding", "signal_type": "uncertainty", "occurrences": 1},
    ]

    with psycopg.connect(database_url) as connection:
        stored = connection.execute(
            "SELECT guild_scope_hash, user_scope_hash FROM neural_learning_signals"
        ).fetchall()
        assert len(stored) == 3
        serialized = repr(stored)
        assert "55555555555555555" not in serialized
        assert "66666666666666666" not in serialized
        assert "77777777777777777" not in serialized
        connection.execute(
            "UPDATE neural_learning_signals SET created_at = now() - interval '31 days'"
        )

    third_user = api.LearningSignalsRequest(
        guild_id="55555555555555555",
        user_id="88888888888888888",
        signals=[api.LearningSignal(signal_type="repeated_question", dimension="conversation_consistency")],
    )
    assert api._store_learning_signals(third_user) == 1
    with psycopg.connect(database_url) as connection:
        remaining = connection.execute("SELECT count(*) FROM neural_learning_signals").fetchone()[0]
    assert remaining == 1
    assert api._learning_insights() == [
        {"dimension": "conversation_consistency", "signal_type": "repeated_question", "occurrences": 1}
    ]



def test_live_endpoint_does_not_load_model_or_acquire_generation_capacity(api_client, monkeypatch):
    import frieren_neural.api as api

    def unexpected(*args, **kwargs):
        raise AssertionError("liveness must not load model or acquire capacity")

    monkeypatch.setattr(api, "_load_active_runtime", unexpected)
    monkeypatch.setattr(api, "_generation_capacity", unexpected)
    response = api_client.get("/live")
    assert response.status_code == 200
    assert response.json() == {"status": "alive", "service": "frieren-neural"}



def _guardian_review_payload():
    context = "FILE: guardian/automation.js\nexport async function reviewIncident() { return true; }"
    return {
        "incident": {
            "system": "pogaca_frieren",
            "code": "COMMAND_TIMEOUT",
            "title": "Synthetic timeout",
            "summary": "A bounded request timed out.",
            "evidence": [{"file": "guardian/automation.js", "line": 12, "message": "timeout"}],
        },
        "source_context": context,
        "source_context_files": ["guardian/automation.js"],
        "source_context_hash": hashlib.sha256(context.encode("utf-8")).hexdigest(),
        "source_commit_sha": "a" * 40,
    }


def test_guardian_review_requires_authentication_and_both_quality_gates(api_client, monkeypatch):
    monkeypatch.setenv("FRIEREN_API_TOKEN", "n" * 40)
    payload = _guardian_review_payload()
    response = api_client.post("/internal/guardian-review", json=payload)
    assert response.status_code == 401

    response = api_client.post(
        "/internal/guardian-review", json=payload,
        headers={"Authorization": "Bearer " + "n" * 40},
    )
    assert response.status_code == 503
    assert "quality gate" in response.json()["detail"].lower()


def test_guardian_review_returns_only_a_human_reviewed_proposal_when_enabled(api_client, monkeypatch):
    import frieren_neural.api as api

    monkeypatch.delenv("FRIEREN_DATABASE_URL", raising=False)
    monkeypatch.setenv("FRIEREN_API_TOKEN", "n" * 40)
    monkeypatch.setenv("FRIEREN_NEURAL_GUARDIAN_ENABLED", "1")
    monkeypatch.setenv("FRIEREN_NEURAL_QUALITY_APPROVED", "1")
    payload = _guardian_review_payload()
    payload["incident"]["summary"] = "DISCORD_TOKEN=private-token failed for user@example.com and 1553794496234262641"
    payload["source_context"] += "\nFRIEREN_API_KEY=hidden"
    payload["source_context_hash"] = hashlib.sha256(payload["source_context"].encode("utf-8")).hexdigest()
    completion = {
        "rootCause": "The request path has no bounded timeout.",
        "confidence": "medium",
        "affectedFiles": ["guardian/automation.js"],
        "suggestedFix": "Add a bounded timeout.",
        "proposedPatch": "diff --git a/guardian/automation.js b/guardian/automation.js\n--- a/guardian/automation.js\n+++ b/guardian/automation.js\n@@ -1 +1 @@\n-old\n+new",
        "tests": ["Guardian timeout regression test"],
        "risks": ["Cancellation may not stop the upstream operation."],
    }
    prompts = []
    def fake_generate(prompt, *args, **kwargs):
        prompts.append(prompt)
        return json.dumps(completion), 0, "test-model"
    monkeypatch.setattr(api, "_generate_reply", fake_generate)
    response = api_client.post(
        "/internal/guardian-review", json=payload,
        headers={"Authorization": "Bearer " + "n" * 40},
    )
    assert response.status_code == 200
    result = response.json()
    assert result["status"] == "proposal_only"
    assert result["applied"] is False
    assert result["requiresHumanReview"] is True
    assert result["confidence"] == "medium"
    assert result["affectedFiles"] == ["guardian/automation.js"]
    assert result["sourceContextHash"] == payload["source_context_hash"]
    assert result["sourceCommitSha"] == "a" * 40
    assert len(prompts) == 1
    assert "private-token" not in prompts[0]
    assert "user@example.com" not in prompts[0]
    assert "1553794496234262641" not in prompts[0]
    assert "API_KEY=hidden" not in prompts[0]


def test_guardian_review_rejects_tampered_source_context(api_client, monkeypatch):
    monkeypatch.setenv("FRIEREN_API_TOKEN", "n" * 40)
    monkeypatch.setenv("FRIEREN_NEURAL_GUARDIAN_ENABLED", "1")
    monkeypatch.setenv("FRIEREN_NEURAL_QUALITY_APPROVED", "1")
    payload = _guardian_review_payload()
    payload["source_context_hash"] = "0" * 64
    response = api_client.post(
        "/internal/guardian-review", json=payload,
        headers={"Authorization": "Bearer " + "n" * 40},
    )
    assert response.status_code == 400



def test_guardian_review_bounds_incident_fields_and_rejects_unsafe_context_paths(api_client, monkeypatch):
    monkeypatch.setenv("FRIEREN_API_TOKEN", "n" * 40)
    monkeypatch.setenv("FRIEREN_NEURAL_GUARDIAN_ENABLED", "1")
    monkeypatch.setenv("FRIEREN_NEURAL_QUALITY_APPROVED", "1")
    headers = {"Authorization": "Bearer " + "n" * 40}

    oversized = _guardian_review_payload()
    oversized["incident"]["title"] = "x" * 161
    response = api_client.post("/internal/guardian-review", json=oversized, headers=headers)
    assert response.status_code == 422

    unsafe_path = _guardian_review_payload()
    unsafe_path["source_context_files"] = ["../secrets.env"]
    response = api_client.post("/internal/guardian-review", json=unsafe_path, headers=headers)
    assert response.status_code == 422
