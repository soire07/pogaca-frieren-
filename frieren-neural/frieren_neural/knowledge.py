"""Curated, license-checked knowledge candidates for Frieren Neural.

This store never ingests private Discord messages. Only explicitly submitted
source excerpts can become candidates, and only two distinct reviewer tokens
can promote a candidate into the verified knowledge index.
"""
from __future__ import annotations

import argparse
import hashlib
import hmac
import json
import ipaddress
import os
import re
from pathlib import Path
from urllib.parse import urlparse
from typing import Any

ALLOWED_KNOWLEDGE_LICENSES = {
    "APACHE-2.0", "MIT", "CC0-1.0", "CC-BY-4.0", "CC-BY-SA-4.0"
}
_EMAIL = re.compile(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.IGNORECASE)
_SECRET = re.compile(
    r"(?i)(?:-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|"
    r"\b(?:sk-[a-z0-9]{20,}|gh[pousr]_[a-z0-9]{20,}|mfa\.[a-z0-9]{20,})\b|"
    r"\b(?:password|passwd|api[_ -]?key|access[_ -]?token|client[_ -]?secret)\s*[:=])"
)
_DISCORD_ID = re.compile(r"\b\d{17,20}\b")


def normalize_knowledge_license(value: object) -> str:
    if not isinstance(value, str):
        raise ValueError("A recognized open license is required.")
    normalized = "-".join(value.strip().split()).upper()
    if normalized not in ALLOWED_KNOWLEDGE_LICENSES:
        raise ValueError("Knowledge sources must use an approved open license.")
    return normalized


def _validate_public_https_url(value: object) -> str:
    if not isinstance(value, str) or len(value) > 2048:
        raise ValueError("A valid HTTPS source URL is required.")
    parsed = urlparse(value.strip())
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError("Knowledge source URLs must be public HTTPS URLs without credentials.")
    if parsed.port not in (None, 443):
        raise ValueError("Knowledge source URLs must use the standard HTTPS port.")
    host = parsed.hostname.rstrip(".").lower()
    if host in {"localhost", "localhost.localdomain"} or host.endswith(".local"):
        raise ValueError("Private and local source hosts are not accepted.")
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        address = None
    if address is not None and not address.is_global:
        raise ValueError("Private and non-global source addresses are not accepted.")
    return value.strip()


def _validate_knowledge_text(value: object, *, minimum: int, maximum: int, field: str) -> str:
    if not isinstance(value, str):
        raise ValueError(f"{field} must be text.")
    text = value.strip()
    if not minimum <= len(text) <= maximum:
        raise ValueError(f"{field} must contain between {minimum} and {maximum} characters.")
    if "\x00" in text or _EMAIL.search(text) or _SECRET.search(text) or _DISCORD_ID.search(text):
        raise ValueError(f"{field} contains private or secret-like data and was rejected.")
    return text


