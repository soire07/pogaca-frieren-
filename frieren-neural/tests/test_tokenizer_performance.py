import random

from frieren_neural.tokenizer import BPETokenizer


def _reference_encode(text: str, merges: tuple[tuple[int, int], ...]) -> list[int]:
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


def test_heap_encoder_matches_sequential_bpe_for_overlapping_pairs():
    merges = ((97, 97), (260, 97), (97, 260), (260, 260), (98, 97))
    tokenizer = BPETokenizer(merges=merges)

    for text in ("aaaaa", "aaaaaaaa", "ababa", "baaaaab", "Türkçe: ıİşğüöç"):
        assert tokenizer.encode(text) == _reference_encode(text, merges)


def test_heap_encoder_matches_sequential_bpe_for_deterministic_random_inputs():
    rng = random.Random(20261106)
    base_merges = ((97, 98), (98, 97), (260, 97), (97, 261), (261, 260), (99, 97))
    tokenizer = BPETokenizer(merges=base_merges)

    for _ in range(100):
        text = "".join(rng.choice("aabbcc") for _ in range(rng.randint(0, 80)))
        assert tokenizer.encode(text) == _reference_encode(text, base_merges)


def test_bpe_training_caps_work_on_a_deterministic_corpus_sample():
    from frieren_neural.tokenizer import MAX_TRAINING_BYTES

    text = ("Kullanıcı: Frieren büyü öğreniyor. Asistan: Evet, çalışmaya devam ediyor.\n" * 2000)
    progress = []
    tokenizer = BPETokenizer.train(
        [text], vocab_size=280, min_frequency=2,
        progress_callback=lambda completed, total, sampled_bytes: progress.append(
            (completed, total, sampled_bytes)
        ),
    )

    assert tokenizer.vocab_size > BPETokenizer.BASE_VOCAB_SIZE
    assert progress
    assert progress[-1][2] <= MAX_TRAINING_BYTES
    assert progress[-1][1] == 20
    assert progress[-1][0] == len(tokenizer.merges)
