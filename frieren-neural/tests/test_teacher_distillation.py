from __future__ import annotations

import pytest

from frieren_neural.teacher_distillation import (
    MODEL_ID, MODEL_LICENSE, MODEL_REVISION, build_dataset_record,
    semantic_rejection_reason, validate_teacher_draft,
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
        "model_id": MODEL_ID, "revision": MODEL_REVISION, "license": MODEL_LICENSE,
    }


def test_wrong_math_is_rejected_even_when_response_is_long_enough():
    draft = validate_teacher_draft("TR-010", "İndirim hesapla.", "240 TL ürünün indirimli fiyatı 168 TL'dir.")
    assert draft["status"] == "rejected"
    assert draft["reason"] == "math_expected_204_tl_missing"


def test_correct_answer_with_wrong_intermediate_price_is_rejected():
    for wrong_price in ("168 TL", "220 TL"):
        draft = validate_teacher_draft("TR-010", "İndirim hesapla.", f"{wrong_price} olur, ancak sonuç 204 TL'dir.")
        assert draft["status"] == "rejected"
        assert draft["reason"] == "math_contains_known_wrong_price"


def test_summary_cannot_turn_stopped_deployment_into_restart():
    answer = "Yedek alındı, test ortamında denendi ve hata sonrası canlı sistem yeniden başlatıldı."
    draft = validate_teacher_draft("TR-008", "Özetle.", answer)
    assert draft["status"] == "rejected"
    assert draft["reason"] == "summary_changes_stopped_deployment_into_restart"


def test_stale_port_is_rejected():
    draft = validate_teacher_draft("TR-018", "Port düzeltmesi.", "Sunucu 8080 portunda; değişiklik 8081 olarak kaydedildi.")
    assert draft["status"] == "rejected"
    assert draft["reason"] == "stale_port_8080_present"


def test_tcp_definition_requires_correct_protocol_name():
    assert semantic_rejection_reason("TR-017", "TCP bit mesajları protokolüdür.") == "tcp_definition_incorrect"
    assert semantic_rejection_reason("TR-017", "TCP, Transmission Control Protocol'dür.") is None


def test_read_only_boundary_rejects_write_operations():
    assert semantic_rejection_reason("TR-024", "Yalnızca oku, veritabanına update yap.") == "read_only_boundary_conflict"
    assert semantic_rejection_reason("TR-024", "Salt okunur kalacağım; hiçbir yazma yapmayacağım.") is None


def test_code_example_cannot_claim_nonempty_list_is_empty():
    answer = "my_list = [1, 2, 3]\nif not my_list: print('Listen boş.')"
    draft = validate_teacher_draft("TR-013", "Listeyi kontrol et.", answer)
    assert draft["status"] == "rejected"
    assert draft["reason"] == "code_example_output_contradicts_nonempty_list"


def test_prompt_ids_are_validated():
    for prompt_id in ("", "bad-id", "TR-1"):
        with pytest.raises(ValueError):
            validate_teacher_draft(prompt_id, "Bir soru", "Bu yeterince uzun bir örnek yanıt metnidir.")


def test_teacher_provenance_is_pinned_and_apache_licensed():
    assert MODEL_ID == "Qwen/Qwen3-0.6B"
    assert len(MODEL_REVISION) == 40
    assert MODEL_LICENSE == "Apache-2.0"
