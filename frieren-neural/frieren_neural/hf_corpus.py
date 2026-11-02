"""Pinned, license-checked import for the Turkish Chat Max 25K SFT corpus.

Only visible user/assistant content is retained. Hidden reasoning and tool-call
payloads are deliberately excluded from the training text.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import tempfile
from pathlib import Path
from typing import Iterable

DATASET_ID = "cisimcik/turkish-chat-max-25k"
DATASET_URL = f"https://huggingface.co/datasets/{DATASET_ID}"
DATASET_LICENSE = "apache-2.0"
EXPECTED_DATASET_ROWS = 24_543
PREPROCESSING_VERSION = "2"
DIALOGUE_SEPARATOR = "\n\n---\n\n"
REVISION_RE = re.compile(r"^[0-9a-f]{40}$")


def _escape_training_controls(content: str) -> str:
    """Prevent message text from being parsed as chat roles or document boundaries."""
    escaped = re.sub(r"(?m)^(Kullanıcı|Asistan): ", r"\1： ", content)
    return escaped.replace(DIALOGUE_SEPARATOR, "\n\n— — —\n\n")


def _render_visible_dialogue(row: object) -> tuple[str, str] | None:
    """Return (row id, dialogue), dropping non-Turkish, tool and malformed rows."""
    if not isinstance(row, dict):
        return None
    row_id = row.get("id")
    if not isinstance(row_id, str) or not row_id.strip():
        return None
    if row.get("language_mode") != "tr_only" or row.get("has_tools") is not False:
        return None
    messages = row.get("messages")
    if not isinstance(messages, list) or not messages:
        return None

    system_parts: list[str] = []
    turns: list[list[str]] = []
    for message in messages:
        if not isinstance(message, dict):
            return None
        role = message.get("role")
        content = message.get("content")
        if role == "system":
            if isinstance(content, str) and content.strip() and not turns:
                system_parts.append(_escape_training_controls(content.strip()))
            continue
        if role not in {"user", "assistant"}:
            return None
        if role == "assistant" and message.get("tool_calls"):
            return None
        if not isinstance(content, str) or not content.strip():
            continue
        visible = _escape_training_controls(content.strip())
        if role == "user" and not turns and system_parts:
            visible = "Talimat: " + "\n".join(system_parts) + "\nKullanıcı isteği: " + visible
        if turns and turns[-1][0] == role:
            turns[-1][1] += "\n" + visible
        else:
            turns.append([role, visible])

    if turns and turns[-1][0] == "user":
        turns.pop()
    if len(turns) < 2 or len(turns) % 2 != 0 or turns[0][0] != "user" or turns[-1][0] != "assistant":
        return None
    if any(turns[index][0] == turns[index - 1][0] for index in range(1, len(turns))):
        return None

    rendered = []
    for role, text in turns:
        label = "Kullanıcı" if role == "user" else "Asistan"
        rendered.append(f"{label}: {text}")
    return row_id, "\n".join(rendered)


def _sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def build_corpus(rows: Iterable[object]) -> tuple[list[str], list[str], dict[str, int], list[str], list[str]]:
    """Filter and deterministically split conversations by stable row ID."""
    train_dialogues: list[str] = []
    heldout_dialogues: list[str] = []
    train_ids: list[str] = []
    heldout_ids: list[str] = []
    seen: set[str] = set()
    stats = {
        "total_rows": 0,
        "non_turkish_or_tool_rows": 0,
        "malformed_or_empty_rows": 0,
        "duplicate_rows": 0,
        "accepted_rows": 0,
    }
    for row in rows:
        stats["total_rows"] += 1
        candidate_id = row.get("id") if isinstance(row, dict) else None
        if isinstance(candidate_id, str) and candidate_id in seen:
            stats["duplicate_rows"] += 1
            continue
        rendered = _render_visible_dialogue(row)
        if rendered is None:
            if isinstance(row, dict) and (
                row.get("language_mode") != "tr_only" or row.get("has_tools") is not False
            ):
                stats["non_turkish_or_tool_rows"] += 1
            else:
                stats["malformed_or_empty_rows"] += 1
            continue
        row_id, dialogue = rendered
        seen.add(row_id)
        stats["accepted_rows"] += 1
        bucket = int(hashlib.sha256(row_id.encode("utf-8")).hexdigest()[:8], 16) % 10
        if bucket == 0:
            heldout_dialogues.append(dialogue)
            heldout_ids.append(row_id)
        else:
            train_dialogues.append(dialogue)
            train_ids.append(row_id)
    if not train_dialogues or not heldout_dialogues:
        raise ValueError("The filtered dataset must produce non-empty training and held-out splits.")
    return train_dialogues, heldout_dialogues, stats, train_ids, heldout_ids


def _stage_write(path: Path, content: str) -> Path:
    with tempfile.NamedTemporaryFile(
        mode="w", encoding="utf-8", newline="\n", dir=path.parent,
        prefix=f".{path.name}.", suffix=".tmp", delete=False,
    ) as temporary:
        temporary.write(content)
        temporary.flush()
        os.fsync(temporary.fileno())
        return Path(temporary.name)


def _write_split(
    root: Path, split: str, dialogues: list[str], row_ids: list[str], revision: str, stats: dict[str, int]
) -> dict[str, str | int]:
    split_dir = root / split
    split_dir.mkdir(parents=True, exist_ok=True)
    if any(split_dir.iterdir()):
        raise FileExistsError(f"Refusing to overwrite non-empty corpus split: {split_dir}")
    text_content = DIALOGUE_SEPARATOR.join(dialogues) + "\n"
    text_hash = _sha256_text(text_content)
    id_hash = _sha256_text("\n".join(sorted(row_ids)))
    relative_file = "turkish-chat-max-25k.txt"
    manifest = {
        "schema_version": 1,
        "dataset": {
            "id": DATASET_ID,
            "revision": revision,
            "license": DATASET_LICENSE,
            "preprocessing_version": PREPROCESSING_VERSION,
            "split": split,
            "dialogues": len(dialogues),
            "row_ids_sha256": id_hash,
            "filter": {
                "language_mode": "tr_only",
                "has_tools": False,
                "visible_content_only": True,
                "reasoning_field_included": False,
            },
            "source_stats": stats,
        },
        "documents": [{
            "path": relative_file,
            "source": f"{DATASET_URL} pinned to commit {revision}",
            "license": "Apache-2.0",
            "usage": (
                "Apache-2.0 permits model training. Only visible Turkish user/assistant content is included; "
                "hidden reasoning fields and tool calls are excluded. Retain Apache-2.0 attribution."
            ),
            "sha256": text_hash,
        }],
    }
    final_paths = (split_dir / relative_file, split_dir / "corpus_manifest.json")
    staged_paths: list[Path] = []
    committed_paths: list[Path] = []
    try:
        staged_paths.append(_stage_write(final_paths[0], text_content))
        staged_paths.append(_stage_write(
            final_paths[1], json.dumps(manifest, ensure_ascii=False, indent=2) + "\n"
        ))
        for staged, final in zip(staged_paths, final_paths, strict=True):
            if final.exists():
                raise FileExistsError(f"Refusing to overwrite corpus file: {final.name}")
            os.replace(staged, final)
            committed_paths.append(final)
    except Exception:
        for final in reversed(committed_paths):
            final.unlink(missing_ok=True)
        raise
    finally:
        for staged in staged_paths:
            staged.unlink(missing_ok=True)

    return {
        "split": split,
        "dialogues": len(dialogues),
        "characters": len(text_content),
        "sha256": text_hash,
        "row_ids_sha256": id_hash,
        "output": str(split_dir),
    }


def prepare_turkish_chat_max_25k(
    rows: Iterable[object], output_dir: str | Path, *, revision: str, license_name: str
) -> dict[str, object]:
    """Write checksum-verified train/held-out corpora from an immutable dataset revision."""
    if not isinstance(revision, str) or not REVISION_RE.fullmatch(revision):
        raise ValueError("A full immutable 40-character Hugging Face dataset revision is required.")
    if not isinstance(license_name, str) or license_name.lower().replace("_", "-") != DATASET_LICENSE:
        raise ValueError("Dataset license must be Apache-2.0; refusing unverified training data.")
    root = Path(output_dir)
    if root.exists() and (not root.is_dir() or any(root.iterdir())):
        raise FileExistsError("Output directory must be new or empty; existing files are never overwritten.")
    root.mkdir(parents=True, exist_ok=True)
    train, heldout, stats, train_ids, heldout_ids = build_corpus(rows)
    train_result = _write_split(root, "train", train, train_ids, revision, stats)
    heldout_result = _write_split(root, "heldout", heldout, heldout_ids, revision, stats)
    return {
        "dataset": DATASET_ID,
        "revision": revision,
        "license": DATASET_LICENSE,
        "stats": stats,
        "train": train_result,
        "heldout": heldout_result,
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Import the pinned Apache-2.0 Turkish Chat Max 25K dataset, excluding reasoning and tools."
    )
    parser.add_argument("--output", default="corpus/turkish-chat-max-25k")
    args = parser.parse_args()
    try:
        from datasets import load_dataset
        from huggingface_hub import HfApi
    except ImportError as error:
        raise SystemExit("Install Frieren Neural with the [data] extra to import this dataset.") from error

    info = HfApi().dataset_info(DATASET_ID)
    revision = info.sha
    card_data = info.cardData or {}
    license_name = card_data.get("license") if isinstance(card_data, dict) else getattr(card_data, "license", None)
    if not revision:
        raise SystemExit("Hugging Face did not provide an immutable dataset revision; refusing to continue.")
    dataset = load_dataset(DATASET_ID, split="train", revision=revision)
    if len(dataset) != EXPECTED_DATASET_ROWS:
        raise SystemExit(f"Expected {EXPECTED_DATASET_ROWS} pinned dataset rows; received {len(dataset)}.")
    result = prepare_turkish_chat_max_25k(
        dataset, args.output, revision=revision, license_name=license_name or ""
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
