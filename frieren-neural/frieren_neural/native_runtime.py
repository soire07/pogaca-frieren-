"""Safe loading and CPU-friendly generation for native Frieren Neural v2 checkpoints."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import torch

from .scratch_model import FrierenNeuralConfig, FrierenNeuralModel
from .tokenizer import BPETokenizer
from .training import encode_generation_prompt

ARCHITECTURE_ID = "frieren-neural-transformer-v2"


def load_native_checkpoint(
    checkpoint_path: str | Path, *, device: str | torch.device | None = None
) -> tuple[FrierenNeuralModel, BPETokenizer, dict[str, Any]] | None:
    """Load v2 checkpoints; return None for the legacy checkpoint format."""
    selected_device = torch.device(device or "cpu")
    payload = torch.load(checkpoint_path, map_location=selected_device, weights_only=True)
    if not isinstance(payload, dict) or payload.get("architecture_id") != ARCHITECTURE_ID:
        return None
    required = {
        "format_version", "pretrained_weights", "model_config", "model_state",
        "tokenizer", "step", "training_corpus_sha256", "manifest_sha256",
    }
    if payload.get("format_version") != 2 or not required.issubset(payload):
        raise ValueError("Native v2 checkpoint is missing required format or provenance metadata.")
    if payload.get("pretrained_weights") is not False:
        raise ValueError("Native v2 checkpoint must contain independently trained Frieren Neural weights.")
    if not isinstance(payload["model_config"], dict) or not isinstance(payload["tokenizer"], dict):
        raise ValueError("Native v2 model configuration and tokenizer must be objects.")
    if not isinstance(payload["model_state"], dict):
        raise ValueError("Native v2 checkpoint model_state must be an object.")
    step = payload["step"]
    if isinstance(step, bool) or not isinstance(step, int) or step < 0:
        raise ValueError("Native v2 checkpoint step must be a non-negative integer.")

    for field in ("training_corpus_sha256", "manifest_sha256"):
        digest = payload[field]
        if (not isinstance(digest, str) or len(digest) != 64
                or any(character not in "0123456789abcdef" for character in digest)):
            raise ValueError(f"Native v2 checkpoint has invalid {field} provenance.")
    licenses = payload.get("licenses")
    if not isinstance(licenses, list) or not licenses or any(not isinstance(item, str) or not item.strip() for item in licenses):
        raise ValueError("Native v2 checkpoint must retain its training licenses.")

    tokenizer = BPETokenizer.from_dict(payload["tokenizer"])
    config = FrierenNeuralConfig(**payload["model_config"])
    if config.vocab_size != tokenizer.vocab_size:
        raise ValueError("Native v2 checkpoint vocabulary does not match its tokenizer.")
    model = FrierenNeuralModel(config).to(selected_device)
    model.load_state_dict(payload["model_state"], strict=True)
    model.eval()
    metadata = {
        "format_version": 2,
        "architecture_id": ARCHITECTURE_ID,
        "pretrained_weights": False,
        "step": step,
        "model_config": config.to_dict(),
        "training_config": dict(payload.get("training_config", {})),
        "training_corpus_sha256": str(payload["training_corpus_sha256"]),
        "manifest_sha256": str(payload["manifest_sha256"]),
        "licenses": list(payload.get("licenses", [])),
    }
    return model, tokenizer, metadata


@torch.no_grad()
def generate_native_text(
    model: FrierenNeuralModel,
    tokenizer: BPETokenizer,
    prompt: str,
    *,
    max_new_tokens: int = 80,
    temperature: float = 0.8,
    top_k: int = 40,
) -> str:
    """Generate a completion from native v2 weights using the training tokenizer."""
    if not isinstance(prompt, str) or not prompt.strip():
        raise ValueError("prompt must not be empty.")
    if max_new_tokens < 1 or temperature <= 0 or top_k < 1:
        raise ValueError("Invalid generation settings.")

    device = next(model.parameters()).device
    token_ids = encode_generation_prompt(prompt, tokenizer)
    if not token_ids:
        raise ValueError("Prompt did not produce any model tokens.")
    generated = list(token_ids)
    model.eval()

    for _ in range(max_new_tokens):
        context = torch.tensor(
            [generated[-model.config.max_seq_len:]], dtype=torch.long, device=device
        )
        logits = model(context)[0, -1].float() / temperature
        logits[tokenizer.pad_id] = float("-inf")
        logits[tokenizer.bos_id] = float("-inf")
        logits[tokenizer.unk_id] = float("-inf")
        if len(generated) == len(token_ids):
            logits[tokenizer.eos_id] = float("-inf")
        count = min(top_k, logits.numel())
        threshold = torch.topk(logits, count).values[-1]
        logits = logits.masked_fill(logits < threshold, float("-inf"))
        next_id = int(torch.multinomial(torch.softmax(logits, dim=-1), num_samples=1).item())
        if next_id == tokenizer.eos_id:
            break
        generated.append(next_id)

    completion_ids = generated[len(token_ids):]
    completion = tokenizer.decode(completion_ids)
    if completion.startswith(("Kullanıcı:", "Asistan:")):
        completion = ""
    else:
        boundaries = [
            position for marker in ("\\nKullanıcı:", "\\nAsistan:")
            if (position := completion.find(marker)) >= 0
        ]
        if boundaries:
            completion = completion[:min(boundaries)]
    return completion
