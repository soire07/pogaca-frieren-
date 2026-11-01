from dataclasses import replace
from pathlib import Path

import pytest
import torch

from frieren_neural.training import TrainingConfig, evaluate_loss, load_text_corpus, split_tokens, train_model


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


def test_split_tokens_is_chronological_and_preserves_all_tokens():
    tokens = torch.arange(100)
    train, validation = split_tokens(tokens, validation_fraction=0.2)
    assert torch.equal(train, torch.arange(80))
    assert torch.equal(validation, torch.arange(80, 100))


def test_split_tokens_rejects_too_short_sequences():
    with pytest.raises(ValueError, match="at least"):
        split_tokens(torch.arange(3), validation_fraction=0.2)


def test_training_writes_resumable_checkpoint_and_finite_metrics(tmp_path: Path):
    corpus = ["Frieren learns magic. Fern studies spells. " * 8]
    checkpoint = tmp_path / "model.pt"
    config = TrainingConfig(
        max_steps=3, eval_interval=1, eval_batches=2, batch_size=2, block_size=8,
        learning_rate=1e-3, validation_fraction=0.2, seed=9,
        d_model=16, n_heads=2, n_layers=1, dropout=0.0,
    )
    result = train_model(corpus, checkpoint, config)
    assert result["step"] == 3
    assert torch.isfinite(torch.tensor(result["train_loss"]))
    assert torch.isfinite(torch.tensor(result["validation_loss"]))
    assert checkpoint.is_file()

    resumed = train_model(corpus, checkpoint, replace(config, max_steps=5), resume=True)
    assert resumed["step"] == 5
    assert torch.isfinite(torch.tensor(resumed["validation_loss"]))

    with pytest.raises(ValueError, match="Checkpoint corpus/model/training settings"):
        train_model(["Fern studies spells. Frieren learns magic. " * 8], checkpoint, replace(config, max_steps=6), resume=True)


def test_evaluate_loss_returns_finite_validation_value():
    from frieren_neural import CharacterTokenizer, GPTConfig, GPTLanguageModel

    tokenizer = CharacterTokenizer.train(["Frieren and Fern"])
    model = GPTLanguageModel(
        GPTConfig(vocab_size=tokenizer.vocab_size, d_model=16, n_heads=2, n_layers=1, max_seq_len=8, dropout=0.0)
    )
    data = torch.tensor(tokenizer.encode("Frieren and Fern " * 3), dtype=torch.long)
    loss = evaluate_loss(model, data, batch_size=2, block_size=8, batches=2, seed=1)
    assert torch.isfinite(torch.tensor(loss))



def test_training_checkpoint_uses_byte_bpe_tokenizer(tmp_path: Path):
    import json

    corpus = ["Frieren studies magic. " * 10]
    checkpoint = tmp_path / "bpe.pt"
    config = TrainingConfig(
        max_steps=1, eval_interval=1, eval_batches=1, batch_size=1, block_size=8,
        validation_fraction=0.2, d_model=16, n_heads=2, n_layers=1, dropout=0.0,
        tokenizer_vocab_size=280,
    )
    train_model(corpus, checkpoint, config)
    saved = torch.load(checkpoint, map_location="cpu", weights_only=False)
    assert saved["tokenizer"]["type"] == "byte_bpe"
    assert saved["model_config"]["vocab_size"] == 260 + len(saved["tokenizer"]["merges"])



def test_training_resume_matches_uninterrupted_cpu_run(tmp_path: Path):
    corpus = ["Frieren studies magic. Fern studies spells. " * 10]
    base = TrainingConfig(
        max_steps=4, eval_interval=1, eval_batches=1, batch_size=1, block_size=8,
        learning_rate=1e-3, validation_fraction=0.2, seed=31,
        d_model=16, n_heads=2, n_layers=1, dropout=0.1, tokenizer_vocab_size=280,
    )
    uninterrupted_path = tmp_path / "uninterrupted.pt"
    split_path = tmp_path / "split.pt"
    train_model(corpus, uninterrupted_path, base, device="cpu")
    train_model(corpus, split_path, replace(base, max_steps=2), device="cpu")
    train_model(corpus, split_path, base, resume=True, device="cpu")
    uninterrupted = torch.load(uninterrupted_path, map_location="cpu", weights_only=True)
    resumed = torch.load(split_path, map_location="cpu", weights_only=True)
    assert uninterrupted["step"] == resumed["step"] == 4
    assert uninterrupted["model_state"].keys() == resumed["model_state"].keys()
    for name, tensor in uninterrupted["model_state"].items():
        assert torch.equal(tensor, resumed["model_state"][name]), name


def test_training_config_rejects_invalid_bpe_settings():
    with pytest.raises(ValueError, match="BPE vocabulary"):
        TrainingConfig(tokenizer_vocab_size=259)
    with pytest.raises(ValueError, match="BPE vocabulary"):
        TrainingConfig(tokenizer_min_frequency=0)
