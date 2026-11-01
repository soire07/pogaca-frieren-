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
