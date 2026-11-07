"""A deterministic Unicode character tokenizer for the first model baseline.

This intentionally simple tokenizer is suitable for smoke tests and tiny
experiments. A subword tokenizer should replace it before serious training.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

import numpy as np

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


@dataclass(frozen=True)
class BPETokenizer:
    """Deterministic byte-level BPE tokenizer with lossless UTF-8 round-trips.

    Base byte IDs are 0..255; special tokens follow, then learned merge IDs.
    This compact implementation favors reproducibility over training speed.
    """

    merges: tuple[tuple[int, int], ...]

    PAD_ID = 256
    BOS_ID = 257
    EOS_ID = 258
    UNK_ID = 259
    BASE_VOCAB_SIZE = 260
    _SPECIAL_TEXT = {
        PAD_ID: PAD_TOKEN,
        BOS_ID: BOS_TOKEN,
        EOS_ID: EOS_TOKEN,
        UNK_ID: UNK_TOKEN,
    }

    def __post_init__(self) -> None:
        for index, pair in enumerate(self.merges):
            expected_id = self.BASE_VOCAB_SIZE + index
            if (not isinstance(pair, tuple) or len(pair) != 2
                    or any(not isinstance(token, int) or token < 0 or token >= expected_id
                           or self.PAD_ID <= token < self.BASE_VOCAB_SIZE for token in pair)):
                raise ValueError("Invalid BPE merge: each pair must reference earlier token IDs.")

    @classmethod
    def train(
        cls,
        texts: Iterable[str],
        *,
        vocab_size: int = 1_024,
        min_frequency: int = 2,
    ) -> "BPETokenizer":
        if vocab_size < cls.BASE_VOCAB_SIZE:
            raise ValueError(f"vocab_size must be at least {cls.BASE_VOCAB_SIZE}.")
        if min_frequency < 1:
            raise ValueError("min_frequency must be positive.")
        sequences = [
            np.frombuffer(text.encode("utf-8"), dtype=np.uint8).astype(np.int32)
            for text in texts if text
        ]
        if not sequences:
            raise ValueError("BPE training requires at least one non-empty text.")

        # Keep document boundaries with a sentinel that can never be merged.
        # The dense pair histogram and vectorized merge preserve the original
        # frequency/tie-breaking and left-to-right non-overlap semantics.
        separator = np.array([-1], dtype=np.int32)
        pieces: list[np.ndarray] = []
        for index, sequence in enumerate(sequences):
            if index:
                pieces.append(separator)
            pieces.append(sequence)
        combined = np.concatenate(pieces)
        merges: list[tuple[int, int]] = []

        for _ in range(vocab_size - cls.BASE_VOCAB_SIZE):
            left = combined[:-1]
            right = combined[1:]
            valid = (left >= 0) & (right >= 0)
            if not np.any(valid):
                break
            pair_keys = left[valid].astype(np.int64) * vocab_size + right[valid]
            if vocab_size <= 2048:
                counts = np.bincount(pair_keys, minlength=vocab_size * vocab_size)
                best_key = int(np.argmax(counts))
                frequency = int(counts[best_key])
            else:
                unique_keys, unique_counts = np.unique(pair_keys, return_counts=True)
                best_index = int(np.argmax(unique_counts))
                best_key = int(unique_keys[best_index])
                frequency = int(unique_counts[best_index])
            if frequency < min_frequency:
                break

            best_pair = (best_key // vocab_size, best_key % vocab_size)
            new_id = cls.BASE_VOCAB_SIZE + len(merges)
            matches = (left == best_pair[0]) & (right == best_pair[1])

            # Only equal-token pairs can overlap. Select every other position
            # inside each consecutive match run, matching the old greedy scan.
            if best_pair[0] == best_pair[1]:
                positions = np.arange(matches.size)
                run_starts = matches & ~np.concatenate((np.array([False]), matches[:-1]))
                last_run_start = np.maximum.accumulate(np.where(run_starts, positions, -1))
                selected = matches & ((positions - last_run_start) % 2 == 0)
            else:
                selected = matches

            merge_positions = np.flatnonzero(selected)
            if merge_positions.size == 0:
                raise RuntimeError("BPE pair histogram selected a pair with no merge positions.")
            combined[merge_positions] = new_id
            keep = np.ones(combined.size, dtype=bool)
            keep[merge_positions + 1] = False
            combined = combined[keep]
            merges.append(best_pair)

        return cls(merges=tuple(merges))

    @property
    def vocab_size(self) -> int:
        return self.BASE_VOCAB_SIZE + len(self.merges)

    @property
    def pad_id(self) -> int:
        return self.PAD_ID

    @property
    def bos_id(self) -> int:
        return self.BOS_ID

    @property
    def eos_id(self) -> int:
        return self.EOS_ID

    @property
    def unk_id(self) -> int:
        return self.UNK_ID

    def encode(self, text: str, *, add_bos: bool = False, add_eos: bool = False) -> list[int]:
        ids = list(text.encode("utf-8"))
        for merge_index, pair in enumerate(self.merges):
            new_id = self.BASE_VOCAB_SIZE + merge_index
            merged: list[int] = []
            index = 0
            while index < len(ids):
                if index + 1 < len(ids) and (ids[index], ids[index + 1]) == pair:
                    merged.append(new_id)
                    index += 2
                else:
                    merged.append(ids[index])
                    index += 1
            ids = merged
        if add_bos:
            ids.insert(0, self.bos_id)
        if add_eos:
            ids.append(self.eos_id)
        return ids

    def _expand(self, token_id: int, cache: dict[int, bytes]) -> bytes:
        if token_id in cache:
            return cache[token_id]
        if 0 <= token_id < 256:
            result = bytes([token_id])
        elif self.BASE_VOCAB_SIZE <= token_id < self.vocab_size:
            left, right = self.merges[token_id - self.BASE_VOCAB_SIZE]
            result = self._expand(left, cache) + self._expand(right, cache)
        else:
            raise ValueError("Token ID is not a byte or learned BPE token.")
        cache[token_id] = result
        return result

    def decode(self, ids: Iterable[int], *, skip_special_tokens: bool = True) -> str:
        output: list[str] = []
        byte_buffer = bytearray()
        cache: dict[int, bytes] = {}

        def flush() -> None:
            if byte_buffer:
                output.append(bytes(byte_buffer).decode("utf-8", errors="replace"))
                byte_buffer.clear()

        for token_id in ids:
            if not isinstance(token_id, int):
                token_id = self.unk_id
            if token_id in self._SPECIAL_TEXT:
                flush()
                if not skip_special_tokens:
                    output.append(self._SPECIAL_TEXT[token_id])
            elif 0 <= token_id < self.vocab_size:
                byte_buffer.extend(self._expand(token_id, cache))
            else:
                flush()
                if not skip_special_tokens:
                    output.append(UNK_TOKEN)
        flush()
        return "".join(output)

    def to_dict(self) -> dict[str, object]:
        return {"version": 1, "type": "byte_bpe", "merges": [list(pair) for pair in self.merges]}

    @classmethod
    def from_dict(cls, payload: dict[str, object]) -> "BPETokenizer":
        raw_merges = payload.get("merges")
        if payload.get("version") != 1 or payload.get("type") != "byte_bpe" or not isinstance(raw_merges, list):
            raise ValueError("Invalid BPE tokenizer payload: expected version, type, and merges.")
        merges: list[tuple[int, int]] = []
        for pair in raw_merges:
            if (not isinstance(pair, list) or len(pair) != 2
                    or any(not isinstance(value, int) for value in pair)):
                raise ValueError("Invalid BPE tokenizer payload: 'merges' must contain integer pairs.")
            merges.append((pair[0], pair[1]))
        return cls(merges=tuple(merges))
