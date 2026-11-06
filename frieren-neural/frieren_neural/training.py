"""Small, resumable next-token training pipeline for Frieren Neural."""

from __future__ import annotations

import argparse
import hashlib
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
        raw_content = file_path.read_text(encoding="utf-8")
        content = raw_content.strip()
        if not content:
            raise ValueError(f"Corpus file is empty: {canonical_path}")
        expected_sha256 = entry.get("sha256")
        if expected_sha256 is not None:
            if (not isinstance(expected_sha256, str) or len(expected_sha256) != 64
                    or any(character not in "0123456789abcdef" for character in expected_sha256)):
                raise ValueError(f"Corpus SHA-256 must be 64 lowercase hexadecimal characters: {canonical_path}")
            actual_sha256 = hashlib.sha256(raw_content.encode("utf-8")).hexdigest()
            if actual_sha256 != expected_sha256:
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
    """Chronologically split raw text before tokenizer training to prevent validation leakage."""
    if not documents or any(not isinstance(item, str) or not item.strip() for item in documents):
        raise ValueError("documents must contain non-empty strings.")
    if not 0.0 < validation_fraction < 0.5:
        raise ValueError("validation_fraction must be between 0 and 0.5.")
    combined = "\n".join(item.strip() for item in documents)
    # Preserve natural document boundaries whenever the corpus provides them.
    # The Turkish dialogue importer separates each conversation with this marker.
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
        if len(units) < 2:
            raise ValueError("Corpus must contain at least two complete documents for a boundary-safe split.")
        target_validation_size = max(1, int(sum(map(len, units)) * validation_fraction))
        validation_units: list[str] = []
        validation_characters = 0
        while len(units) - len(validation_units) > 1 and validation_characters < target_validation_size:
            item = units.pop()
            validation_units.insert(0, item)
            validation_characters += len(item)
        if not units or not validation_units:
            raise ValueError("Corpus must contain non-empty training and validation documents.")
        return joiner.join(units), joiner.join(validation_units)

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


def _sample_batch(
    data: Tensor, *, batch_size: int, block_size: int, device: torch.device,
    generator: torch.Generator, target_mask: Tensor | None = None,
) -> tuple[Tensor, Tensor]:
    if len(data) <= block_size:
        raise ValueError(f"Each token split must contain more than block_size ({block_size}) tokens.")
    if target_mask is not None:
        if target_mask.shape != data.shape or target_mask.dtype != torch.bool:
            raise ValueError("target_mask must be a boolean tensor matching the token stream.")
        # A window must contain at least one supervised next-token target. The
        # mask is shifted with targets, not inputs, to preserve causal alignment.
        windows = target_mask.unfold(0, block_size + 1, 1)[:, 1:]
        valid_starts = torch.nonzero(windows.any(dim=1), as_tuple=False).flatten()
        if valid_starts.numel() == 0:
            raise ValueError("Token split contains no assistant targets in any training window.")
        choices = torch.randint(valid_starts.numel(), (batch_size,), generator=generator)
        starts = valid_starts[choices]
    else:
        starts = torch.randint(len(data) - block_size, (batch_size,), generator=generator)
    inputs = torch.stack([data[int(start) : int(start) + block_size] for start in starts])
    targets = torch.stack([data[int(start) + 1 : int(start) + block_size + 1] for start in starts])
    if target_mask is not None:
        masks = torch.stack([
            target_mask[int(start) + 1 : int(start) + block_size + 1] for start in starts
        ])
        targets = targets.masked_fill(~masks, -100)
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
    try:
        for _ in range(batches):
            inputs, targets = _sample_batch(
                data, batch_size=batch_size, block_size=block_size,
                device=next(model.parameters()).device, generator=generator,
                target_mask=target_mask,
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
    try:
        for data, target_mask in ((train_data, train_mask), (validation_data, validation_mask)):
            values = []
            for _ in range(config.eval_batches):
                x, y = _sample_batch(data, batch_size=config.batch_size, block_size=config.block_size,
                                     device=device, generator=generator, target_mask=target_mask)
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
    device: str | torch.device | None = None,
) -> dict[str, float | int | str]:
    """Train a small GPT model and atomically save a resumable checkpoint."""
    settings = config or TrainingConfig()
    if not documents or any(not isinstance(item, str) or not item.strip() for item in documents):
        raise ValueError("documents must contain non-empty strings.")
    random.seed(settings.seed)
    torch.manual_seed(settings.seed)
    selected_device = torch.device(device or ("cuda" if torch.cuda.is_available() else "cpu"))
    corpus_fingerprint = _corpus_fingerprint(documents)
    corpus_content_fingerprint = _corpus_content_fingerprint(documents)
    train_text, validation_text = split_corpus_text(documents, settings.validation_fraction)
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
        if min(len(train_ids), len(validation_ids)) + 1 > settings.block_size:
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

    model_config = GPTConfig(
        vocab_size=tokenizer.vocab_size, d_model=settings.d_model, n_heads=settings.n_heads,
        n_layers=settings.n_layers, max_seq_len=settings.block_size, dropout=settings.dropout
    )
    model = GPTLanguageModel(model_config).to(selected_device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=settings.learning_rate, weight_decay=settings.weight_decay)
    checkpoint = Path(checkpoint_path)
    start_step = 0

    if resume:
        if not checkpoint.is_file():
            raise FileNotFoundError(f"Cannot resume; checkpoint not found: {checkpoint}")
        saved = torch.load(checkpoint, map_location=selected_device, weights_only=True)
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
        if (saved.get("model_config") != asdict(model_config)
                or saved.get("tokenizer") != tokenizer.to_dict()
                or saved.get("corpus_sha256") != corpus_fingerprint
                or saved_training_config != current_training_config):
            raise ValueError("Checkpoint corpus/model/training settings do not match this run (max_steps may increase).")
        model.load_state_dict(saved["model_state"])
        optimizer.load_state_dict(saved["optimizer_state"])
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
                "model_config": asdict(model_config),
                "training_config": asdict(settings),
                "tokenizer": tokenizer.to_dict(),
                "corpus_sha256": corpus_fingerprint,
                "corpus_content_sha256": corpus_content_fingerprint,
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
    config = TrainingConfig(max_steps=args.steps, batch_size=args.batch_size, block_size=args.block_size)
    metrics = train_model(documents, args.checkpoint, config, resume=args.resume, device=args.device)
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
) -> dict[str, float | int]:
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
    metrics = evaluate_checkpoint(
        args.checkpoint, documents, batch_size=args.batch_size, batches=args.batches,
        seed=args.seed, device=args.device
    )
    print(json.dumps(metrics, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()