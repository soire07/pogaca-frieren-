"""A compact GPT-style decoder-only Transformer implemented with PyTorch."""

from __future__ import annotations

from dataclasses import dataclass

import torch
from torch import Tensor, nn
from torch.nn import functional as F


@dataclass(frozen=True)
class GPTConfig:
    vocab_size: int
    d_model: int = 128
    n_heads: int = 4
    n_layers: int = 4
    max_seq_len: int = 256
    dropout: float = 0.1

    def __post_init__(self) -> None:
        if self.vocab_size < 4:
            raise ValueError("vocab_size must include at least the four reserved tokens.")
        if self.d_model <= 0 or self.n_heads <= 0 or self.n_layers <= 0 or self.max_seq_len <= 0:
            raise ValueError("Model dimensions and layer counts must be positive.")
        if self.d_model % self.n_heads:
            raise ValueError("d_model must be divisible by n_heads.")
        if not 0.0 <= self.dropout < 1.0:
            raise ValueError("dropout must be in the interval [0, 1).")


class CausalSelfAttention(nn.Module):
    def __init__(self, config: GPTConfig) -> None:
        super().__init__()
        self.attention = nn.MultiheadAttention(
            embed_dim=config.d_model,
            num_heads=config.n_heads,
            dropout=config.dropout,
            batch_first=True,
        )
        self.register_buffer(
            "causal_mask",
            torch.triu(torch.ones(config.max_seq_len, config.max_seq_len, dtype=torch.bool), diagonal=1),
            persistent=False,
        )

    def forward(self, hidden: Tensor) -> Tensor:
        sequence_length = hidden.size(1)
        mask = self.causal_mask[:sequence_length, :sequence_length]
        attended, _ = self.attention(
            hidden,
            hidden,
            hidden,
            attn_mask=mask,
            need_weights=False,
        )
        return attended


class TransformerBlock(nn.Module):
    def __init__(self, config: GPTConfig) -> None:
        super().__init__()
        self.norm_attention = nn.LayerNorm(config.d_model)
        self.attention = CausalSelfAttention(config)
        self.norm_mlp = nn.LayerNorm(config.d_model)
        self.mlp = nn.Sequential(
            nn.Linear(config.d_model, 4 * config.d_model),
            nn.GELU(),
            nn.Linear(4 * config.d_model, config.d_model),
            nn.Dropout(config.dropout),
        )
        self.residual_dropout = nn.Dropout(config.dropout)

    def forward(self, hidden: Tensor) -> Tensor:
        hidden = hidden + self.residual_dropout(self.attention(self.norm_attention(hidden)))
        hidden = hidden + self.mlp(self.norm_mlp(hidden))
        return hidden


class GPTLanguageModel(nn.Module):
    """Predicts the next token at each input position."""

    def __init__(self, config: GPTConfig) -> None:
        super().__init__()
        self.config = config
        self.token_embedding = nn.Embedding(config.vocab_size, config.d_model)
        self.position_embedding = nn.Embedding(config.max_seq_len, config.d_model)
        self.input_dropout = nn.Dropout(config.dropout)
        self.blocks = nn.ModuleList([TransformerBlock(config) for _ in range(config.n_layers)])
        self.final_norm = nn.LayerNorm(config.d_model)
        self.output_projection = nn.Linear(config.d_model, config.vocab_size, bias=False)
        self.output_projection.weight = self.token_embedding.weight
        self.apply(self._initialize_weights)

    @staticmethod
    def _initialize_weights(module: nn.Module) -> None:
        if isinstance(module, nn.Linear):
            nn.init.normal_(module.weight, mean=0.0, std=0.02)
            if module.bias is not None:
                nn.init.zeros_(module.bias)
        elif isinstance(module, nn.Embedding):
            nn.init.normal_(module.weight, mean=0.0, std=0.02)

    def forward(self, input_ids: Tensor, targets: Tensor | None = None) -> Tensor | tuple[Tensor, Tensor]:
        if input_ids.ndim != 2:
            raise ValueError("input_ids must have shape [batch, sequence].")
        batch_size, sequence_length = input_ids.shape
        if sequence_length == 0 or sequence_length > self.config.max_seq_len:
            raise ValueError("Input sequence length is outside the configured model context.")
        if input_ids.dtype != torch.long:
            raise ValueError("input_ids must use torch.long token IDs.")

        positions = torch.arange(sequence_length, device=input_ids.device)
        hidden = self.token_embedding(input_ids) + self.position_embedding(positions)[None, :, :]
        hidden = self.input_dropout(hidden)
        for block in self.blocks:
            hidden = block(hidden)
        logits = self.output_projection(self.final_norm(hidden))

        if targets is None:
            return logits
        if targets.shape != input_ids.shape or targets.dtype != torch.long:
            raise ValueError("targets must be torch.long and match input_ids shape.")
        loss = F.cross_entropy(logits.reshape(-1, logits.size(-1)), targets.reshape(-1))
        return logits, loss

    @torch.no_grad()
    def generate(
        self,
        input_ids: Tensor,
        *,
        max_new_tokens: int = 40,
        temperature: float = 1.0,
        top_k: int | None = None,
    ) -> Tensor:
        if max_new_tokens < 0:
            raise ValueError("max_new_tokens cannot be negative.")
        if temperature <= 0:
            raise ValueError("temperature must be greater than zero.")
        if top_k is not None and top_k <= 0:
            raise ValueError("top_k must be greater than zero.")
        if input_ids.ndim != 2 or input_ids.size(1) == 0:
            raise ValueError("input_ids must be a non-empty [batch, sequence] tensor.")

        was_training = self.training
        self.eval()
        generated = input_ids
        try:
            for _ in range(max_new_tokens):
                context = generated[:, -self.config.max_seq_len :]
                logits = self(context)[:, -1, :] / temperature
                if top_k is not None:
                    k = min(top_k, logits.size(-1))
                    threshold = torch.topk(logits, k, dim=-1).values[:, -1, None]
                    logits = logits.masked_fill(logits < threshold, float("-inf"))
                probabilities = F.softmax(logits, dim=-1)
                next_token = torch.multinomial(probabilities, num_samples=1)
                generated = torch.cat((generated, next_token), dim=1)
        finally:
            self.train(was_training)
        return generated
