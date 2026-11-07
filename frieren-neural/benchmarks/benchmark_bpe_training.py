"""Compare optimized byte-BPE training with the previous reference algorithm."""
from __future__ import annotations

import argparse
import json
import time

from frieren_neural.tokenizer import BPETokenizer


def reference_train(texts, *, vocab_size, min_frequency):
    sequences = [list(text.encode("utf-8")) for text in texts if text]
    merges = []
    for _ in range(vocab_size - BPETokenizer.BASE_VOCAB_SIZE):
        counts = {}
        for sequence in sequences:
            for pair in zip(sequence, sequence[1:]):
                counts[pair] = counts.get(pair, 0) + 1
        if not counts:
            break
        pair, frequency = min(counts.items(), key=lambda item: (-item[1], item[0]))
        if frequency < min_frequency:
            break
        new_id = BPETokenizer.BASE_VOCAB_SIZE + len(merges)
        updated_sequences = []
        for sequence in sequences:
            updated = []
            index = 0
            while index < len(sequence):
                if index + 1 < len(sequence) and (sequence[index], sequence[index + 1]) == pair:
                    updated.append(new_id)
                    index += 2
                else:
                    updated.append(sequence[index])
                    index += 1
            updated_sequences.append(updated)
        sequences = updated_sequences
        merges.append(pair)
    return tuple(merges)


def reference_encode(text, merges):
    ids = list(text.encode("utf-8"))
    for merge_index, pair in enumerate(merges):
        new_id = BPETokenizer.BASE_VOCAB_SIZE + merge_index
        merged = []
        index = 0
        while index < len(ids):
            if index + 1 < len(ids) and (ids[index], ids[index + 1]) == pair:
                merged.append(new_id)
                index += 2
            else:
                merged.append(ids[index])
                index += 1
        ids = merged
    return ids


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--vocab-size", type=int, default=340)
    args = parser.parse_args()
    corpus = [
        (
            "Kullanıcı: Frieren ve Fern büyü çalışıyor. "
            "Asistan: Düzenli tekrar ve doğru kaynaklarla ilerleyin. "
        ) * 120
    ]
    started = time.perf_counter()
    reference = reference_train(corpus, vocab_size=args.vocab_size, min_frequency=2)
    reference_seconds = time.perf_counter() - started

    started = time.perf_counter()
    optimized = BPETokenizer.train(corpus, vocab_size=args.vocab_size, min_frequency=2).merges
    optimized_seconds = time.perf_counter() - started

    assert optimized == reference, "Optimized BPE merge order differs from the reference."

    tokenizer = BPETokenizer(optimized)
    text = corpus[0]
    started = time.perf_counter()
    reference_tokens = reference_encode(text, optimized)
    reference_encode_seconds = time.perf_counter() - started
    started = time.perf_counter()
    optimized_tokens = tokenizer.encode(text)
    optimized_encode_seconds = time.perf_counter() - started
    assert optimized_tokens == reference_tokens, "Optimized BPE encoding differs from the reference."

    print(json.dumps({
        "corpus_utf8_bytes": len(corpus[0].encode("utf-8")),
        "vocab_size": args.vocab_size,
        "merges": len(optimized),
        "reference_seconds": reference_seconds,
        "optimized_seconds": optimized_seconds,
        "speedup": reference_seconds / optimized_seconds if optimized_seconds else None,
        "merge_order_identical": True,
        "reference_encode_seconds": reference_encode_seconds,
        "optimized_encode_seconds": optimized_encode_seconds,
        "encode_speedup": reference_encode_seconds / optimized_encode_seconds if optimized_encode_seconds else None,
        "encoded_tokens_identical": True,
    }, indent=2))


if __name__ == "__main__":
    main()
