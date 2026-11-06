"""A deterministic Unicode character tokenizer for the first model baseline.

This intentionally simple tokenizer is suitable for smoke tests and tiny
experiments. A subword tokenizer should replace it before serious training.
"""

from __future__ import annotations

from dataclasses import dataclass
import heapq
from typing import Callable, Iterable

PAD_TOKEN = "<pad>"
BOS_TOKEN = "<bos>"
EOS_TOKEN = "<eos>"
UNK_TOKEN = "<unk>"

SPECIAL_TOKENS = (PAD_TOKEN, BOS_TOKEN, EOS_TOKEN, UNK_TOKEN)

# Keep pure-Python BPE fitting bounded on large corpora. Evenly spaced contiguous
# windows retain examples from the beginning, middle, and end of the corpus.
MAX_TRAINING_BYTES = 65_536
TRAINING_SAMPLE_WINDOW_BYTES = 256


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
        progress_callback: Callable[[int, int, int], None] | None = None,
    ) -> "BPETokenizer":
        if vocab_size < cls.BASE_VOCAB_SIZE:
            raise ValueError(f"vocab_size must be at least {cls.BASE_VOCAB_SIZE}.")
        if min_frequency < 1:
            raise ValueError("min_frequency must be positive.")
        encoded = [text.encode("utf-8") for text in texts if text]
        if not encoded:
            raise ValueError("BPE training requires at least one non-empty text.")

        corpus = b"\n".join(encoded)
        total_bytes = len(corpus)
        if total_bytes > MAX_TRAINING_BYTES:
            window_count = max(1, MAX_TRAINING_BYTES // TRAINING_SAMPLE_WINDOW_BYTES)
            window_size = min(TRAINING_SAMPLE_WINDOW_BYTES, total_bytes)
            last_offset = total_bytes - window_size
            offsets = (
                [0] if window_count == 1 else
                [round(index * last_offset / (window_count - 1)) for index in range(window_count)]
            )
            sequences = [
                list(corpus[offset:offset + window_size])
                for offset in offsets
            ]
        else:
            sequences = [list(item) for item in encoded]

        sampled_bytes = sum(len(sequence) for sequence in sequences)
        target_merges = vocab_size - cls.BASE_VOCAB_SIZE
        if progress_callback is not None:
            progress_callback(0, target_merges, sampled_bytes)

        merges: list[tuple[int, int]] = []
        for _ in range(target_merges):
            counts: dict[tuple[int, int], int] = {}
            for sequence in sequences:
                for pair in zip(sequence, sequence[1:]):
                    counts[pair] = counts.get(pair, 0) + 1
            if not counts:
                break
            best_pair, frequency = min(counts.items(), key=lambda item: (-item[1], item[0]))
            if frequency < min_frequency:
                break
            new_id = cls.BASE_VOCAB_SIZE + len(merges)
            updated_sequences: list[list[int]] = []
            for sequence in sequences:
                updated: list[int] = []
                index = 0
                while index < len(sequence):
                    if index + 1 < len(sequence) and (sequence[index], sequence[index + 1]) == best_pair:
                        updated.append(new_id)
                        index += 2
                    else:
                        updated.append(sequence[index])
                        index += 1
                updated_sequences.append(updated)
            sequences = updated_sequences
            merges.append(best_pair)
            completed = len(merges)
            if progress_callback is not None and (
                completed % 25 == 0 or completed == target_merges
            ):
                progress_callback(completed, target_merges, sampled_bytes)

        if progress_callback is not None and len(merges) < target_merges:
            progress_callback(len(merges), target_merges, sampled_bytes)
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
        raw_ids = list(text.encode("utf-8"))
        if not raw_ids:
            ids: list[int] = []
        elif not self.merges:
            ids = raw_ids
        else:
            # Apply BPE merge ranks with a min-heap and linked token positions.
            # This is equivalent to sequential left-to-right BPE, but avoids
            # rescanning the entire input once for every learned merge.
            ranks = {pair: rank for rank, pair in enumerate(self.merges)}
            previous = [index - 1 for index in range(len(raw_ids))]
            following = [index + 1 for index in range(len(raw_ids))]
            following[-1] = -1
            values = raw_ids[:]
            alive = [True] * len(raw_ids)
            candidates: list[tuple[int, int, int]] = []

            def push_pair(left: int) -> None:
                if left < 0 or not alive[left]:
                    return
                right = following[left]
                if right < 0 or not alive[right]:
                    return
                rank = ranks.get((values[left], values[right]))
                if rank is not None:
                    heapq.heappush(candidates, (rank, left, right))

            for index in range(len(raw_ids) - 1):
                push_pair(index)

            while candidates:
                rank, left, right = heapq.heappop(candidates)
                if (
                    not alive[left]
                    or not alive[right]
                    or following[left] != right
                    or ranks.get((values[left], values[right])) != rank
                ):
                    continue

                values[left] = self.BASE_VOCAB_SIZE + rank
                alive[right] = False
                after = following[right]
                following[left] = after
                if after >= 0:
                    previous[after] = left

                push_pair(previous[left])
                push_pair(left)

            ids = []
            cursor = next((index for index, is_alive in enumerate(alive) if is_alive and previous[index] < 0), -1)
            while cursor >= 0:
                ids.append(values[cursor])
                cursor = following[cursor]

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
