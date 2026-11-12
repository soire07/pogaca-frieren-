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
    with pytest.raises(RuntimeError, match="must be 'scratch' or 'ufakzeka'"):
        _model_backend()


def test_sha256_file_streams_and_matches_standard_digest(tmp_path):
    payload = b"Qwen3 benchmark checksum test" * 100_000
    path = tmp_path / "fixture.bin"
    path.write_bytes(payload)
    import hashlib
    assert candidate.sha256_file(path) == hashlib.sha256(payload).hexdigest()
