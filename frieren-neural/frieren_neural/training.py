"""Small, resumable next-token training pipeline for Frieren Neural."""

from __future__ import annotations

import argparse
import hashlib
import hmac
import json
import math
import os
import random
import re
import tempfile
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Sequence

import torch
from torch import Tensor

from .model import GPTConfig, GPTLanguageModel
from .tokenizer import BPETokenizer


SUPPORTED_SUFFIXES = {".txt", ".md"}
HELDOUT_EVALUATION_VERSION = "frieren-neural-heldout-v1"
DIALOGUE_SEPARATOR = "\n\n---\n\n"
DIALOGUE_ENCODING_VERSION = 2
LOSS_OBJECTIVE_VERSION = 2


@dataclass(frozen=True)
class TrainingConfig:
    max_steps: int = 1_000
    eval_interval: int = 100
    eval_batches: int = 20
    batch_size: int = 16
    block_size: int = 128
    learning_rate: float = 3e-4
    weight_decay: float = 0.1
    validation_fraction: float = 0.1
    seed: int = 1337
    d_model: int = 128
    n_heads: int = 4
    n_layers: int = 4
    dropout: float = 0.1
    grad_clip: float = 1.0
    tokenizer_vocab_size: int = 512
    tokenizer_min_frequency: int = 2

    def __post_init__(self) -> None:
        if self.max_steps < 1 or self.eval_interval < 1 or self.eval_batches < 1:
            raise ValueError("Training steps and evaluation intervals must be positive.")
        if self.batch_size < 1 or self.block_size < 2:
            raise ValueError("batch_size must be positive and block_size must be at least 2.")
        if self.learning_rate <= 0 or self.weight_decay < 0 or self.grad_clip <= 0:
            raise ValueError("Learning rate and gradient clipping must be positive; weight decay cannot be negative.")
        if not 0.0 < self.validation_fraction < 0.5:
            raise ValueError("validation_fraction must be between 0 and 0.5.")
        if self.d_model < 1 or self.n_heads < 1 or self.n_layers < 1 or self.d_model % self.n_heads:
            raise ValueError("Model dimensions must be positive and d_model divisible by n_heads.")
        if not 0.0 <= self.dropout < 1.0:
            raise ValueError("dropout must be in [0, 1).")
        if self.tokenizer_vocab_size < BPETokenizer.BASE_VOCAB_SIZE or self.tokenizer_min_frequency < 1:
            raise ValueError("BPE vocabulary must be at least 260 and minimum frequency must be positive.")


def load_text_corpus(path: str | Path) -> list[str]:
    """Load UTF-8 .txt/.md documents from a file or directory in stable order."""
    root = Path(path)
    if not root.exists():
        raise FileNotFoundError(f"Corpus path does not exist: {root}")
    files = [root] if root.is_file() else sorted(
        item for item in root.rglob("*") if item.is_file() and item.suffix.lower() in SUPPORTED_SUFFIXES
    )
    documents: list[str] = []
    for file_path in files:
        if file_path.suffix.lower() not in SUPPORTED_SUFFIXES:
            continue
        text = file_path.read_text(encoding="utf-8").strip()
        if text:
            documents.append(text)
    if not documents:
        raise ValueError(f"No non-empty UTF-8 .txt or .md documents found in {root}")
    return documents



def load_licensed_corpus(path: str | Path) -> list[str]:
    """Load a corpus only when every text file has explicit source/license metadata."""
    root = Path(path)
    if not root.is_dir():
        raise ValueError("Licensed corpus path must be a directory.")
    root_resolved = root.resolve()
    manifest_path = root / "corpus_manifest.json"
    if not manifest_path.is_file() or not manifest_path.resolve().is_relative_to(root_resolved):
        raise ValueError("A corpus_manifest.json file inside the corpus directory is required before CLI training.")
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ValueError("corpus_manifest.json must be valid UTF-8 JSON.") from error
    entries = manifest.get("documents") if isinstance(manifest, dict) else None
    if not isinstance(manifest, dict) or manifest.get("schema_version") != 1 or not isinstance(entries, list) or not entries:
        raise ValueError("Corpus manifest must use schema_version 1 and contain a non-empty documents list.")

    declared: set[str] = set()
    documents: list[str] = []
    for entry in entries:
        if not isinstance(entry, dict):
            raise ValueError("Each corpus manifest document must be an object.")
        relative_path = entry.get("path")
        metadata = (entry.get("source"), entry.get("license"), entry.get("usage"))
        if (not isinstance(relative_path, str) or not relative_path.strip()
                or any(not isinstance(value, str) or not value.strip() or "replace" in value.lower()
                       for value in metadata)):
            raise ValueError("Every corpus entry needs a path, source, license, and usage description.")
        file_path = (root / relative_path).resolve()
        if not file_path.is_relative_to(root_resolved):
            raise ValueError(f"Corpus file must stay inside the corpus directory: {relative_path}")
        if file_path.suffix.lower() not in SUPPORTED_SUFFIXES or not file_path.is_file():
            raise ValueError(f"Corpus file must exist and end in .txt or .md: {relative_path}")
        canonical_path = file_path.relative_to(root_resolved).as_posix()
        if canonical_path in declared:
            raise ValueError(f"Duplicate corpus manifest path: {canonical_path}")
        declared.add(canonical_path)
        raw_bytes = file_path.read_bytes()
        try:
            raw_content = raw_bytes.decode("utf-8")
        except UnicodeDecodeError as error:
            raise ValueError(f"Corpus file must be valid UTF-8: {canonical_path}") from error
        content = raw_content.strip()
        if not content:
            raise ValueError(f"Corpus file is empty: {canonical_path}")
        expected_sha256 = entry.get("sha256")
        if (not isinstance(expected_sha256, str) or not re.fullmatch(r"[a-f0-9]{64}", expected_sha256)):
            raise ValueError(f"Corpus SHA-256 is required and must be 64 lowercase hexadecimal characters: {canonical_path}")
        actual_sha256 = hashlib.sha256(raw_bytes).hexdigest()
        if not hmac.compare_digest(actual_sha256, expected_sha256):
            raise ValueError(f"Corpus SHA-256 mismatch: {canonical_path}")
        documents.append(content)

    actual_files: set[str] = set()
    for file_path in root.rglob("*"):
        if file_path.is_file() and file_path.suffix.lower() in SUPPORTED_SUFFIXES:
            resolved = file_path.resolve()
            if not resolved.is_relative_to(root_resolved):
                raise ValueError("Corpus symlinks must not point outside the corpus directory.")
            actual_files.add(resolved.relative_to(root_resolved).as_posix())
    if actual_files != declared:
        raise ValueError("Manifest paths must exactly match all .txt/.md files in the corpus directory.")
    return documents



