import pytest

from frieren_neural.correction_feedback import (
    approve_correction,
    create_correction,
    export_approved_corrections,
)


def _candidate():
    return create_correction(
        prompt="Python'da liste nasıl sıralanır?",
        incorrect_answer="list.sort() yeni bir liste döndürür.",
        corrected_answer="list.sort() listeyi yerinde değiştirir ve None döndürür.",
        language="tr",
        consent_to_store=True,
        evidence_refs=["https://docs.python.org/3/library/stdtypes.html#list.sort"],
    )


def test_new_correction_is_pending_and_not_training_data():
    candidate = _candidate()

    assert candidate["status"] == "pending"
    assert candidate["record_id"]
    assert export_approved_corrections([candidate]) == []


def test_correction_requires_explicit_storage_consent():
    with pytest.raises(ValueError, match="consent"):
        create_correction(
            prompt="Soru",
            incorrect_answer="Yanlış",
            corrected_answer="Doğru",
            language="tr",
            consent_to_store=False,
            evidence_refs=["https://example.org/source"],
        )


def test_correction_rejects_secret_like_content():
    with pytest.raises(ValueError, match="sensitive"):
        create_correction(
            prompt="API key sk-12345678901234567890 nedir?",
            incorrect_answer="Yanlış",
            corrected_answer="Doğru",
            language="tr",
            consent_to_store=True,
            evidence_refs=["https://example.org/source"],
        )


def test_approval_requires_two_distinct_reviewers_and_evidence():
    candidate = _candidate()
    with pytest.raises(ValueError, match="two distinct"):
        approve_correction(
            candidate,
            reviewer_identity_hashes=["a" * 64, "a" * 64],
            evidence_checked=True,
            decision="approve",
        )
    with pytest.raises(ValueError, match="evidence"):
        approve_correction(
            candidate,
            reviewer_identity_hashes=["a" * 64, "b" * 64],
            evidence_checked=False,
            decision="approve",
        )


def test_only_approved_evidence_checked_corrections_can_be_exported():
    candidate = _candidate()
    approved = approve_correction(
        candidate,
        reviewer_identity_hashes=["a" * 64, "b" * 64],
        evidence_checked=True,
        decision="approve",
    )

    exported = export_approved_corrections([candidate, approved])

    assert len(exported) == 1
    assert exported[0]["prompt"] == candidate["prompt"]
    assert exported[0]["corrected_answer"] == candidate["corrected_answer"]
    assert exported[0]["source_record_id"] == candidate["record_id"]


def test_rejected_correction_never_enters_training_export():
    candidate = _candidate()
    rejected = approve_correction(
        candidate,
        reviewer_identity_hashes=["a" * 64, "b" * 64],
        evidence_checked=True,
        decision="reject",
    )

    assert rejected["status"] == "rejected"
    assert export_approved_corrections([rejected]) == []
