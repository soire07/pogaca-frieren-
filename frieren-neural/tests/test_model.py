import pytest
import torch

from frieren_neural import CharacterTokenizer, GPTConfig, GPTLanguageModel


def tiny_model(vocab_size: int = 12) -> GPTLanguageModel:
    return GPTLanguageModel(
        GPTConfig(
            vocab_size=vocab_size,
            d_model=32,
            n_heads=4,
            n_layers=2,
            max_seq_len=16,
            dropout=0.0,
        )
    )


def test_character_tokenizer_round_trips_unicode_text():
    tokenizer = CharacterTokenizer.train(["Merhaba, dünya!"])
    text = "Merhaba, dünya!"
    assert tokenizer.decode(tokenizer.encode(text)) == text


def test_character_tokenizer_handles_unknown_characters_and_special_tokens():
    tokenizer = CharacterTokenizer.train(["abc"])
    encoded = tokenizer.encode("az", add_bos=True, add_eos=True)
    assert encoded[0] == tokenizer.bos_id
    assert encoded[-1] == tokenizer.eos_id
    assert tokenizer.unk_id in encoded
    assert tokenizer.decode(encoded) == "a"


def test_tokenizer_serialization_round_trip():
    tokenizer = CharacterTokenizer.train(["Frieren"])
    restored = CharacterTokenizer.from_dict(tokenizer.to_dict())
    assert restored.tokens == tokenizer.tokens


def test_model_returns_batch_sequence_vocabulary_logits():
    model = tiny_model()
    tokens = torch.randint(0, 12, (2, 7), dtype=torch.long)
    logits = model(tokens)
    assert logits.shape == (2, 7, 12)


def test_model_computes_finite_next_token_loss():
    model = tiny_model()
    tokens = torch.randint(0, 12, (2, 7), dtype=torch.long)
    logits, loss = model(tokens, targets=tokens)
    assert logits.shape == (2, 7, 12)
    assert torch.isfinite(loss)


def test_causal_attention_does_not_use_future_tokens():
    torch.manual_seed(7)
    model = tiny_model().eval()
    first = torch.tensor([[1, 2, 3, 4]], dtype=torch.long)
    changed_future = torch.tensor([[1, 2, 9, 8]], dtype=torch.long)
    with torch.no_grad():
        first_logits = model(first)
        changed_logits = model(changed_future)
    assert torch.allclose(first_logits[:, :2], changed_logits[:, :2], atol=1e-6)


def test_generation_preserves_prompt_and_appends_requested_tokens():
    model = tiny_model().eval()
    prompt = torch.tensor([[1, 2, 3]], dtype=torch.long)
    result = model.generate(prompt, max_new_tokens=4, top_k=3)
    assert result.shape == (1, 7)
    assert torch.equal(result[:, :3], prompt)


def test_invalid_model_dimensions_are_rejected():
    with pytest.raises(ValueError, match="divisible"):
        GPTConfig(vocab_size=10, d_model=30, n_heads=4)


def test_model_rejects_sequences_longer_than_context():
    model = tiny_model()
    tokens = torch.randint(0, 12, (1, 17), dtype=torch.long)
    with pytest.raises(ValueError, match="sequence length"):
        model(tokens)


def test_bpe_tokenizer_round_trips_multilingual_unicode_and_unknown_bytes():
    from frieren_neural.tokenizer import BPETokenizer

    tokenizer = BPETokenizer.train(["Merhaba dünya! Привет мир! 日本語", "Merhaba dünya!"], vocab_size=280)
    text = "Merhaba dünya! Привет мир! 日本語 🐈"
    assert tokenizer.decode(tokenizer.encode(text)) == text


def test_bpe_tokenizer_learns_merges_and_serializes_deterministically():
    from frieren_neural.tokenizer import BPETokenizer

    corpus = ["abababab", "abababab"]
    tokenizer = BPETokenizer.train(corpus, vocab_size=264, min_frequency=2)
    restored = BPETokenizer.from_dict(tokenizer.to_dict())
    assert tokenizer.vocab_size > 260
    assert restored.to_dict() == tokenizer.to_dict()
    assert restored.decode(restored.encode("abab")) == "abab"


