from __future__ import annotations

import pytest

from frieren_neural.teacher_distillation import (
    MODEL_ID,
    MODEL_LICENSE,
    MODEL_REVISION,
    build_dataset_record,
    validate_teacher_draft,
)


def test_valid_teacher_output_is_review_only_not_training_eligible():
    draft = validate_teacher_draft(
        "TR-010", "240 TL ürüne yüzde 15 indirim uygulanır.",
        "İndirim tutarı 36 TL olur. Son fiyat 204 TL'dir.",
    )
    record = build_dataset_record(draft, generated_at="2026-11-08T00:00:00Z")

    assert draft["status"] == "review_required"
    assert draft["human_review"]["approved"] is False
    assert record["training_eligible"] is False
    assert record["teacher"] == {
        "model_id": MODEL_ID,
        "revision": MODEL_REVISION,
        "license": MODEL_LICENSE,
    }


def test_too_short_teacher_output_is_rejected():
    draft = validate_teacher_draft("TR-001", "Merhaba de.", "Merhaba.")
    assert draft["status"] == "rejected"
    assert draft["reason"] == "too_short"


def test_teacher_role_prefix_is_removed():
    draft = validate_teacher_draft(
        "TR-004", "API nedir?",
        "Asistan: API, uygulamaların birbiriyle iletişim kurmasını sağlayan arayüzdür.",
    )
    assert not draft["response"].startswith("Asistan:")
    assert draft["status"] == "review_required"


@pytest.mark.parametrize("prompt_id", ["", "bad-id", "TR-1"])
def test_invalid_prompt_ids_are_rejected(prompt_id):
    with pytest.raises(ValueError):
        validate_teacher_draft(prompt_id, "Bir soru", "Bu yeterince uzun bir örnek yanıt metnidir.")


def test_teacher_provenance_is_pinned_and_apache_licensed():
    assert MODEL_ID == "Qwen/Qwen3-0.6B"
    assert len(MODEL_REVISION) == 40
    assert MODEL_LICENSE == "Apache-2.0"
