import importlib.util
from pathlib import Path

import pytest

MODULE_PATH = Path(__file__).parents[1] / "benchmarks" / "qwen3_1_7b_gguf_q4_cpu.py"
spec = importlib.util.spec_from_file_location("qwen3_1_7b_gguf_q4_cpu", MODULE_PATH)
candidate = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(candidate)


def test_candidate_is_immutable_and_apache_licensed():
    assert candidate.MODEL_URL.endswith(
        "/resolve/daeb8e2d528a760970442092f6bf1e55c3b659eb/Qwen3-1.7B-Q4_K_M.gguf"
    )
    assert candidate.MODEL_SHA256 == "d2387ca2dbfee2ffabce7120d3770dadca0b293052bc2f0e138fdc940d9bc7b5"
    assert candidate.MODEL_MAX_SIZE_BYTES == 1400 * 1024 * 1024


def test_candidate_review_is_bound_to_exact_outputs_and_model():
    outputs = [
        {"id": f"TR-{number:03d}", "output": f"yanıt {number}"}
        for number in range(1, 25)
    ]
    template = candidate.empty_review_template(outputs)
    assert template["candidate"] == "Qwen3-1.7B-GGUF-Q4_K_M"
    assert len(template["cases"]) == 24
    assert template["candidate_binding"]["checkpoint_sha256"] == candidate.MODEL_SHA256
    assert len(template["candidate_binding"]["outputs_sha256"]) == 64
    assert template["candidate_binding"]["prompt_set_version"] == candidate.PROMPT_SET_VERSION
    assert template["reviewer_identity_hashes"] == {"reviewer_1": None, "reviewer_2": None}


def test_candidate_cannot_be_selected_as_a_serving_backend(monkeypatch):
    from frieren_neural.api import _model_backend

    monkeypatch.setenv("FRIEREN_MODEL_BACKEND", "qwen3")
    with pytest.raises(RuntimeError, match="must be 'scratch', 'ufakzeka', or 'groq'"):
        _model_backend()


def test_sha256_file_streams_and_matches_standard_digest(tmp_path):
    payload = b"Qwen3 benchmark checksum test" * 100_000
    path = tmp_path / "fixture.bin"
    path.write_bytes(payload)
    import hashlib
    assert candidate.sha256_file(path) == hashlib.sha256(payload).hexdigest()



def test_candidate_metadata_can_be_overridden_for_a_pinned_baseline():
    assert candidate.MODEL_SHA256 == "d2387ca2dbfee2ffabce7120d3770dadca0b293052bc2f0e138fdc940d9bc7b5"
    assert candidate.MAX_NEW_TOKENS == 256


def test_matched_report_comparator_rejects_different_inference_conditions():
    comparator_path = Path(__file__).parents[1] / "benchmarks" / "compare_qwen3_cpu_reports.py"
    comparator_spec = importlib.util.spec_from_file_location("compare_qwen3_cpu_reports", comparator_path)
    comparator = importlib.util.module_from_spec(comparator_spec)
    assert comparator_spec.loader is not None
    comparator_spec.loader.exec_module(comparator)
    base = {
        "prompt_set_version": "tr-conversation-v1",
        "prompt_count": 1,
        "device": "cpu",
        "threads": 2,
        "context_tokens": 1024,
        "max_new_tokens": 256,
        "decoding_settings": {"temperature": 0.7, "top_p": 0.8},
        "outputs": [{"id": "TR-001", "prompt": "Merhaba", "output": "Selam", "latency_seconds": 1.0}],
        "generation_total_seconds": 1.0,
        "latency_median_seconds": 1.0,
        "latency_p95_seconds": 1.0,
        "peak_process_rss_mib": 100.0,
        "model_id": "candidate",
        "model_sha256": "a" * 64,
        "model_size_bytes": 100,
    }
    other = {**base, "outputs": [dict(base["outputs"][0])]}
    assert comparator.build_comparison(base, other)["conditions_match"] is True
    other["threads"] = 1
    with pytest.raises(ValueError, match="threads"):
        comparator.build_comparison(base, other)


def test_matched_report_comparator_rejects_prompt_mismatch():
    comparator_path = Path(__file__).parents[1] / "benchmarks" / "compare_qwen3_cpu_reports.py"
    comparator_spec = importlib.util.spec_from_file_location("compare_qwen3_cpu_reports", comparator_path)
    comparator = importlib.util.module_from_spec(comparator_spec)
    assert comparator_spec.loader is not None
    comparator_spec.loader.exec_module(comparator)
    base = {
        "prompt_set_version": "tr-conversation-v1", "prompt_count": 1, "device": "cpu",
        "threads": 2, "context_tokens": 1024, "max_new_tokens": 256,
        "decoding_settings": {}, "outputs": [{"id": "TR-001", "prompt": "Merhaba", "output": "Selam", "latency_seconds": 1.0}],
        "generation_total_seconds": 1.0, "latency_median_seconds": 1.0,
        "latency_p95_seconds": 1.0, "peak_process_rss_mib": 100.0,
        "model_id": "candidate", "model_sha256": "a" * 64, "model_size_bytes": 100,
    }
    other = {**base, "outputs": [{"id": "TR-001", "prompt": "Farklı soru", "output": "Selam", "latency_seconds": 1.0}]}
    with pytest.raises(ValueError, match="Prompt IDs/order/text"):
        comparator.build_comparison(base, other)
