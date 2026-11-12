import json
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


def test_gemini_provider_maps_http_status_without_logging_response_body(monkeypatch, caplog):
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
