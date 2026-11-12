import importlib.util
from pathlib import Path

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


def test_candidate_is_review_only():
    template = candidate.empty_review_template()
    assert template["candidate"] == "Qwen3-1.7B-GGUF-Q4_K_M"
    assert len(template["cases"]) == 24


def test_sha256_file_streams_and_matches_standard_digest(tmp_path):
    payload = b"Qwen3 benchmark checksum test" * 100_000
    path = tmp_path / "fixture.bin"
    path.write_bytes(payload)
    import hashlib
    assert candidate.sha256_file(path) == hashlib.sha256(payload).hexdigest()
