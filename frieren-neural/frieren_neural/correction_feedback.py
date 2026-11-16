"""Privacy-conscious, evidence-gated intake for user-reported Neural corrections.

Corrections are suggestions, not truth. This module never trains a model or
changes a checkpoint. Only integrity-checked, reviewed, source-backed approvals
can be exported to a separate candidate dataset. Reviewer hashes must be
provided by an authenticated review service; this module does not authenticate
reviewer identities or fetch/verify the contents of evidence URLs.
"""
from __future__ import annotations

import copy
import hashlib
import json
import re
from typing import Any, Iterable
from urllib.parse import urlparse

_SCHEMA_VERSION = 1
_SECRET_PATTERNS = (
    re.compile(r"(?i)\b(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,})\b"),
    re.compile(r"(?i)\b(?:password|parola|api[_ -]?key|access[_ -]?token)\s*[:=]\s*\S{8,}"),
)
_REVIEWER_HASH = re.compile(r"[a-f0-9]{64}")
_ALLOWED_DECISIONS = {"approve", "reject"}


def _text(value: object, field: str, *, maximum: int = 8_000) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{field} must be a non-empty string.")
    normalized = value.strip()
    if len(normalized) > maximum:
        raise ValueError(f"{field} exceeds the {maximum}-character limit.")
    if any(pattern.search(normalized) for pattern in _SECRET_PATTERNS):
        raise ValueError(f"{field} contains potentially sensitive content.")
    return normalized


def _source_refs(value: object) -> list[str]:
    if not isinstance(value, list) or not value:
        raise ValueError("At least one evidence source URL is required.")
    refs: list[str] = []
    for item in value:
        if not isinstance(item, str) or len(item) > 2_048:
            raise ValueError("Evidence references must be valid HTTPS URLs.")
        normalized = item.strip()
        parsed = urlparse(normalized)
        if parsed.scheme != "https" or not parsed.netloc or parsed.username or parsed.password:
            raise ValueError("Evidence references must be valid HTTPS URLs.")
        refs.append(normalized)
    if len(set(refs)) != len(refs):
        raise ValueError("Evidence references must not contain duplicates.")
    return refs


def _canonical_payload(record: dict[str, Any]) -> dict[str, Any]:
    if record.get("schema_version") != _SCHEMA_VERSION or record.get("consent_to_store") is not True:
        raise ValueError("Unsupported or non-consented correction record.")
    return {
        "schema_version": _SCHEMA_VERSION,
        "prompt": _text(record.get("prompt"), "prompt"),
        "incorrect_answer": _text(record.get("incorrect_answer"), "incorrect_answer"),
        "corrected_answer": _text(record.get("corrected_answer"), "corrected_answer"),
        "language": _text(record.get("language"), "language", maximum=32).lower(),
        "evidence_refs": _source_refs(record.get("evidence_refs")),
    }


def _record_id(payload: dict[str, Any]) -> str:
    canonical = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _valid_reviewer_hashes(value: object) -> bool:
    return (
        isinstance(value, list)
        and len(value) == 2
        and all(isinstance(item, str) and _REVIEWER_HASH.fullmatch(item) for item in value)
        and value[0] != value[1]
    )


def create_correction(
    *,
    prompt: str,
    incorrect_answer: str,
    corrected_answer: str,
    language: str,
    consent_to_store: bool,
    evidence_refs: list[str],
) -> dict[str, Any]:
    """Create an untrusted pending report; explicit consent is mandatory."""
    if consent_to_store is not True:
        raise ValueError("Explicit consent is required before storing a correction.")
    canonical = {
        "schema_version": _SCHEMA_VERSION,
        "prompt": _text(prompt, "prompt"),
        "incorrect_answer": _text(incorrect_answer, "incorrect_answer"),
        "corrected_answer": _text(corrected_answer, "corrected_answer"),
        "language": _text(language, "language", maximum=32).lower(),
        "evidence_refs": _source_refs(evidence_refs),
    }
    return {
        **canonical,
        "record_id": _record_id(canonical),
        "status": "pending",
        "consent_to_store": True,
        "review": None,
    }


def approve_correction(
    candidate: dict[str, Any],
    *,
    reviewer_identity_hashes: list[str],
    evidence_checked: bool,
    decision: str,
) -> dict[str, Any]:
    """Record a review decision; callers must authenticate reviewer identities."""
    if not isinstance(candidate, dict) or candidate.get("status") != "pending":
        raise ValueError("Only pending correction candidates can be reviewed.")
    if decision not in _ALLOWED_DECISIONS:
        raise ValueError("decision must be approve or reject.")
    if not _valid_reviewer_hashes(reviewer_identity_hashes):
        raise ValueError("Two distinct valid reviewer identity hashes are required.")

    try:
        payload = _canonical_payload(candidate)
    except ValueError as error:
        raise ValueError("Correction candidate integrity validation failed.") from error
    if candidate.get("record_id") != _record_id(payload):
        raise ValueError("Correction candidate integrity validation failed.")

    if decision == "approve":
        if evidence_checked is not True:
            raise ValueError("Source evidence must be checked before approval.")
    elif evidence_checked is not True and evidence_checked is not False:
        raise ValueError("evidence_checked must be an explicit boolean.")

    result = copy.deepcopy(candidate)
    result["status"] = "approved" if decision == "approve" else "rejected"
    result["review"] = {
        "reviewer_identity_hashes": list(reviewer_identity_hashes),
        "evidence_checked": evidence_checked,
        "decision": decision,
    }
    return result


def export_approved_corrections(records: Iterable[dict[str, Any]]) -> list[dict[str, str]]:
    """Return minimal approved examples only; pending/rejected/tampered data is excluded."""
    exported: list[dict[str, str]] = []
    seen: set[str] = set()
    for record in records:
        if not isinstance(record, dict) or record.get("status") != "approved":
            continue
        review = record.get("review")
        if (
            not isinstance(review, dict)
            or review.get("decision") != "approve"
            or review.get("evidence_checked") is not True
            or not _valid_reviewer_hashes(review.get("reviewer_identity_hashes"))
        ):
            continue
        try:
            payload = _canonical_payload(record)
        except ValueError:
            continue
        record_id = record.get("record_id")
        if not isinstance(record_id, str) or record_id != _record_id(payload) or record_id in seen:
            continue
        seen.add(record_id)
        exported.append({
            "prompt": payload["prompt"],
            "corrected_answer": payload["corrected_answer"],
            "language": payload["language"],
            "source_record_id": record_id,
        })
    return exported
