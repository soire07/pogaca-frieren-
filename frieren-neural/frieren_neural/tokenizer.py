"""A deterministic Unicode character tokenizer for the first model baseline.

This intentionally simple tokenizer is suitable for smoke tests and tiny
experiments. A subword tokenizer should replace it before serious training.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

PAD_TOKEN = "<pad>"
BOS_TOKEN = "<bos>"
EOS_TOKEN = "<eos>"
UNK_TOKEN = "<unk>"

SPECIAL_TOKENS = (PAD_TOKEN, BOS_TOKEN, EOS_TOKEN, UNK_TOKEN)


@dataclass(frozen=True)
class CharacterTokenizer:
    """Maps Unicode code points to stable integer IDs."""

    tokens: tuple[str, ...]

    def __post_init__(self) -> None:
        if self.tokens[: len(SPECIAL_TOKENS)] != SPECIAL_TOKENS:
            raise ValueError("Tokenizer must begin with the four reserved tokens.")
        if len(set(self.tokens)) != len(self.tokens):
            raise ValueError("Tokenizer vocabulary contains duplicate tokens.")

    @classmethod
    def train(cls, texts: Iterable[str]) -> "CharacterTokenizer":
        characters = sorted({character for text in texts for character in text})
        return cls(tokens=(*SPECIAL_TOKENS, *characters))

    @property
    def vocab_size(self) -> int:
        return len(self.tokens)

    @property
    def pad_id(self) -> int:
        return 0

    @property
    def bos_id(self) -> int:
        return 1

    @property
    def eos_id(self) -> int:
        return 2

    @property
    def unk_id(self) -> int:
        return 3

    def encode(self, text: str, *, add_bos: bool = False, add_eos: bool = False) -> list[int]:
        token_to_id = {token: index for index, token in enumerate(self.tokens)}
        ids = [token_to_id.get(character, self.unk_id) for character in text]
        if add_bos:
            ids.insert(0, self.bos_id)
        if add_eos:
            ids.append(self.eos_id)
        return ids

    def decode(self, ids: Iterable[int], *, skip_special_tokens: bool = True) -> str:
        output: list[str] = []
        for token_id in ids:
            if not isinstance(token_id, int) or token_id < 0 or token_id >= self.vocab_size:
                token = UNK_TOKEN
            else:
                token = self.tokens[token_id]
            if skip_special_tokens and token in SPECIAL_TOKENS:
                continue
            output.append(token)
        return "".join(output)

    def to_dict(self) -> dict[str, list[str] | int]:
        return {"version": 1, "tokens": list(self.tokens)}

    @classmethod
    def from_dict(cls, payload: dict[str, object]) -> "CharacterTokenizer":
        tokens = payload.get("tokens")
        if not isinstance(tokens, list) or not all(isinstance(token, str) for token in tokens):
            raise ValueError("Invalid tokenizer payload: 'tokens' must be a list of strings.")
        return cls(tokens=tuple(tokens))
