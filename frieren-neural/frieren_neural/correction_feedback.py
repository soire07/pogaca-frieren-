"""Privacy-conscious, evidence-gated intake for user-reported Neural corrections.

Corrections are suggestions, not truth. This module never trains a model or
changes a checkpoint. Only independently reviewed, source-backed approvals
can be exported to a separate candidate dataset.
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
        parsed = urlparse(item.strip())
        if parsed.scheme != "https" or not parsed.netloc or parsed.username or parsed.password:
            raise ValueError("Evidence references must be valid HTTPS URLs.")
        refs.append(item.strip())
    if len(set(refs)) != len(refs):
        raise ValueError("Evidence references must not contain duplicates.")
    return refs


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
    clean_prompt = _text(prompt, "prompt")
    clean_incorrect = _text(incorrect_answer, "incorrect_answer")
    clean_corrected = _text(corrected_answer, "corrected_answer")
    clean_language = _text(language, "language", maximum=32).lower()
    clean_sources = _source_refs(evidence_refs)

    canonical = {
        "schema_version": _SCHEMA_VERSION,
        "prompt": clean_prompt,
        "incorrect_answer": clean_incorrect,
        "corrected_answer": clean_corrected,
        "language": clean_language,
        "evidence_refs": clean_sources,
    }
    record_id = hashlib.sha256(
        json.dumps(canonical, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    return {
        **canonical,
        "record_id": record_id,
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
    """Record a two-reviewer decision; approval requires checked source evidence."""
    if not isinstance(candidate, dict) or candidate.get("schema_version") != _SCHEMA_VERSION:
        raise ValueError("Unsupported correction candidate.")
    if candidate.get("status") != "pending" or not candidate.get("record_id"):
        raise ValueError("Only pending correction candidates can be reviewed.")
    if decision not in _ALLOWED_DECISIONS:
        raise ValueError("decision must be approve or reject.")
    if (
        not isinstance(reviewer_identity_hashes, list)
        or len(reviewer_identity_hashes) != 2
        or any(not isinstance(value, str) or re.fullmatch(r"[a-f0-9]{64}", value) is None
               for value in reviewer_identity_hashes)
        or reviewer_identity_hashes[0] == reviewer_identity_hashes[1]
    ):
        raise ValueError("Two distinct reviewer identity hashes are required.")
    if decision == "approve":
        if evidence_checked is not True:
            raise ValueError("Source evidence must be checked before approval.")
        _source_refs(candidate.get("evidence_refs"))
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
    """Return minimal approved examples only; pending/rejected data is excluded."""
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
            or not isinstance(review.get("reviewer_identity_hashes"), list)
            or len(set(review["reviewer_identity_hashes"])) != 2
        ):
            continue
        record_id = record.get("record_id")
        if not isinstance(record_id, str) or record_id in seen:
            continue
        try:
            prompt = _text(record.get("prompt"), "prompt")
            corrected = _text(record.get("corrected_answer"), "corrected_answer")
            _source_refs(record.get("evidence_refs"))
        except ValueError:
            continue
        seen.add(record_id)
        exported.append({
            "prompt": prompt,
            "corrected_answer": corrected,
            "language": str(record.get("language", "")),
            "source_record_id": record_id,
        })
    return exported