def load_corpus_manifest_metadata(path: str | Path, *, required_split: str | None = None) -> dict[str, Any]:
    """Validate a pinned corpus manifest and return source/split fingerprints."""
    root = Path(path)
    root_resolved = root.resolve()
    manifest_path = root / "corpus_manifest.json"
    if not manifest_path.is_file() or not manifest_path.resolve().is_relative_to(root_resolved):
        raise ValueError("A corpus manifest inside the corpus directory is required.")
    raw_manifest = manifest_path.read_bytes()
    try:
        manifest = json.loads(raw_manifest.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ValueError("corpus_manifest.json must be valid UTF-8 JSON.") from error
    if not isinstance(manifest, dict) or manifest.get("schema_version") != 1:
        raise ValueError("Corpus manifest schema_version 1 is required.")
    dataset = manifest.get("dataset")
    documents = manifest.get("documents")
    if not isinstance(dataset, dict) or not isinstance(documents, list) or len(documents) != 1:
        raise ValueError("Corpus manifest must contain one pinned dataset document.")
    document = documents[0]
    if not isinstance(document, dict):
        raise ValueError("Corpus manifest document metadata is invalid.")
    source_split = dataset.get("split")
    sample_count = dataset.get("dialogues")
    revision = dataset.get("revision")
    source_sha256 = dataset.get("source_sha256")
    processed_sha256 = dataset.get("processed_sha256")
    dataset_id = dataset.get("id")
    license_name = dataset.get("license")
    if required_split is not None and source_split != required_split:
        raise ValueError(f"Expected a {required_split} corpus split, got {source_split!r}.")
    if required_split is None and source_split not in {"heldout", "test"}:
        raise ValueError(f"Expected a heldout/test corpus split, got {source_split!r}.")
    if isinstance(sample_count, bool) or not isinstance(sample_count, int) or sample_count < 1:
        raise ValueError("Corpus manifest must include a positive dialogue count.")
    if not isinstance(revision, str) or not re.fullmatch(r"[a-f0-9]{40}", revision):
        raise ValueError("Corpus manifest must pin a 40-character dataset revision.")
    if not isinstance(source_sha256, str) or not re.fullmatch(r"[a-f0-9]{64}", source_sha256):
        raise ValueError("Corpus manifest must include a source-file SHA-256.")
    if not isinstance(dataset_id, str) or not dataset_id.strip():
        raise ValueError("Corpus manifest dataset ID is required.")
    if not isinstance(license_name, str) or not license_name.strip():
        raise ValueError("Corpus manifest dataset license is required.")
    document_path = document.get("path")
    if not isinstance(document_path, str) or not document_path.strip():
        raise ValueError("Corpus manifest document path is required.")
    if any(not isinstance(document.get(key), str) or not document[key].strip()
           for key in ("source", "license", "usage", "sha256")):
        raise ValueError("Corpus manifest document source, license, usage, and SHA-256 are required.")
    if document["license"] != license_name:
        raise ValueError("Dataset and document licenses must match.")
    if not re.fullmatch(r"[a-f0-9]{64}", processed_sha256 or "") or document["sha256"] != processed_sha256:
        raise ValueError("Dataset processed-file SHA-256 must match its document fingerprint.")
    document_file = (root / document_path).resolve()
    if not document_file.is_relative_to(root_resolved) or not document_file.is_file():
        raise ValueError("Corpus manifest document must resolve to a file inside the corpus directory.")
    actual_processed_sha256 = hashlib.sha256(document_file.read_bytes()).hexdigest()
    if actual_processed_sha256 != processed_sha256:
        raise ValueError("Processed corpus file SHA-256 does not match the pinned manifest.")
    return {
        "dataset_sha256": hashlib.sha256(raw_manifest).hexdigest(),
        "sample_count": sample_count,
        "split": "heldout" if source_split in {"heldout", "test"} else source_split,
        "source_split": source_split,
        "evaluation_version": HELDOUT_EVALUATION_VERSION,
        "dataset_id": dataset_id,
        "dataset_revision": revision,
        "source_fingerprint_sha256": source_sha256,
        "processed_sha256": processed_sha256,
        "row_ids_sha256": dataset.get("row_ids_sha256"),
    }


def _normalize_training_dataset_metadata(value: dict[str, Any] | None) -> dict[str, Any] | None:
    if value is None:
        return None
    required_hashes = ("dataset_sha256", "source_fingerprint_sha256", "processed_sha256")
    if any(not isinstance(value.get(key), str) or not re.fullmatch(r"[a-f0-9]{64}", value[key]) for key in required_hashes):
        raise ValueError("Training dataset metadata must contain pinned manifest, source, and processed SHA-256 fingerprints.")
    if not isinstance(value.get("dataset_id"), str) or not value["dataset_id"].strip():
        raise ValueError("Training dataset ID is required.")
    if not isinstance(value.get("dataset_revision"), str) or not re.fullmatch(r"[a-f0-9]{40}", value["dataset_revision"]):
        raise ValueError("Training dataset revision must be pinned to a 40-character commit.")
    if value.get("split") != "train":
        raise ValueError("Training checkpoint metadata must identify the train split.")
    sample_count = value.get("sample_count")
    if isinstance(sample_count, bool) or not isinstance(sample_count, int) or sample_count < 1:
        raise ValueError("Training dataset sample count must be positive.")
    return {
        "dataset_sha256": value["dataset_sha256"],
        "dataset_id": value["dataset_id"],
        "dataset_revision": value["dataset_revision"],
        "source_fingerprint_sha256": value["source_fingerprint_sha256"],
        "processed_sha256": value["processed_sha256"],
        "split": "train",
        "sample_count": sample_count,
    }


def encode_dialogue_stream_with_loss_mask(
    text: str, tokenizer: BPETokenizer
) -> tuple[list[int], list[bool]]:
    """Encode chat context fully while supervising assistant turns and their EOS only."""
    if not isinstance(text, str) or not text.strip():
        raise ValueError("Dialogue text must be a non-empty string.")
    dialogues = [part.strip() for part in text.split(DIALOGUE_SEPARATOR) if part.strip()]
    if not dialogues:
        raise ValueError("Dialogue text must contain at least one non-empty dialogue.")

    token_ids: list[int] = []
    loss_mask: list[bool] = []
    for dialogue in dialogues:
        parts = [
            part for part in re.split(r"(?m)(?=^(?:Kullanıcı|Asistan): )", dialogue)
            if part
        ]
        if not parts or not parts[0].startswith("Kullanıcı: "):
            encoded = tokenizer.encode(dialogue, add_bos=True, add_eos=True)
            token_ids.extend(encoded)
            # Preserve legacy full-text training for non-chat corpora. BOS is context,
            # never a prediction target.
            loss_mask.extend([False] + [True] * (len(encoded) - 1))
            continue

        token_ids.append(tokenizer.bos_id)
        loss_mask.append(False)
        expected_role = "Kullanıcı"
        for part in parts:
            if part.startswith("Kullanıcı: "):
                role = "Kullanıcı"
            elif part.startswith("Asistan: "):
                role = "Asistan"
            else:
                raise ValueError("Dialogue contains a message without a recognized role label.")
            if role != expected_role:
                raise ValueError("Dialogue messages must alternate between user and assistant roles.")
            if role == "Asistan":
                # The assistant role marker is supplied by the inference prompt;
                # supervise only the response body and its EOS boundary.
                marker = "Asistan:"
                if not part.startswith(marker):
                    raise ValueError("Assistant message is missing its exact role marker.")
                marker_ids = tokenizer.encode(marker)
                body_ids = tokenizer.encode(part[len(marker):])
                token_ids.extend(marker_ids)
                loss_mask.extend([False] * len(marker_ids))
                token_ids.extend(body_ids)
                loss_mask.extend([True] * len(body_ids))
                token_ids.append(tokenizer.eos_id)
                loss_mask.append(True)
                expected_role = "Kullanıcı"
            else:
                encoded = tokenizer.encode(part)
                token_ids.extend(encoded)
                loss_mask.extend([False] * len(encoded))
                expected_role = "Asistan"
        if expected_role == "Asistan":
            token_ids.append(tokenizer.eos_id)
            loss_mask.append(False)
    return token_ids, loss_mask


def encode_dialogue_stream(text: str, tokenizer: BPETokenizer) -> list[int]:
    """Compatibility wrapper returning the encoded dialogue token stream."""
    token_ids, _ = encode_dialogue_stream_with_loss_mask(text, tokenizer)
    return token_ids


def _corpus_fingerprint(documents: Sequence[str]) -> str:
    """Hash normalized documents with length-prefix framing to avoid boundary collisions."""
    digest = hashlib.sha256(b"frieren-neural-corpus-v2\0")
    for document in documents:
        encoded = document.strip().encode("utf-8")
        digest.update(len(encoded).to_bytes(8, byteorder="big"))
        digest.update(encoded)
    return digest.hexdigest()


def _corpus_content_fingerprint(documents: Sequence[str]) -> str:
    """Hash normalized text independent of how a caller groups documents."""
    normalized = " ".join(" ".join(document.split()) for document in documents).encode("utf-8")
    return hashlib.sha256(normalized).hexdigest()


def split_corpus_text(
    documents: Sequence[str], validation_fraction: float = 0.1
) -> tuple[str, str]:
    """Split complete dialogues by stable content hash to avoid source-order distribution bias.

    Identical dialogue copies are kept in the same split, preventing exact-duplicate
    leakage. Hash ordering makes the split deterministic and independent of source order.
    """
    if not documents or any(not isinstance(item, str) or not item.strip() for item in documents):
        raise ValueError("documents must contain non-empty strings.")
    if not 0.0 < validation_fraction < 0.5:
        raise ValueError("validation_fraction must be between 0 and 0.5.")
    combined = "\n".join(item.strip() for item in documents)
    separator = "\n\n---\n\n"
    if len(documents) > 1:
        units = [item.strip() for item in documents]
        joiner = "\n"
    elif separator in combined:
        units = [item.strip() for item in combined.split(separator) if item.strip()]
        joiner = separator
    else:
        units = []
        joiner = ""

    if units:
        groups: dict[str, list[str]] = {}
        for item in units:
            normalized = " ".join(item.split())
            fingerprint = hashlib.sha256(normalized.encode("utf-8")).hexdigest()
            groups.setdefault(fingerprint, []).append(item)
        ordered_groups = sorted(groups.items())
        if len(ordered_groups) < 2:
            raise ValueError("Corpus must contain at least two distinct dialogues for a leakage-safe split.")
        target_validation_size = max(1, int(sum(map(len, units)) * validation_fraction))
        validation_hashes: set[str] = set()
        validation_characters = 0
        for fingerprint, copies in reversed(ordered_groups):
            if len(validation_hashes) >= len(ordered_groups) - 1:
                break
            validation_hashes.add(fingerprint)
            validation_characters += sum(map(len, copies))
            if validation_characters >= target_validation_size:
                break
        train_units = [
            item for fingerprint, copies in ordered_groups if fingerprint not in validation_hashes
            for item in copies
        ]
        validation_units = [
            item for fingerprint, copies in ordered_groups if fingerprint in validation_hashes
            for item in copies
        ]
        if not train_units or not validation_units:
            raise ValueError("Corpus must contain non-empty training and validation documents.")
        return joiner.join(train_units), joiner.join(validation_units)

    # Retain the legacy chronological character split for a single unstructured text.
    validation_size = max(1, int(len(combined) * validation_fraction))
    training_size = len(combined) - validation_size
    if training_size < 2 or validation_size < 2:
        raise ValueError("Corpus text must contain at least four characters for a useful split.")
    return combined[:training_size], combined[training_size:]

def split_tokens(tokens: Tensor, validation_fraction: float = 0.1) -> tuple[Tensor, Tensor]:
    """Split a token stream chronologically to reduce train/validation leakage."""
    if tokens.ndim != 1:
        raise ValueError("tokens must be a one-dimensional tensor.")
    if not 0.0 < validation_fraction < 0.5:
        raise ValueError("validation_fraction must be between 0 and 0.5.")
    validation_size = max(1, int(len(tokens) * validation_fraction))
    training_size = len(tokens) - validation_size
    if training_size < 2 or validation_size < 2:
        raise ValueError("Token stream must contain at least four tokens for a useful split.")
    return tokens[:training_size], tokens[training_size:]


def _valid_batch_starts(target_mask: Tensor, block_size: int) -> Tensor:
    """Precompute windows containing at least one supervised next-token target."""
    if target_mask.dtype != torch.bool or target_mask.ndim != 1:
        raise ValueError("target_mask must be a one-dimensional boolean tensor.")
    if block_size < 1 or len(target_mask) <= block_size:
        raise ValueError("target_mask must contain more tokens than block_size.")
    windows = target_mask.unfold(0, block_size + 1, 1)[:, 1:]
    starts = torch.nonzero(windows.any(dim=1), as_tuple=False).flatten()
    if starts.numel() == 0:
        raise ValueError("Token split contains no assistant targets in any training window.")
    return starts


def _sample_batch(
    data: Tensor, *, batch_size: int, block_size: int, device: torch.device,
    generator: torch.Generator, target_mask: Tensor | None = None,
    valid_starts: Tensor | None = None,
) -> tuple[Tensor, Tensor]:
    """Sample a batch with cached valid starts and vectorized tensor indexing."""
    if len(data) <= block_size:
        raise ValueError(f"Each token split must contain more than block_size ({block_size}) tokens.")
    if target_mask is not None:
        if target_mask.shape != data.shape or target_mask.dtype != torch.bool:
            raise ValueError("target_mask must be a boolean tensor matching the token stream.")
        if valid_starts is None:
            valid_starts = _valid_batch_starts(target_mask, block_size)
        if valid_starts.ndim != 1 or valid_starts.numel() == 0:
            raise ValueError("valid_starts must be a non-empty one-dimensional tensor.")
        choices = torch.randint(valid_starts.numel(), (batch_size,), generator=generator)
        starts = valid_starts[choices]
    else:
        starts = torch.randint(len(data) - block_size, (batch_size,), generator=generator)

    offsets = torch.arange(block_size + 1, dtype=torch.long)
    indices = starts[:, None] + offsets[None, :]
    sampled = data[indices]
    inputs = sampled[:, :-1]
    targets = sampled[:, 1:].clone()
    if target_mask is not None:
        masks = target_mask[indices[:, 1:]]
        targets.masked_fill_(~masks, -100)
    return inputs.to(device), targets.to(device)


@torch.no_grad()
def evaluate_loss(
    model: GPTLanguageModel,
    data: Tensor,
    *,
    batch_size: int,
    block_size: int,
    batches: int = 20,
    seed: int = 1337,
    target_mask: Tensor | None = None,
) -> float:
    """Return deterministic loss over supervised targets only when a mask is supplied."""
    if batches < 1:
        raise ValueError("batches must be positive.")
    was_training = model.training
    model.eval()
    losses: list[float] = []
    generator = torch.Generator(device="cpu").manual_seed(seed)
    valid_starts = _valid_batch_starts(target_mask, block_size) if target_mask is not None else None
    try:
        for _ in range(batches):
            inputs, targets = _sample_batch(
                data, batch_size=batch_size, block_size=block_size,
                device=next(model.parameters()).device, generator=generator,
                target_mask=target_mask, valid_starts=valid_starts,
            )
            _, loss = model(inputs, targets=targets)
            losses.append(float(loss.item()))
    finally:
        model.train(was_training)
    return sum(losses) / len(losses)


@torch.no_grad()
def _evaluate_pair(
    model: GPTLanguageModel, train_data: Tensor, validation_data: Tensor, config: TrainingConfig,
    device: torch.device, seed: int, train_mask: Tensor, validation_mask: Tensor,
) -> tuple[float, float]:
    was_training = model.training
    model.eval()
    generator = torch.Generator(device="cpu").manual_seed(seed)
    results = []
    valid_start_sets = (
        _valid_batch_starts(train_mask, config.block_size),
        _valid_batch_starts(validation_mask, config.block_size),
    )
    try:
        for data, target_mask, valid_starts in (
            (train_data, train_mask, valid_start_sets[0]),
            (validation_data, validation_mask, valid_start_sets[1]),
        ):
            values = []
            for _ in range(config.eval_batches):
                x, y = _sample_batch(data, batch_size=config.batch_size, block_size=config.block_size,
                                     device=device, generator=generator, target_mask=target_mask,
                                     valid_starts=valid_starts)
                _, loss = model(x, targets=y)
                values.append(float(loss.item()))
            results.append(sum(values) / len(values))
    finally:
        model.train(was_training)
    return results[0], results[1]


def _atomic_save(payload: dict[str, object], destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary_name: str | None = None
    try:
        with tempfile.NamedTemporaryFile(dir=destination.parent, suffix=".tmp", delete=False) as temporary:
            temporary_name = temporary.name
        torch.save(payload, temporary_name)
        os.replace(temporary_name, destination)
    finally:
        if temporary_name and os.path.exists(temporary_name):
            os.unlink(temporary_name)


def train_model(
    documents: Sequence[str],
    checkpoint_path: str | Path,
    config: TrainingConfig | None = None,
    *,
    resume: bool = False,
    initialize_from: str | Path | None = None,
    device: str | torch.device | None = None,
    training_dataset_metadata: dict[str, Any] | None = None,
) -> dict[str, float | int | str]:
    """Train a small GPT model, optionally warm-starting a separate candidate from a checkpoint."""

    settings = config or TrainingConfig()
    normalized_training_dataset = _normalize_training_dataset_metadata(training_dataset_metadata)
    if not documents or any(not isinstance(item, str) or not item.strip() for item in documents):
        raise ValueError("documents must contain non-empty strings.")
    random.seed(settings.seed)
    torch.manual_seed(settings.seed)
    selected_device = torch.device(device or ("cuda" if torch.cuda.is_available() else "cpu"))
    if selected_device.type == "cpu":
        # Tiny CPU transformer workloads regress badly with large host thread pools.
        torch.set_num_threads(max(1, min(4, os.cpu_count() or 1)))
    corpus_fingerprint = _corpus_fingerprint(documents)
    corpus_content_fingerprint = _corpus_content_fingerprint(documents)
    train_text, validation_text = split_corpus_text(documents, settings.validation_fraction)
    checkpoint = Path(checkpoint_path)
    if resume and initialize_from is not None:
        raise ValueError("resume and initialize_from cannot be used together.")
    source_path = checkpoint if resume else (Path(initialize_from) if initialize_from is not None else None)
    if resume and not checkpoint.is_file():
        raise FileNotFoundError(f"Cannot resume; checkpoint not found: {checkpoint}")
    if initialize_from is not None:
        if not source_path.is_file():
            raise FileNotFoundError(f"Warm-start checkpoint not found: {source_path}")
        if source_path.resolve() == checkpoint.resolve():
            raise ValueError("Candidate checkpoint must not overwrite its parent checkpoint.")

    source_payload = None
    if initialize_from is not None and normalized_training_dataset is None:
        raise ValueError("Warm-start candidates require pinned training dataset provenance.")

    if source_path is not None:
        source_payload = torch.load(source_path, map_location=selected_device, weights_only=True)
        if not isinstance(source_payload, dict) or source_payload.get("format_version") != 2:
            raise ValueError("Source checkpoint has an incompatible format version.")
        if source_payload.get("dialogue_encoding_version") != DIALOGUE_ENCODING_VERSION:
            raise ValueError("Source checkpoint dialogue encoding is incompatible with this training run.")
        if source_payload.get("loss_objective_version") != LOSS_OBJECTIVE_VERSION:
            raise ValueError("Source checkpoint loss objective is incompatible with this training run.")
        if resume and source_payload.get("corpus_sha256") != corpus_fingerprint:
            raise ValueError("Training corpus does not match this checkpoint.")
        saved_training_config = dict(source_payload.get("training_config", {}))
        current_training_config = asdict(settings)
        mutable_fields = ("max_steps",) if resume else ("max_steps", "learning_rate")
        for mutable in mutable_fields:
            saved_training_config.pop(mutable, None)
            current_training_config.pop(mutable, None)
        model_setting_fields = (
            "block_size", "d_model", "n_heads", "n_layers", "dropout",
            "tokenizer_vocab_size", "tokenizer_min_frequency",
        )
        if any(
            source_payload.get("training_config", {}).get(key) != asdict(settings).get(key)
            for key in model_setting_fields
        ):
            if initialize_from is not None:
                raise ValueError("Warm-start checkpoint model/tokenizer settings do not match this candidate.")
            raise ValueError("Checkpoint model/tokenizer settings do not match this run.")
        if saved_training_config != current_training_config:
            raise ValueError("Source checkpoint training settings do not match this run.")
        if not isinstance(source_payload.get("tokenizer"), dict):
            raise ValueError("Source checkpoint is missing its tokenizer.")
        tokenizer = BPETokenizer.from_dict(source_payload["tokenizer"])
        train_ids, train_loss_mask = encode_dialogue_stream_with_loss_mask(train_text, tokenizer)
        validation_ids, validation_loss_mask = encode_dialogue_stream_with_loss_mask(validation_text, tokenizer)
        if min(len(train_ids), len(validation_ids)) <= settings.block_size:
            raise ValueError("Source checkpoint tokenizer does not provide enough tokens for this context window.")
    else:
        # BPE can compress very small/repetitive validation splits below the
        # context window. Reduce the merge budget deterministically until both
        # splits retain enough tokens; byte-level fallback is lossless.
        effective_vocab_size = settings.tokenizer_vocab_size
        while True:
            tokenizer = BPETokenizer.train(
                [train_text], vocab_size=effective_vocab_size,
                min_frequency=settings.tokenizer_min_frequency
            )
            train_ids, train_loss_mask = encode_dialogue_stream_with_loss_mask(train_text, tokenizer)
            validation_ids, validation_loss_mask = encode_dialogue_stream_with_loss_mask(validation_text, tokenizer)
            if min(len(train_ids), len(validation_ids)) > settings.block_size:
                break
            if effective_vocab_size == BPETokenizer.BASE_VOCAB_SIZE:
                raise ValueError(
                    "Corpus is too short for the configured block_size, even with byte-level tokenization."
                )
            effective_vocab_size = max(
                BPETokenizer.BASE_VOCAB_SIZE,
                BPETokenizer.BASE_VOCAB_SIZE
                + (effective_vocab_size - BPETokenizer.BASE_VOCAB_SIZE) // 2,
            )
    train_data = torch.tensor(train_ids, dtype=torch.long)
    validation_data = torch.tensor(validation_ids, dtype=torch.long)
    train_target_mask = torch.tensor(train_loss_mask, dtype=torch.bool)
    validation_target_mask = torch.tensor(validation_loss_mask, dtype=torch.bool)
    # The assistant-only window scan is corpus-dependent, so perform it once,
    # not on every optimizer step.
    train_valid_starts = _valid_batch_starts(train_target_mask, settings.block_size)

    model_config = GPTConfig(
        vocab_size=tokenizer.vocab_size, d_model=settings.d_model, n_heads=settings.n_heads,
        n_layers=settings.n_layers, max_seq_len=settings.block_size, dropout=settings.dropout
    )
    model = GPTLanguageModel(model_config).to(selected_device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=settings.learning_rate, weight_decay=settings.weight_decay)
    start_step = 0
    parent_checkpoint_sha256: str | None = None
    parent_checkpoint_step: int | None = None
    parent_training_dataset: dict[str, Any] | None = None

    if initialize_from is not None:
        parent = source_payload
        if (parent.get("model_config") != asdict(model_config)
                or parent.get("tokenizer") != tokenizer.to_dict()):
            raise ValueError("Warm-start checkpoint model/tokenizer settings do not match this candidate.")
        parent_training_dataset = _normalize_training_dataset_metadata(parent.get("training_dataset"))
        if parent_training_dataset is None:
            raise ValueError("Warm-start checkpoint is missing pinned training dataset provenance.")
        model.load_state_dict(parent["model_state"])
        parent_checkpoint_sha256 = hashlib.sha256(source_path.read_bytes()).hexdigest()
        parent_checkpoint_step = int(parent["step"])

    if resume:
        saved = source_payload
        if saved.get("format_version") != 2:
            raise ValueError("Unsupported checkpoint format; start a fresh run with the current trainer.")
        if saved.get("dialogue_encoding_version", 1) != DIALOGUE_ENCODING_VERSION:
            raise ValueError(
                "Checkpoint uses an incompatible dialogue encoding; start a fresh training run."
            )
        if saved.get("loss_objective_version") != LOSS_OBJECTIVE_VERSION:
            raise ValueError(
                "Checkpoint uses an incompatible loss objective; start a fresh assistant-only training run."
            )
        saved_training_config = dict(saved.get("training_config", {}))
        current_training_config = asdict(settings)
        saved_training_config.pop("max_steps", None)
        current_training_config.pop("max_steps", None)
        if saved.get("training_dataset") != normalized_training_dataset:
            raise ValueError("Training dataset manifest does not match this checkpoint.")
        if saved.get("corpus_sha256") != corpus_fingerprint:
            raise ValueError("Training corpus does not match this checkpoint.")
        if (saved.get("model_config") != asdict(model_config)
                or saved.get("tokenizer") != tokenizer.to_dict()):
            raise ValueError("Checkpoint model/tokenizer settings do not match this run.")
        if saved_training_config != current_training_config:
            raise ValueError("Checkpoint training settings do not match this run (max_steps may increase).")
        model.load_state_dict(saved["model_state"])
        optimizer.load_state_dict(saved["optimizer_state"])
        parent_checkpoint_sha256 = str(saved.get("parent_checkpoint_sha256") or "") or None
        parent_checkpoint_step = int(saved.get("parent_checkpoint_step") or 0) or None
        parent_training_dataset = _normalize_training_dataset_metadata(saved.get("parent_training_dataset"))
        start_step = int(saved["step"])
        if settings.max_steps < start_step:
            raise ValueError("max_steps cannot be lower than the checkpoint step when resuming.")
        train_loss = float(saved["train_loss"])
        validation_loss = float(saved["validation_loss"])

    batch_generator = torch.Generator(device="cpu").manual_seed(settings.seed + start_step)
    if resume:
        batch_generator.set_state(saved["batch_generator_state"].cpu())
        torch.set_rng_state(saved["torch_rng_state"].cpu())
        if selected_device.type == "cuda" and saved.get("cuda_rng_states") is not None:
            torch.cuda.set_rng_state_all(saved["cuda_rng_states"])
    final_step = start_step
    for step in range(start_step + 1, settings.max_steps + 1):
        final_step = step
        model.train()
        x, y = _sample_batch(
            train_data, batch_size=settings.batch_size, block_size=settings.block_size,
            device=selected_device, generator=batch_generator, target_mask=train_target_mask,
            valid_starts=train_valid_starts,
        )
        _, loss = model(x, targets=y)
        optimizer.zero_grad(set_to_none=True)
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), settings.grad_clip)
        optimizer.step()

        if step % settings.eval_interval == 0 or step == settings.max_steps:
            train_loss, validation_loss = _evaluate_pair(
                model, train_data, validation_data, settings, selected_device, settings.seed + step,
                train_target_mask, validation_target_mask,
            )
            _atomic_save({
                "format_version": 2,
                "dialogue_encoding_version": DIALOGUE_ENCODING_VERSION,
                "loss_objective_version": LOSS_OBJECTIVE_VERSION,
                "step": step,
                "parent_checkpoint_sha256": parent_checkpoint_sha256,
                "parent_checkpoint_step": parent_checkpoint_step,
                "model_config": asdict(model_config),
                "training_config": asdict(settings),
                "tokenizer": tokenizer.to_dict(),
                "corpus_sha256": corpus_fingerprint,
                "corpus_content_sha256": corpus_content_fingerprint,
                "training_dataset": normalized_training_dataset,
                "parent_training_dataset": parent_training_dataset,
                "model_state": model.state_dict(),
                "optimizer_state": optimizer.state_dict(),
                "batch_generator_state": batch_generator.get_state(),
                "torch_rng_state": torch.get_rng_state(),
                "cuda_rng_states": torch.cuda.get_rng_state_all() if selected_device.type == "cuda" else None,
                "train_loss": train_loss,
                "validation_loss": validation_loss,
            }, checkpoint)

    return {
        "step": final_step,
        "train_loss": train_loss,
        "validation_loss": validation_loss,
        "checkpoint": str(checkpoint),
        "device": str(selected_device),
        "loss_objective_version": LOSS_OBJECTIVE_VERSION,
        "training_objective": "assistant_response_tokens_plus_eos",
        "parent_checkpoint_sha256": parent_checkpoint_sha256 or "",
        "parent_checkpoint_step": parent_checkpoint_step or 0,
        "training_dataset_sha256": normalized_training_dataset["dataset_sha256"] if normalized_training_dataset else "",
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Train the Frieren Neural language model.")
    parser.add_argument("--data", required=True, help="Directory of UTF-8 .txt/.md files with corpus_manifest.json provenance")
    parser.add_argument("--checkpoint", default="checkpoints/frieren-neural.pt")
    parser.add_argument("--steps", type=int, default=1_000)
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--block-size", type=int, default=128)
    parser.add_argument("--resume", action="store_true")
    parser.add_argument("--device", default=None, help="cpu, cuda, or omit for automatic selection")
    args = parser.parse_args()
    documents = load_licensed_corpus(args.data)
    training_dataset_metadata = load_corpus_manifest_metadata(args.data, required_split="train")
    config = TrainingConfig(max_steps=args.steps, batch_size=args.batch_size, block_size=args.block_size)
    metrics = train_model(
        documents, args.checkpoint, config, resume=args.resume, device=args.device,
        training_dataset_metadata=training_dataset_metadata,
    )
    print(json.dumps(metrics, ensure_ascii=False, indent=2))


def load_checkpoint(
    checkpoint_path: str | Path, *, device: str | torch.device | None = None
) -> tuple[GPTLanguageModel, BPETokenizer, dict[str, Any]]:
    """Load a versioned checkpoint using PyTorch's restricted weights-only loader."""
    selected_device = torch.device(device or ("cuda" if torch.cuda.is_available() else "cpu"))
    payload = torch.load(checkpoint_path, map_location=selected_device, weights_only=True)
    if not isinstance(payload, dict) or payload.get("format_version") != 2:
        raise ValueError("Unsupported or invalid Frieren Neural checkpoint.")
    required_fields = {"step", "corpus_sha256", "corpus_content_sha256", "train_loss", "validation_loss", "model_state"}
    if not required_fields.issubset(payload):
        raise ValueError("Checkpoint is missing required training metadata or model weights.")
    try:
        if not isinstance(payload.get("tokenizer"), dict) or not isinstance(payload.get("model_config"), dict):
            raise ValueError("Checkpoint model/tokenizer payloads must be dictionaries.")
        tokenizer = BPETokenizer.from_dict(payload["tokenizer"])
        model_config = GPTConfig(**payload["model_config"])
        model = GPTLanguageModel(model_config).to(selected_device)
        model.load_state_dict(payload["model_state"])
    except (KeyError, TypeError, ValueError) as error:
        raise ValueError("Checkpoint is missing valid model or tokenizer data.") from error
    model.eval()
    metadata: dict[str, Any] = {
        "format_version": int(payload["format_version"]),
        "step": int(payload["step"]),
        "parent_checkpoint_sha256": str(payload.get("parent_checkpoint_sha256") or ""),
        "parent_checkpoint_step": int(payload.get("parent_checkpoint_step") or 0),
        "corpus_sha256": str(payload["corpus_sha256"]),
        "corpus_content_sha256": str(payload["corpus_content_sha256"]),
        "train_loss": float(payload["train_loss"]),
        "validation_loss": float(payload["validation_loss"]),
        "dialogue_encoding_version": int(payload.get("dialogue_encoding_version", 1)),
        "loss_objective_version": int(payload.get("loss_objective_version", 0)),
        "training_objective": (
            "assistant_response_tokens_plus_eos"
            if payload.get("loss_objective_version") == LOSS_OBJECTIVE_VERSION
            else "legacy_full_stream"
        ),
        "model_config": dict(payload["model_config"]),
        "training_config": dict(payload.get("training_config", {})),
        "tokenizer_type": str(payload["tokenizer"].get("type", "unknown")),
        "tokenizer_vocab_size": int(tokenizer.vocab_size),
        "training_dataset": _normalize_training_dataset_metadata(payload.get("training_dataset")),
        "parent_training_dataset": _normalize_training_dataset_metadata(payload.get("parent_training_dataset")),
    }
    return model, tokenizer, metadata


def encode_generation_prompt(prompt: str, tokenizer: BPETokenizer) -> list[int]:
    """Encode chat history with EOS after completed assistant turns, leaving the final prefix open."""
    normalized = prompt.rstrip()
    if not normalized.startswith("Kullanıcı: ") or not normalized.endswith("Asistan:"):
        return tokenizer.encode(prompt)

    parts = [
        part for part in re.split(r"(?m)(?=^(?:Kullanıcı|Asistan):(?: |$))", normalized)
        if part
    ]
    if len(parts) < 2 or parts[-1].strip() != "Asistan:":
        return tokenizer.encode(prompt)

    token_ids = [tokenizer.bos_id]
    expected_role = "Kullanıcı"
    for part in parts[:-1]:
        if part.startswith("Kullanıcı: "):
            role = "Kullanıcı"
        elif part.startswith("Asistan: "):
            role = "Asistan"
        else:
            raise ValueError("Chat prompt contains a message without a recognized role label.")
        if role != expected_role:
            raise ValueError("Chat prompt messages must alternate between user and assistant roles.")
        if role == "Asistan":
            marker = "Asistan:"
            if not part.startswith(marker):
                raise ValueError("Assistant history is missing its exact role marker.")
            token_ids.extend(tokenizer.encode(marker))
            token_ids.extend(tokenizer.encode(part[len(marker):]))
            token_ids.append(tokenizer.eos_id)
            expected_role = "Kullanıcı"
        else:
            token_ids.extend(tokenizer.encode(part))
            expected_role = "Asistan"

    if expected_role != "Asistan":
        raise ValueError("Chat prompt must end with an open assistant prefix.")
    token_ids.extend(tokenizer.encode(parts[-1]))
    return token_ids


@torch.no_grad()
def generate_text(
    model: GPTLanguageModel,
    tokenizer: BPETokenizer,
    prompt: str,
    *,
    max_new_tokens: int = 80,
    temperature: float = 0.8,
    top_k: int = 40,
) -> str:
    """Return the prompt plus completion, stopping at EOS or a leaked chat-role boundary."""
    if not prompt:
        raise ValueError("prompt must not be empty.")
    device = next(model.parameters()).device
    prompt_ids = encode_generation_prompt(prompt, tokenizer)
    input_ids = torch.tensor([prompt_ids], dtype=torch.long, device=device)
    generated = model.generate(
        input_ids, max_new_tokens=max_new_tokens, temperature=temperature, top_k=top_k,
        eos_token_id=tokenizer.eos_id,
    )[0].tolist()
    completion_ids = generated[len(prompt_ids):]
    if tokenizer.eos_id in completion_ids:
        completion_ids = completion_ids[:completion_ids.index(tokenizer.eos_id)]
    completion = tokenizer.decode(completion_ids)
    role_boundary = re.search(r"(?:^|\n)(?:Kullanıcı|Asistan):(?: |$)", completion)
    if role_boundary:
        completion = completion[:role_boundary.start()]
    return prompt + completion


def evaluate_checkpoint(
    checkpoint_path: str | Path,
    documents: Sequence[str],
    *,
    batch_size: int = 16,
    batches: int = 20,
    seed: int = 1337,
    device: str | torch.device | None = None,
    dataset_metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Evaluate a checkpoint on a distinct, caller-supplied held-out corpus."""
    if not documents or any(not isinstance(item, str) or not item.strip() for item in documents):
        raise ValueError("Evaluation documents must contain non-empty strings.")
    fingerprint = _corpus_fingerprint(documents)
    content_fingerprint = _corpus_content_fingerprint(documents)
    model, tokenizer, metadata = load_checkpoint(checkpoint_path, device=device)
    if (fingerprint == metadata["corpus_sha256"]
            or content_fingerprint == metadata["corpus_content_sha256"]):
        raise ValueError("Evaluation corpus must be separate from the training corpus.")
    evaluation_text = "\n".join(item.strip() for item in documents)
    # Use the same chat-aware BOS/EOS encoding as training so held-out
    # perplexity measures the actual conversation stream format.
    token_ids = encode_dialogue_stream(evaluation_text, tokenizer)
    _, evaluation_loss_mask = encode_dialogue_stream_with_loss_mask(evaluation_text, tokenizer)
    tokens = torch.tensor(token_ids, dtype=torch.long)
    target_mask = torch.tensor(evaluation_loss_mask, dtype=torch.bool)
    loss = evaluate_loss(
        model, tokens, batch_size=batch_size, block_size=model.config.max_seq_len,
        batches=batches, seed=seed, target_mask=target_mask,
    )
    try:
        perplexity = math.exp(loss)
    except OverflowError:
        perplexity = math.inf
    return {
        "step": int(metadata["step"]),
        "loss": loss,
        "perplexity": perplexity,
        "loss_objective_version": LOSS_OBJECTIVE_VERSION,
        "checkpoint_training_loss_objective_version": int(metadata["loss_objective_version"]),
        "dataset_sha256": dataset_metadata.get("dataset_sha256") if isinstance(dataset_metadata, dict) else None,
        "sample_count": dataset_metadata.get("sample_count") if isinstance(dataset_metadata, dict) else None,
        "split": dataset_metadata.get("split") if isinstance(dataset_metadata, dict) else None,
        "source_split": dataset_metadata.get("source_split") if isinstance(dataset_metadata, dict) else None,
        "evaluation_version": dataset_metadata.get("evaluation_version") if isinstance(dataset_metadata, dict) else None,
        "dataset_id": dataset_metadata.get("dataset_id") if isinstance(dataset_metadata, dict) else None,
        "dataset_revision": dataset_metadata.get("dataset_revision") if isinstance(dataset_metadata, dict) else None,
        "row_ids_sha256": dataset_metadata.get("row_ids_sha256") if isinstance(dataset_metadata, dict) else None,
    }


def evaluation_main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate a Frieren Neural checkpoint on a held-out corpus.")
    parser.add_argument("--data", required=True, help="Separate licensed corpus directory with corpus_manifest.json")
    parser.add_argument("--checkpoint", default="checkpoints/frieren-neural.pt")
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--batches", type=int, default=20)
    parser.add_argument("--seed", type=int, default=1337)
    parser.add_argument("--device", default=None)
    args = parser.parse_args()
    documents = load_licensed_corpus(args.data)
    dataset_metadata = load_corpus_manifest_metadata(args.data)
    metrics = evaluate_checkpoint(
        args.checkpoint, documents, batch_size=args.batch_size, batches=args.batches,
        seed=args.seed, device=args.device, dataset_metadata=dataset_metadata
    )
    print(json.dumps(metrics, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()