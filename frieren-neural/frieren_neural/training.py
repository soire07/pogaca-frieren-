"""Small, resumable next-token training pipeline for Frieren Neural."""

from __future__ import annotations

import argparse
import json
import os
import random
import tempfile
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Sequence

import torch
from torch import Tensor

from .model import GPTConfig, GPTLanguageModel
from .tokenizer import CharacterTokenizer


SUPPORTED_SUFFIXES = {".txt", ".md"}


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
    data: Tensor, *, batch_size: int, block_size: int, device: torch.device, generator: torch.Generator
) -> tuple[Tensor, Tensor]:
    if len(data) <= block_size:
        raise ValueError(f"Each token split must contain more than block_size ({block_size}) tokens.")
    starts = torch.randint(len(data) - block_size, (batch_size,), generator=generator)
    inputs = torch.stack([data[int(start) : int(start) + block_size] for start in starts])
    targets = torch.stack([data[int(start) + 1 : int(start) + block_size + 1] for start in starts])
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
) -> float:
    """Return mean next-token loss over deterministic random windows."""
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
                device=next(model.parameters()).device, generator=generator
            )
            _, loss = model(inputs, targets=targets)
            losses.append(float(loss.item()))
    finally:
        model.train(was_training)
    return sum(losses) / len(losses)


@torch.no_grad()
def _evaluate_pair(
    model: GPTLanguageModel, train_data: Tensor, validation_data: Tensor, config: TrainingConfig,
    device: torch.device, seed: int,
) -> tuple[float, float]:
    was_training = model.training
    model.eval()
    generator = torch.Generator(device="cpu").manual_seed(seed)
    results = []
    try:
        for data in (train_data, validation_data):
            values = []
            for _ in range(config.eval_batches):
                x, y = _sample_batch(data, batch_size=config.batch_size, block_size=config.block_size,
                                     device=device, generator=generator)
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
    tokenizer = CharacterTokenizer.train(documents)
    encoded: list[int] = []
    for document in documents:
        encoded.extend(tokenizer.encode(document.strip()))
        encoded.append(tokenizer.eos_id)
    token_stream = torch.tensor(encoded, dtype=torch.long)
    train_data, validation_data = split_tokens(token_stream, settings.validation_fraction)
    if min(len(train_data), len(validation_data)) <= settings.block_size:
        raise ValueError("Both train and validation splits must be longer than block_size.")

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
        saved = torch.load(checkpoint, map_location=selected_device, weights_only=False)
        if saved.get("model_config") != asdict(model_config) or saved.get("tokenizer") != tokenizer.to_dict():
            raise ValueError("Checkpoint model/tokenizer does not match the current corpus or configuration.")
        model.load_state_dict(saved["model_state"])
        optimizer.load_state_dict(saved["optimizer_state"])
        start_step = int(saved["step"])
        train_loss = float(saved["train_loss"])
        validation_loss = float(saved["validation_loss"])

    batch_generator = torch.Generator(device="cpu").manual_seed(settings.seed + start_step)
    final_step = start_step
    for step in range(start_step + 1, settings.max_steps + 1):
        final_step = step
        model.train()
        x, y = _sample_batch(train_data, batch_size=settings.batch_size, block_size=settings.block_size,
                             device=selected_device, generator=batch_generator)
        _, loss = model(x, targets=y)
        optimizer.zero_grad(set_to_none=True)
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), settings.grad_clip)
        optimizer.step()

        if step % settings.eval_interval == 0 or step == settings.max_steps:
            train_loss, validation_loss = _evaluate_pair(
                model, train_data, validation_data, settings, selected_device, settings.seed + step
            )
            _atomic_save({
                "format_version": 1,
                "step": step,
                "model_config": asdict(model_config),
                "training_config": asdict(settings),
                "tokenizer": tokenizer.to_dict(),
                "model_state": model.state_dict(),
                "optimizer_state": optimizer.state_dict(),
                "train_loss": train_loss,
                "validation_loss": validation_loss,
            }, checkpoint)

    return {
        "step": final_step,
        "train_loss": train_loss,
        "validation_loss": validation_loss,
        "checkpoint": str(checkpoint),
        "device": str(selected_device),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Train the Frieren Neural language model.")
    parser.add_argument("--data", required=True, help="UTF-8 .txt/.md file or directory of documents")
    parser.add_argument("--checkpoint", default="checkpoints/frieren-neural.pt")
    parser.add_argument("--steps", type=int, default=1_000)
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--block-size", type=int, default=128)
    parser.add_argument("--resume", action="store_true")
    parser.add_argument("--device", default=None, help="cpu, cuda, or omit for automatic selection")
    args = parser.parse_args()
    documents = load_text_corpus(args.data)
    config = TrainingConfig(max_steps=args.steps, batch_size=args.batch_size, block_size=args.block_size)
    metrics = train_model(documents, args.checkpoint, config, resume=args.resume, device=args.device)
    print(json.dumps(metrics, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
