import urllib.error

from fastapi.testclient import TestClient

import frieren_neural.api as api


def test_gemini_health_exposes_safe_reason_for_provider_http_error(monkeypatch):
    monkeypatch.setenv("FRIEREN_MODEL_BACKEND", "gemini")
    monkeypatch.setenv("GEMINI_API_KEY", "synthetic-secret-key-" + "x" * 32)
    monkeypatch.setenv("FRIEREN_GEMINI_FREE_TIER_DATA_ACK", "1")
    monkeypatch.setenv("FRIEREN_HEALTH_GENERATION_SMOKE", "1")
    monkeypatch.setattr(api, "_load_active_runtime", lambda: api.GEMINI_MODEL_ID)
    monkeypatch.setattr(
        api, "_generate_reply",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(api.GeminiProviderError("provider_model_not_found", 404)),
    )
    api._run_generation_smoke.cache_clear()
    try:
        with TestClient(api.app, base_url="https://testserver") as client:
            response = client.get("/health")
        assert response.status_code == 503
        assert response.json() == {
            "status": "model_unavailable",
            "reason": "provider_model_not_found",
        }
        assert "synthetic-secret-key" not in response.text
    finally:
        api._run_generation_smoke.cache_clear()


def test_gemini_provider_maps_http_status_without_exposing_provider_body(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "synthetic-secret-key-" + "x" * 32)
    monkeypatch.setenv("FRIEREN_GEMINI_FREE_TIER_DATA_ACK", "1")

    def reject_request(_request, timeout):
        raise urllib.error.HTTPError(
            api.GEMINI_API_URL,
            403,
            "Forbidden",
            {},
            None,
        )

    monkeypatch.setattr(api.urllib.request, "urlopen", reject_request)
    try:
        api._generate_gemini_completion(
            "synthetic test prompt", max_new_tokens=8, temperature=0.2, top_k=1
        )
    except api.GeminiProviderError as error:
        assert error.reason == "provider_access_denied"
        assert error.http_status == 403
    else:
        raise AssertionError("Expected a classified Gemini provider error")


def test_gemini_health_classifies_missing_free_tier_ack_without_exposing_configuration(monkeypatch):
    monkeypatch.setenv("FRIEREN_MODEL_BACKEND", "gemini")
    monkeypatch.setenv("GEMINI_API_KEY", "synthetic-secret-key-" + "x" * 32)
    monkeypatch.delenv("FRIEREN_GEMINI_FREE_TIER_DATA_ACK", raising=False)
    with TestClient(api.app, base_url="https://testserver") as client:
        response = client.get("/health")
    assert response.status_code == 503
    assert response.json() == {
        "status": "model_unavailable",
        "reason": "free_tier_ack_missing",
    }
    assert "GEMINI_API_KEY" not in response.text
    assert "synthetic-secret-key" not in response.text


def test_gemini_provider_classifies_network_failure_without_leaking_url_details(monkeypatch):
    import urllib.error

    monkeypatch.setenv("GEMINI_API_KEY", "synthetic-secret-key-" + "x" * 32)
    monkeypatch.setenv("FRIEREN_GEMINI_FREE_TIER_DATA_ACK", "1")

    def network_failure(_request, timeout):
        raise urllib.error.URLError("synthetic-network-detail")

    monkeypatch.setattr(api.urllib.request, "urlopen", network_failure)
    try:
        api._generate_gemini_completion(
            "synthetic test prompt", max_new_tokens=8, temperature=0.2, top_k=1
        )
    except api.GeminiProviderError as error:
        assert error.reason == "provider_network_error"
        assert error.http_status is None
        assert "synthetic-network-detail" not in str(error)
    else:
        raise AssertionError("Expected a classified Gemini network error")


def test_gemini_health_reports_only_safe_credential_presence_flags(monkeypatch):
    monkeypatch.setenv("FRIEREN_MODEL_BACKEND", "gemini")
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.setenv("FRIEREN_GEMINI_FREE_TIER_DATA_ACK", "1")
    with TestClient(api.app, base_url="https://testserver") as client:
        response = client.get("/health")
    assert response.status_code == 503
    payload = response.json()
    assert payload["reason"] == "provider_credentials_missing"
    assert payload["diagnostics"] == {
        "credential_present": False,
        "credential_length_valid": False,
    }
    assert "GEMINI_API_KEY" not in response.text


def test_gemini_health_distinguishes_short_credential_without_exposing_it(monkeypatch):
    monkeypatch.setenv("FRIEREN_MODEL_BACKEND", "gemini")
    monkeypatch.setenv("GEMINI_API_KEY", "short-secret-value")
    monkeypatch.setenv("FRIEREN_GEMINI_FREE_TIER_DATA_ACK", "1")
    with TestClient(api.app, base_url="https://testserver") as client:
        response = client.get("/health")
    assert response.status_code == 503
    payload = response.json()
    assert payload["reason"] == "provider_credentials_missing"
    assert payload["diagnostics"] == {
        "credential_present": True,
        "credential_length_valid": False,
    }
    assert "short-secret-value" not in response.text



def test_gemini_health_smoke_uses_low_thinking_and_small_output_budget(monkeypatch):
    import io
    import json

    monkeypatch.setenv("GEMINI_API_KEY", "synthetic-secret-key-" + "x" * 32)
    monkeypatch.setenv("FRIEREN_GEMINI_FREE_TIER_DATA_ACK", "1")
    captured = {}

    def fake_urlopen(request, timeout):
        captured["payload"] = json.loads(request.data.decode("utf-8"))
        captured["timeout"] = timeout
        return io.BytesIO(json.dumps({
            "candidates": [{"content": {"parts": [{"text": "Merhaba"}]}}]
        }).encode("utf-8"))

    monkeypatch.setattr(api.urllib.request, "urlopen", fake_urlopen)
    completion = api._generate_gemini_completion(
        "health smoke", max_new_tokens=8, temperature=0.2, top_k=20,
        thinking_level="low",
    )
    assert completion == "Merhaba"
    assert captured["payload"]["generationConfig"]["maxOutputTokens"] == 32
    assert captured["payload"]["generationConfig"]["thinkingConfig"]["thinkingLevel"] == "low"
    assert captured["timeout"] == 60
