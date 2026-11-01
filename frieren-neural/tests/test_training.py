from pathlib import Path

import pytest
import torch

from frieren_neural.training import (
    TrainingConfig,
    load_text_corpus,
    split_tokens,
    train_model,
    evaluate_loss,
)


def test_load_text_corpus_reads_supported_files_in_stable_order(tmp_path: Path):
    (tmp_path / "b.txt").write_text("ikinci", encoding="utf-8")
    (tmp_path / "a.md").write_text("birinci", encoding="utf-8")
    (tmp_path / "ignored.json").write_text("ignore", encoding="utf-8")
    assert load_text_corpus(tmp_path) == ["birinci", "ikinci"]


def test_load_text_corpus_rejects_missing_or_empty_corpus(tmp_path: Path):
    with pytest.raises(FileNotFoundError):
        load_text_corpus(tmp_path / "missing")
    (tmp_path / "empty.txt").write_text("  ", encoding="utf-8")
    with pytest.raises(ValueError, match="No non-empty"):
        load_text_corpus(tmp_path)


def test_split_tokens_is_deterministic_and_keeps_both_splits():
    tokens = torch.arange(100)
    train_a, val_a = split_tokens(tokens, validation_fraction=0.2, seed=17)
    train_b, val_b = split_tokens(tokens, validation_fraction=0.2, seed=17)
    assert torch.equal(train_a, train_b)
    assert torch.equal(val_a, val_b)
    assert len(train_a) + len(val_a) == 100
    assert len(val_a) == 20


def test_split_tokens_rejects_too_short_sequences():
    with pytest.raises(ValueError, match="at least"):
        split_tokens(torch.arange(3), validation_fraction=0.2, seed=1)


def test_training_writes_resumable_checkpoint_and_finite_metrics(tmp_path: Path):
    corpus = ["Frieren learns magic. Fern studies spells. " * 8]
    checkpoint = tmp_path / "model.pt"
    config = TrainingConfig(
        max_steps=3,
        eval_interval=1,
        eval_batches=2,
        batch_size=2,
        block_size=8,
        learning_rate=1e-3,
        validation_fraction=0.2,
        seed=9,
        d_model=16,
        n_heads=2,
        n_layers=1,
        dropout=0.0,
    )
    result = train_model(corpus, checkpoint, config)
    assert result["step"] == 3
    assert torch.isfinite(torch.tensor(result["train_loss"]))
    assert torch.isfinite(torch.tensor(result["validation_loss"]))
    assert checkpoint.is_file()

    resumed = train_model(corpus, checkpoint, config, resume=True)
    assert resumed["step"] == 3
    assert torch.isfinite(torch.tensor(resumed["validation_loss"]))


def test_evaluate_loss_returns_finite_value():
    from frieren_neural import CharacterTokenizer, GPTConfig, GPTLanguageModel

    tokenizer = CharacterTokenizer.train(["Frieren and Fern"])
    model = GPTLanguageModel(
        GPTConfig(vocab_size=tokenizer.vocab_size, d_model=16, n_heads=2, n_layers=1, max_seq_len=8, dropout=0.0)
    )
    data = torch.tensor(tokenizer.encode("Frieren and Fern " * 3), dtype=torch.long)
    loss = evaluate_loss(model, data, data, batch_size=2, block_size=8, batches=2, seed=1)
    assert torch.isfinite(torch.tensor(loss))
