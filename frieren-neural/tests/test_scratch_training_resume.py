import pytest
import torch

from frieren_neural import scratch_training


def test_resume_rejects_checkpoint_from_different_corpus(tmp_path):
    checkpoint = tmp_path / "checkpoint.pt"
    torch.save(
        {
            "format_version": 2,
            "architecture_id": "frieren-neural-transformer-v2",
            "step": 3,
            "training_corpus_sha256": "a" * 64,
            "manifest_sha256": "b" * 64,
        },
        checkpoint,
    )
    with pytest.raises(ValueError, match="corpus"):
        scratch_training._validate_resume_payload(
            torch.load(checkpoint, map_location="cpu", weights_only=True),
            training_corpus_sha256="c" * 64,
            manifest_sha256="b" * 64,
        )


def test_resume_requires_optimizer_and_rng_state():
    payload = {
        "format_version": 2,
        "architecture_id": "frieren-neural-transformer-v2",
        "step": 3,
        "training_corpus_sha256": "a" * 64,
        "manifest_sha256": "b" * 64,
    }
    with pytest.raises(ValueError, match="optimizer"):
        scratch_training._validate_resume_payload(
            payload,
            training_corpus_sha256="a" * 64,
            manifest_sha256="b" * 64,
        )


def test_resume_validates_total_steps():
    with pytest.raises(ValueError, match="greater than"):
        scratch_training._validate_resume_step(6, 6)
    assert scratch_training._validate_resume_step(4, 6) == 5