def validate_knowledge_candidate(payload: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise ValueError("Knowledge candidate must be an object.")
    title = _validate_knowledge_text(payload.get("title"), minimum=5, maximum=160, field="title")
    content = _validate_knowledge_text(payload.get("content"), minimum=30, maximum=2500, field="content")
    source_title = _validate_knowledge_text(payload.get("source_title"), minimum=3, maximum=180, field="source_title")
    source_excerpt = _validate_knowledge_text(payload.get("source_excerpt"), minimum=40, maximum=6000, field="source_excerpt")
    source_url = _validate_public_https_url(payload.get("source_url"))
    license_name = normalize_knowledge_license(payload.get("license"))
    revision = payload.get("source_revision")
    if revision is not None:
        if not isinstance(revision, str) or len(revision.strip()) > 120 or any(ord(ch) < 32 for ch in revision):
            raise ValueError("Source revision is invalid.")
        revision = revision.strip() or None
    return {
        "title": title,
        "content": content,
        "source_title": source_title,
        "source_excerpt": source_excerpt,
        "source_url": source_url,
        "source_revision": revision,
        "license": license_name,
        "source_sha256": hashlib.sha256(source_excerpt.encode("utf-8")).hexdigest(),
        "content_sha256": hashlib.sha256(content.encode("utf-8")).hexdigest(),
    }


def _database_url() -> str:
    value = os.environ.get("FRIEREN_DATABASE_URL", "").strip()
    if not value:
        raise RuntimeError("Knowledge storage is not configured.")
    return value


def _submitter_hash() -> str:
    token = os.environ.get("FRIEREN_API_TOKEN", "")
    if len(token) < 32:
        raise RuntimeError("Knowledge storage is not configured.")
    return hmac.new(token.encode("utf-8"), b"frieren-neural-knowledge-submitter-v1", hashlib.sha256).hexdigest()


def create_knowledge_candidate(payload: dict[str, Any]) -> dict[str, Any]:
    import psycopg

    item = validate_knowledge_candidate(payload)
    with psycopg.connect(_database_url(), connect_timeout=3) as connection:
        row = connection.execute(
            """INSERT INTO neural_knowledge_candidates
               (title, content, source_excerpt, source_title, source_url, source_revision,
                license, source_sha256, content_sha256, submitted_by_hash)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
               RETURNING candidate_id::text, status, created_at""",
            (
                item["title"], item["content"], item["source_excerpt"], item["source_title"],
                item["source_url"], item["source_revision"], item["license"],
                item["source_sha256"], item["content_sha256"], _submitter_hash(),
            ),
        ).fetchone()
    return {"candidate_id": row[0], "status": row[1], "created_at": row[2].isoformat(),
            "source_sha256": item["source_sha256"], "content_sha256": item["content_sha256"]}


def list_knowledge_candidates(*, status: str | None = None, limit: int = 50) -> list[dict[str, Any]]:
    import psycopg

    if status not in {None, "pending_review", "rejected", "promoted"}:
        raise ValueError("Invalid knowledge candidate status.")
    safe_limit = max(1, min(int(limit), 50))
    with psycopg.connect(_database_url(), connect_timeout=3) as connection:
        rows = connection.execute(
            """SELECT c.candidate_id::text, c.title, c.source_title, c.source_url,
                      c.source_revision, c.license, c.source_sha256, c.content_sha256,
                      c.status, c.created_at,
                      count(r.reviewer_identity_hash) FILTER (WHERE r.decision = 'approve') AS approvals
               FROM neural_knowledge_candidates c
               LEFT JOIN neural_knowledge_reviews r ON r.candidate_id = c.candidate_id
               WHERE (%s::text IS NULL OR c.status = %s)
               GROUP BY c.candidate_id
               ORDER BY c.created_at DESC
               LIMIT %s""",
            (status, status, safe_limit),
        ).fetchall()
    return [{
        "candidate_id": row[0], "title": row[1], "source_title": row[2],
        "source_url": row[3], "source_revision": row[4], "license": row[5],
        "source_sha256": row[6], "content_sha256": row[7], "status": row[8],
        "created_at": row[9].isoformat(), "approval_count": int(row[10]),
    } for row in rows]


def review_knowledge_candidate(candidate_id: str, *, decision: str, reviewer_token: str) -> dict[str, Any] | None:
    import uuid
    import psycopg

    try:
        parsed_id = str(uuid.UUID(candidate_id))
    except (ValueError, TypeError, AttributeError) as error:
        raise ValueError("Knowledge candidate ID is invalid.") from error
    if decision not in {"approve", "reject"}:
        raise ValueError("Review decision must be approve or reject.")
    if not isinstance(reviewer_token, str) or len(reviewer_token.strip()) < 32 or len(reviewer_token) > 256:
        raise ValueError("Reviewer token must be private and at least 32 characters.")
    reviewer_hash = hashlib.sha256(
        ("frieren-neural-knowledge-review-v1:" + reviewer_token.strip()).encode("utf-8")
    ).hexdigest()

    with psycopg.connect(_database_url(), connect_timeout=3) as connection:
        with connection.transaction():
            candidate = connection.execute(
                "SELECT status FROM neural_knowledge_candidates WHERE candidate_id = %s FOR UPDATE",
                (parsed_id,),
            ).fetchone()
            if candidate is None:
                return None
            if candidate[0] != "pending_review":
                raise ValueError("Knowledge candidate is no longer pending review.")
            inserted = connection.execute(
                """INSERT INTO neural_knowledge_reviews (candidate_id, reviewer_identity_hash, decision)
                   VALUES (%s,%s,%s) ON CONFLICT (candidate_id, reviewer_identity_hash) DO NOTHING
                   RETURNING reviewer_identity_hash""",
                (parsed_id, reviewer_hash, decision),
            ).fetchone()
            if inserted is None:
                raise ValueError("This reviewer has already reviewed the candidate.")
            if decision == "reject":
                connection.execute(
                    "UPDATE neural_knowledge_candidates SET status='rejected', updated_at=now() WHERE candidate_id=%s",
                    (parsed_id,),
                )
                status = "rejected"
                approvals = connection.execute(
                    "SELECT count(*) FROM neural_knowledge_reviews WHERE candidate_id=%s AND decision='approve'",
                    (parsed_id,),
                ).fetchone()[0]
            else:
                reviewers = connection.execute(
                    """SELECT reviewer_identity_hash FROM neural_knowledge_reviews
                       WHERE candidate_id=%s AND decision='approve'
                       ORDER BY reviewed_at, reviewer_identity_hash LIMIT 2""",
                    (parsed_id,),
                ).fetchall()
                approvals = len(reviewers)
                if approvals >= 2:
                    connection.execute(
                        """INSERT INTO neural_knowledge_entries
                           (candidate_id, title, content, source_title, source_url, source_revision,
                            license, source_sha256, content_sha256, approved_by_hashes)
                           SELECT candidate_id, title, content, source_title, source_url, source_revision,
                                  license, source_sha256, content_sha256, %s::char(64)[]
                           FROM neural_knowledge_candidates WHERE candidate_id=%s
                           ON CONFLICT (candidate_id) DO NOTHING""",
                        ([reviewers[0][0], reviewers[1][0]], parsed_id),
                    )
                    connection.execute(
                        "UPDATE neural_knowledge_candidates SET status='promoted', updated_at=now() WHERE candidate_id=%s",
                        (parsed_id,),
                    )
                    status = "promoted"
                else:
                    status = "pending_review"
    return {"candidate_id": parsed_id, "status": status, "approval_count": approvals}


def search_verified_knowledge(query: str, *, limit: int = 5) -> list[dict[str, Any]]:
    import psycopg

    search = _validate_knowledge_text(query, minimum=2, maximum=200, field="query")
    safe_limit = max(1, min(int(limit), 10))
    with psycopg.connect(_database_url(), connect_timeout=3) as connection:
        rows = connection.execute(
            """SELECT entry_id::text, title, content, source_title, source_url,
                      source_revision, license, source_sha256, content_sha256, verified_at
               FROM neural_knowledge_entries
               WHERE to_tsvector('simple', title || ' ' || content)
                     @@ plainto_tsquery('simple', %s)
               ORDER BY ts_rank(to_tsvector('simple', title || ' ' || content),
                                plainto_tsquery('simple', %s)) DESC, verified_at DESC
               LIMIT %s""",
            (search, search, safe_limit),
        ).fetchall()
    return [{
        "entry_id": row[0], "title": row[1], "content": row[2], "source_title": row[3],
        "source_url": row[4], "source_revision": row[5], "license": row[6],
        "source_sha256": row[7], "content_sha256": row[8], "verified_at": row[9].isoformat(),
    } for row in rows]


def export_verified_knowledge(output_dir: str | Path, *, license_name: str) -> dict[str, Any]:
    """Export only two-reviewer-promoted knowledge as a pinned training corpus."""
    import psycopg

    normalized_license = normalize_knowledge_license(license_name)
    output = Path(output_dir).resolve()
    output.mkdir(parents=True, exist_ok=True)
    text_path = output / "verified-knowledge.txt"
    manifest_path = output / "corpus_manifest.json"
    if text_path.exists() or manifest_path.exists():
        raise FileExistsError("Knowledge export destination already contains a corpus file.")

    with psycopg.connect(_database_url(), connect_timeout=3) as connection:
        rows = connection.execute(
            """SELECT title, content, source_title, source_url, source_revision,
                      license, source_sha256, content_sha256, approved_by_hashes
               FROM neural_knowledge_entries
               WHERE license=%s
               ORDER BY verified_at, entry_id""",
            (normalized_license,),
        ).fetchall()
    if not rows:
        raise ValueError("No verified knowledge entries exist for the selected license.")

    dialogues: list[str] = []
    source_records: list[str] = []
    source_hashes: list[str] = []
    for row in rows:
        title, content, source_title, source_url, source_revision, stored_license, source_sha, content_sha, reviewers = row
        if stored_license != normalized_license:
            raise ValueError("Verified knowledge license changed after promotion.")
        if hashlib.sha256(content.encode("utf-8")).hexdigest() != content_sha:
            raise ValueError("Verified knowledge content fingerprint mismatch.")
        if not re.fullmatch(r"[a-f0-9]{64}", source_sha or ""):
            raise ValueError("Verified knowledge source fingerprint is invalid.")
        if not isinstance(reviewers, list) or len(reviewers) != 2 or reviewers[0] == reviewers[1]:
            raise ValueError("Verified knowledge does not contain two distinct reviewer hashes.")
        if any(not re.fullmatch(r"[a-f0-9]{64}", str(value)) for value in reviewers):
            raise ValueError("Verified knowledge reviewer evidence is invalid.")
        if re.search(r"(?im)^\s*(?:Kullanıcı|Asistan)\s*:", title + "\\n" + content):
            raise ValueError("Verified knowledge contains a dialogue role marker.")
        dialogues.append("Kullanıcı: " + title + "\nAsistan: " + content + "\n")
        source_records.append(
            str(source_title) + " <" + str(source_url) + ">" +
            (" @ " + str(source_revision) if source_revision else "")
        )
        source_hashes.append(source_sha)

    corpus_text = "\n".join(dialogues)
    processed_sha = hashlib.sha256(corpus_text.encode("utf-8")).hexdigest()
    source_fingerprint = hashlib.sha256("".join(sorted(source_hashes)).encode("ascii")).hexdigest()
    revision = hashlib.sha1(
        (normalized_license + ":" + processed_sha + ":" + source_fingerprint).encode("ascii")
    ).hexdigest()
    manifest = {
        "schema_version": 1,
        "dataset": {
            "id": "frieren-neural/verified-knowledge",
            "revision": revision,
            "license": normalized_license,
            "split": "train",
            "dialogues": len(dialogues),
            "source_sha256": source_fingerprint,
            "processed_sha256": processed_sha,
        },
        "documents": [{
            "path": text_path.name,
            "source": "Two-reviewer-approved public sources: " + " | ".join(source_records),
            "license": normalized_license,
            "usage": "Curated, two-reviewer-approved knowledge summaries for supervised fine-tuning; no private chat messages.",
            "sha256": processed_sha,
        }],
    }
    text_path.write_text(corpus_text, encoding="utf-8")
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {
        "output_dir": str(output),
        "dataset_id": manifest["dataset"]["id"],
        "dataset_revision": revision,
        "license": normalized_license,
        "dialogues": len(dialogues),
        "processed_sha256": processed_sha,
        "source_fingerprint_sha256": source_fingerprint,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Export only verified Neural knowledge as a pinned training corpus.")
    parser.add_argument("--output", required=True, help="New or empty output directory.")
    parser.add_argument("--license", required=True, help="One approved SPDX license for this corpus snapshot.")
    args = parser.parse_args()
    result = export_verified_knowledge(args.output, license_name=args.license)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