def test_bpe_tokenizer_rejects_invalid_vocab_and_payload():
    from frieren_neural.tokenizer import BPETokenizer

    with pytest.raises(ValueError, match="vocab_size"):
        BPETokenizer.train(["abc"], vocab_size=259)
    with pytest.raises(ValueError, match="merges"):
        BPETokenizer.from_dict({"version": 1, "merges": [["x", 1]]})


def test_attention_uses_causal_sdpa_and_disables_dropout_during_evaluation(monkeypatch):
    original = torch.nn.functional.scaled_dot_product_attention
    calls = []

    def observe(*args, **kwargs):
        calls.append(kwargs.copy())
        return original(*args, **kwargs)

    monkeypatch.setattr(torch.nn.functional, "scaled_dot_product_attention", observe)
    model = tiny_model().eval()
    model(torch.randint(0, 12, (2, 7), dtype=torch.long))

    assert len(calls) == 2
    assert all(call.get("is_causal") is True for call in calls)
    assert all(call.get("dropout_p") == 0.0 for call in calls)


def test_attention_preserves_configured_dropout_during_training(monkeypatch):
    original = torch.nn.functional.scaled_dot_product_attention
    calls = []

    def observe(*args, **kwargs):
        calls.append(kwargs.copy())
        return original(*args, **kwargs)

    monkeypatch.setattr(torch.nn.functional, "scaled_dot_product_attention", observe)
    model = GPTLanguageModel(GPTConfig(
        vocab_size=12, d_model=32, n_heads=4, n_layers=1,
        max_seq_len=16, dropout=0.25,
    )).train()
    model(torch.randint(0, 12, (2, 7), dtype=torch.long))

    assert len(calls) == 1
    assert calls[0].get("is_causal") is True
    assert calls[0].get("dropout_p") == 0.25


def _reference_bpe_merges(texts, vocab_size, min_frequency):
    sequences = [list(text.encode("utf-8")) for text in texts if text]
    merges = []
    for _ in range(vocab_size - 260):
        counts = {}
        for sequence in sequences:
            for pair in zip(sequence, sequence[1:]):
                counts[pair] = counts.get(pair, 0) + 1
        if not counts:
            break
        best_pair, frequency = min(counts.items(), key=lambda item: (-item[1], item[0]))
        if frequency < min_frequency:
            break
        new_id = 260 + len(merges)
        updated_sequences = []
        for sequence in sequences:
            updated = []
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
    return tuple(merges)


@pytest.mark.parametrize(
    "texts,vocab_size,min_frequency",
    [
        (["aaaaaa", "aaaaa"], 275, 2),
        (["abababab", "babababa", "abab"], 280, 2),
        (["aabbaaab", "bbaaaabb", "aabb"], 290, 1),
        (["Merhaba dünya!", "Merhaba, dünya!"], 300, 2),
        (["abcabcabc", "abcabcabc", "xyzxyz"], 280, 3),
    ],
)
def test_optimized_bpe_training_preserves_reference_merge_order(texts, vocab_size, min_frequency):
    from frieren_neural.tokenizer import BPETokenizer

    tokenizer = BPETokenizer.train(texts, vocab_size=vocab_size, min_frequency=min_frequency)
    assert tokenizer.merges == _reference_bpe_merges(texts, vocab_size, min_frequency)


def test_optimized_bpe_training_never_merges_across_document_boundaries():
    from frieren_neural.tokenizer import BPETokenizer

    separate = BPETokenizer.train(["x", "y", "x", "y", "x", "y"], vocab_size=261, min_frequency=2)
    joined = BPETokenizer.train(["xyxyxy"], vocab_size=261, min_frequency=2)
    assert separate.merges == ()
    assert joined.merges == ((120, 121),)


