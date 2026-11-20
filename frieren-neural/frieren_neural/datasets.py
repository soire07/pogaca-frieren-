"""Pinned, checksum-verified import for the Turkish Daily Dialogues 5K dataset."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import tempfile
import urllib.request
from pathlib import Path

DATASET_VERSION = "1.0.0"
DATASET_COMMIT = "ccd9f05c2f97684bbd9a55d818528da9dfb6bd5a"
DATASET_URL = (
    "https://raw.githubusercontent.com/3nesdeniz/turkish-daily-dialogues-5k/"
    f"{DATASET_COMMIT}/data/train.jsonl"
)
DATASET_SHA256 = "4e11cb6e311b355235a8b3174ecc3c6569d48e32f487bb199853035b7389047f"
EXPECTED_RECORDS = 3950
DATASET_SPLITS = {
    "validation": {
        "url": (
            "https://raw.githubusercontent.com/3nesdeniz/turkish-daily-dialogues-5k/"
            f"{DATASET_COMMIT}/data/validation.jsonl"
        ),
        "sha256": "3fbab155a66359f9bb32278cd0e638d5bea37a274ed06a1c24a4220c7bba5962",
        "records": 525,
    },
    "test": {
        "url": (
            "https://raw.githubusercontent.com/3nesdeniz/turkish-daily-dialogues-5k/"
            f"{DATASET_COMMIT}/data/test.jsonl"
        ),
        "sha256": "d3907c86283d894e45220501b6848e7cd0befc7a711fe62cbe8cad8533495ad2",
        "records": 525,
    },
}
MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024


def _render_dialogue(record: object, line_number: int, *, expected_split: str = "train") -> str:
    if not isinstance(record, dict):
        raise ValueError(f"Dataset row {line_number} must be a JSON object.")
    if record.get("split") != expected_split or record.get("language") != "tr" or record.get("synthetic") is not True:
        raise ValueError(f"Dataset row {line_number} has unexpected split, language, or provenance metadata.")
    messages = record.get("messages")
    if not isinstance(messages, list) or len(messages) not in {4, 6, 8}:
        raise ValueError(f"Dataset row {line_number} must contain 4, 6, or 8 messages.")
    rendered: list[str] = []
    expected_role = "user"
    for message in messages:
        if not isinstance(message, dict) or message.get("role") != expected_role:
            raise ValueError(f"Dataset row {line_number} has an invalid or non-alternating message role.")
        content = message.get("content")
        if not isinstance(content, str) or not content.strip():
            raise ValueError(f"Dataset row {line_number} contains empty or invalid message content.")
        label = "Kullanıcı" if expected_role == "user" else "Asistan"
        rendered.append(f"{label}: {content.strip()}")
        expected_role = "assistant" if expected_role == "user" else "user"
    return "\n".join(rendered)


def _atomic_write(path: Path, content: str) -> Path:
    temporary_name: str | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", newline="\n", dir=path.parent,
            prefix=f".{path.name}.", suffix=".tmp", delete=False
        ) as temporary:
            temporary_name = temporary.name
            temporary.write(content)
            temporary.flush()
            os.fsync(temporary.fileno())
        return Path(temporary_name)
    except Exception:
        if temporary_name and os.path.exists(temporary_name):
            os.unlink(temporary_name)
        raise


def prepare_turkish_daily_dialogues(
    output_dir: str | Path, *, split: str = "train"
) -> dict[str, str | int]:
    """Download one pinned dataset split, verify its digest, and create a licensed corpus."""
    if split == "train":
        source_url, expected_sha256, expected_records = DATASET_URL, DATASET_SHA256, EXPECTED_RECORDS
    elif split in DATASET_SPLITS:
        split_config = DATASET_SPLITS[split]
        source_url = split_config["url"]
        expected_sha256 = split_config["sha256"]
        expected_records = split_config["records"]
    else:
        raise ValueError("split must be one of: train, validation, test.")
    destination = Path(output_dir)
    if destination.exists() and (not destination.is_dir() or any(destination.iterdir())):
        raise FileExistsError("Output directory must be new or empty; existing files are never overwritten.")

    request = urllib.request.Request(
        source_url,
        headers={"User-Agent": "Frieren-Neural/0.1 dataset-preparation"},
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        raw = response.read(MAX_DOWNLOAD_BYTES + 1)
    if len(raw) > MAX_DOWNLOAD_BYTES:
        raise ValueError("Dataset download exceeded the 20 MiB safety limit.")
    digest = hashlib.sha256(raw).hexdigest()
    if digest != expected_sha256:
        raise ValueError("Dataset SHA-256 mismatch; refusing to use changed or corrupted training data.")

    documents: list[str] = []
    for line_number, raw_line in enumerate(raw.splitlines(), start=1):
        if not raw_line.strip():
            continue
        try:
            record = json.loads(raw_line)
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise ValueError(f"Dataset row {line_number} is not valid UTF-8 JSONL.") from error
        documents.append(_render_dialogue(record, line_number, expected_split=split))

    if len(documents) != expected_records:
        raise ValueError(f"Expected {expected_records} {split} dialogues; received {len(documents)}.")

    text_content = "\n\n---\n\n".join(documents) + "\n"
    manifest = {
        "schema_version": 1,
        "documents": [{
            "path": f"turkish-daily-dialogues-{split}.txt",
            "source": (
                "Turkish Daily Dialogues 5K v1.0.0 by Enes Deniz; "
                f"pinned source: {source_url}"
            ),
            "license": "CC BY 4.0",
            "usage": (
                "Training use permitted by the dataset card; attribution required to Enes Deniz, "
                "Turkish Daily Dialogues 5K v1.0.0. Source SHA-256: " + digest
            ),
        }],
    }
    manifest_content = json.dumps(manifest, ensure_ascii=False, indent=2) + "\n"

    destination.mkdir(parents=True, exist_ok=True)
    text_path = destination / f"turkish-daily-dialogues-{split}.txt"
    manifest_path = destination / "corpus_manifest.json"
    temporary_paths: list[Path] = []
    committed_paths: list[Path] = []
    try:
        temporary_paths.append(_atomic_write(text_path, text_content))
        temporary_paths.append(_atomic_write(manifest_path, manifest_content))
        # Publish the corpus only after both files are fully staged. If the
        # second rename fails, remove the first file so a retry is not blocked
        # by an incomplete output directory.
        for temporary_path, final_path in zip(
            temporary_paths, (text_path, manifest_path), strict=True
        ):
            if final_path.exists():
                raise FileExistsError(
                    f"Refusing to overwrite concurrently-created file: {final_path.name}"
                )
            os.replace(temporary_path, final_path)
            committed_paths.append(final_path)
    except Exception:
        for committed_path in reversed(committed_paths):
            try:
                committed_path.unlink(missing_ok=True)
            except OSError:
                # Preserve the original write error; a leftover file is safer
                # than hiding the failure that prevented a complete corpus.
                pass
        raise
    finally:
        for temporary_path in temporary_paths:
            temporary_path.unlink(missing_ok=True)

    return {
        "dataset": "Turkish Daily Dialogues 5K",
        "version": DATASET_VERSION,
        "split": split,
        "records": len(documents),
        "characters": len(text_content),
        "sha256": digest,
        "output": str(destination),
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Prepare the pinned, CC BY 4.0 Turkish Daily Dialogues training corpus."
    )
    parser.add_argument("--output", default="corpus/turkish-daily-dialogues")
    parser.add_argument("--split", choices=("train", "validation", "test"), default="train")
    args = parser.parse_args()
    result = prepare_turkish_daily_dialogues(args.output, split=args.split)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