def _reference_bpe_encode(text, merges, *, add_bos=False, add_eos=False):
    ids = list(text.encode("utf-8"))
    for merge_index, pair in enumerate(merges):
        new_id = 260 + merge_index
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
    if add_bos:
        ids.insert(0, 257)
    if add_eos:
        ids.append(258)
    return ids


@pytest.mark.parametrize(
    "text",
    [
        "aaaaaaa",
        "abababababab",
        "Merhaba dünya! Привет мир! 日本語 🐈",
        "Kullanıcı: Frieren kimdir?\nAsistan: Bir büyücüdür.",
        "xyxyxyxyzzzz",
    ],
)
def test_vectorized_bpe_encode_matches_reference_for_overlapping_and_unicode_text(text):
    from frieren_neural.tokenizer import BPETokenizer

    tokenizer = BPETokenizer.train(
        ["aaaaaaa", "abababababab", "Merhaba dünya! Привет мир! 日本語 🐈",
         "Kullanıcı: Frieren kimdir?\nAsistan: Bir büyücüdür.", "xyxyxyxyzzzz"],
        vocab_size=340, min_frequency=1,
    )
    assert tokenizer.encode(text) == _reference_bpe_encode(text, tokenizer.merges)
    assert tokenizer.encode(text, add_bos=True, add_eos=True) == _reference_bpe_encode(
        text, tokenizer.merges, add_bos=True, add_eos=True
    )


def test_model_supports_512_token_context_for_longer_dialogues():
    model = GPTLanguageModel(GPTConfig(
        vocab_size=12, d_model=16, n_heads=2, n_layers=1,
        max_seq_len=512, dropout=0.0,
    )).eval()
    tokens = torch.randint(0, 12, (1, 512), dtype=torch.long)

    with torch.no_grad():
        logits = model(tokens)
        generated = model.generate(torch.cat((tokens, tokens[:, :88]), dim=1), max_new_tokens=1, top_k=1)

    assert logits.shape == (1, 512, 12)
    assert generated.shape == (1, 601)


def test_width_expansion_preserves_source_weights_and_initializes_new_channels():
    from frieren_neural.model import load_expanded_weights

    torch.manual_seed(11)
    source = GPTLanguageModel(GPTConfig(
        vocab_size=12, d_model=16, n_heads=2, n_layers=1,
        max_seq_len=16, dropout=0.0,
    ))
    torch.manual_seed(29)
    expanded = GPTLanguageModel(GPTConfig(
        vocab_size=12, d_model=32, n_heads=4, n_layers=1,
        max_seq_len=16, dropout=0.0,
    ))
    original_new_channels = expanded.token_embedding.weight.detach().clone()
    load_expanded_weights(expanded, source.state_dict())

    assert torch.equal(expanded.token_embedding.weight[:, :16], source.token_embedding.weight)
    assert torch.equal(expanded.position_embedding.weight[:, :16], source.position_embedding.weight)
    assert torch.equal(
        expanded.blocks[0].attention.attention.in_proj_weight[:16, :16],
        source.blocks[0].attention.attention.in_proj_weight[:16, :16],
    )
    assert torch.equal(
        expanded.blocks[0].attention.attention.in_proj_weight[32:48, :16],
        source.blocks[0].attention.attention.in_proj_weight[16:32, :16],
    )
    assert torch.equal(
        expanded.blocks[0].mlp[0].weight[:64, :16],
        source.blocks[0].mlp[0].weight,
    )
    assert torch.equal(
        expanded.token_embedding.weight[:, 16:],
        original_new_channels[:, 16:],
    )
    assert expanded.output_projection.weight.data_ptr() == expanded.token_embedding.weight.data_ptr()


def test_width_expansion_rejects_changed_vocab_context_or_depth():
    from frieren_neural.model import load_expanded_weights

    source = tiny_model()
    incompatible = GPTLanguageModel(GPTConfig(
        vocab_size=12, d_model=64, n_heads=4, n_layers=2,
        max_seq_len=32, dropout=0.0,
    ))
    with pytest.raises(ValueError, match="preserve vocabulary"):
        load_expanded_weights(incompatible, source.state_dict())
