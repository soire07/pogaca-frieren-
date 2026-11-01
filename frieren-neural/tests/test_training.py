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


def test_corpus_fingerprint_preserves_document_boundaries():
    from frieren_neural.training import _corpus_fingerprint

    # A newline inside one document must not collide with two separate documents.
    assert _corpus_fingerprint(["alpha\nbeta"]) != _corpus_fingerprint(["alpha", "beta"])
    # Trimming remains canonical, but document order remains significant.
    assert _corpus_fingerprint(["  alpha  ", "beta"]) == _corpus_fingerprint(["alpha", "beta"])
    assert _corpus_fingerprint(["alpha", "beta"]) != _corpus_fingerprint(["beta", "alpha"])


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
    assert result["loss_objective_version"] == 2
    assert result["training_objective"] == "assistant_response_tokens_plus_eos"
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
    saved = torch.load(checkpoint, map_location="cpu", weights_only=True)
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


def test_resume_rejects_a_lower_target_step(tmp_path: Path):
    corpus = ["Frieren learns magic. Fern studies spells. " * 8]
    checkpoint = tmp_path / "model.pt"
    config = TrainingConfig(
        max_steps=3, eval_interval=1, eval_batches=1, batch_size=1, block_size=8,
        d_model=16, n_heads=2, n_layers=1, dropout=0.0,
    )
    train_model(corpus, checkpoint, config)
    with pytest.raises(ValueError, match="max_steps cannot be lower"):
        train_model(corpus, checkpoint, replace(config, max_steps=2), resume=True)



def test_licensed_corpus_requires_manifest_and_validates_declared_files(tmp_path: Path):
    import json
    from frieren_neural.training import load_licensed_corpus

    corpus_dir = tmp_path / "corpus"
    corpus_dir.mkdir()
    (corpus_dir / "source.txt").write_text("Frieren studies magic.", encoding="utf-8")
    with pytest.raises(ValueError, match="corpus_manifest.json"):
        load_licensed_corpus(corpus_dir)

    manifest = {
        "schema_version": 1,
        "documents": [{
            "path": "source.txt",
            "source": "User-authored test text",
            "license": "CC0-1.0",
            "usage": "Permitted for model training",
        }],
    }
    (corpus_dir / "corpus_manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    assert load_licensed_corpus(corpus_dir) == ["Frieren studies magic."]


def test_licensed_corpus_rejects_path_traversal_and_unlisted_files(tmp_path: Path):
    import json
    from frieren_neural.training import load_licensed_corpus

    corpus_dir = tmp_path / "corpus"
    corpus_dir.mkdir()
    (tmp_path / "outside.txt").write_text("outside", encoding="utf-8")
    manifest_path = corpus_dir / "corpus_manifest.json"
    manifest = {
        "schema_version": 1,
        "documents": [{
            "path": "../outside.txt",
            "source": "source",
            "license": "CC0-1.0",
            "usage": "allowed",
        }],
    }
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
    with pytest.raises(ValueError, match="inside the corpus"):
        load_licensed_corpus(corpus_dir)

    (corpus_dir / "listed.txt").write_text("listed text", encoding="utf-8")
    (corpus_dir / "extra.txt").write_text("unlisted text", encoding="utf-8")
    manifest["documents"][0]["path"] = "listed.txt"
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
    with pytest.raises(ValueError, match="exactly match"):
        load_licensed_corpus(corpus_dir)


def test_corpus_split_keeps_validation_text_out_of_tokenizer_training(tmp_path: Path):
    from frieren_neural.training import split_corpus_text

    train_text, validation_text = split_corpus_text(["a" * 80 + "z" * 20], 0.2)
    assert train_text == "a" * 80
    assert validation_text == "z" * 20


def test_saved_checkpoint_can_be_loaded_for_inference(tmp_path: Path):
    from frieren_neural.training import generate_text, load_checkpoint

    corpus = ["Frieren learns magic. Fern studies spells. " * 10]
    checkpoint = tmp_path / "inference.pt"
    config = TrainingConfig(
        max_steps=1, eval_interval=1, eval_batches=1, batch_size=1, block_size=8,
        d_model=16, n_heads=2, n_layers=1, dropout=0.0, tokenizer_vocab_size=280,
    )
    train_model(corpus, checkpoint, config, device="cpu")
    model, tokenizer, metadata = load_checkpoint(checkpoint, device="cpu")
    assert metadata["step"] == 1
    assert metadata["loss_objective_version"] == 2
    assert metadata["training_objective"] == "assistant_response_tokens_plus_eos"
    assert metadata["model_config"]["d_model"] == 16
    assert metadata["training_config"]["max_steps"] == 1
    assert metadata["tokenizer_type"] == "byte_bpe"
    assert metadata["tokenizer_vocab_size"] == tokenizer.vocab_size
    assert tokenizer.decode(tokenizer.encode("Frieren")) == "Frieren"
    generated = generate_text(model, tokenizer, "Frieren", max_new_tokens=2, top_k=1)
    assert generated.startswith("Frieren")


def test_train_model_does_not_learn_bpe_merges_from_validation_text(tmp_path: Path):
    corpus = ["a" * 80 + "z" * 20]
    checkpoint = tmp_path / "no-leakage.pt"
    config = TrainingConfig(
        max_steps=1, eval_interval=1, eval_batches=1, batch_size=1, block_size=8,
        d_model=16, n_heads=2, n_layers=1, dropout=0.0,
        validation_fraction=0.2, tokenizer_vocab_size=263, tokenizer_min_frequency=2,
    )
    train_model(corpus, checkpoint, config, device="cpu")
    saved = torch.load(checkpoint, map_location="cpu", weights_only=True)
    assert all(122 not in pair for pair in saved["tokenizer"]["merges"])


def test_evaluation_uses_separate_corpus_and_returns_perplexity(tmp_path: Path):
    from frieren_neural.training import evaluate_checkpoint

    training_corpus = ["Frieren studies magic. " * 12]
    evaluation_corpus = ["Fern practices spells. " * 12]
    checkpoint = tmp_path / "evaluation.pt"
    config = TrainingConfig(
        max_steps=1, eval_interval=1, eval_batches=1, batch_size=1, block_size=8,
        d_model=16, n_heads=2, n_layers=1, dropout=0.0, tokenizer_vocab_size=280,
    )
    train_model(training_corpus, checkpoint, config, device="cpu")
    metrics = evaluate_checkpoint(checkpoint, evaluation_corpus, batch_size=1, batches=2, device="cpu")
    assert metrics["loss"] > 0
    assert metrics["perplexity"] >= 1
    assert metrics["loss_objective_version"] == 1
    assert metrics["checkpoint_training_loss_objective_version"] == 1


def test_evaluation_rejects_training_corpus_reuse(tmp_path: Path):
    from frieren_neural.training import evaluate_checkpoint

    corpus = ["Frieren studies magic. " * 6, "Frieren studies magic. " * 6]
    checkpoint = tmp_path / "evaluation-guard.pt"
    config = TrainingConfig(
        max_steps=1, eval_interval=1, eval_batches=1, batch_size=1, block_size=8,
        d_model=16, n_heads=2, n_layers=1, dropout=0.0,
    )
    train_model(corpus, checkpoint, config, device="cpu")
    with pytest.raises(ValueError, match="separate from the training corpus"):
        evaluate_checkpoint(checkpoint, ["\n".join(corpus)], batch_size=1, batches=1, device="cpu")



def test_training_stream_marks_each_dialogue_with_bos_and_eos():
    from frieren_neural.tokenizer import BPETokenizer
    from frieren_neural.training import encode_dialogue_stream

    separator = "\n\n---\n\n"
    text = "Kullanıcı: Merhaba.\nAsistan: Selam." + separator + "Kullanıcı: Nasılsın?\nAsistan: İyiyim."
    tokenizer = BPETokenizer.train([text], vocab_size=280)
    encoded = encode_dialogue_stream(text, tokenizer)
    assert encoded.count(tokenizer.bos_id) == 2
    assert encoded.count(tokenizer.eos_id) == 2
    assert encoded[0] == tokenizer.bos_id
    assert encoded[-1] == tokenizer.eos_id


def test_generate_text_returns_prompt_plus_only_generated_tokens_before_eos(monkeypatch):
    from frieren_neural.tokenizer import BPETokenizer
    from frieren_neural.training import generate_text
    from frieren_neural import GPTConfig, GPTLanguageModel

    tokenizer = BPETokenizer.train(["Merhaba cevap sonrasındaki"], vocab_size=280)
    model = GPTLanguageModel(GPTConfig(
        vocab_size=tokenizer.vocab_size, d_model=16, n_heads=2,
        n_layers=1, max_seq_len=16, dropout=0.0,
    ))
    prompt = "Merhaba"
    prompt_ids = torch.tensor([tokenizer.encode(prompt)], dtype=torch.long)
    completion_ids = tokenizer.encode(" cevap") + [tokenizer.eos_id] + tokenizer.encode("sonrasındaki")
    generated = torch.tensor([prompt_ids[0].tolist() + completion_ids], dtype=torch.long)
    monkeypatch.setattr(model, "generate", lambda *_args, **_kwargs: generated)
    assert generate_text(model, tokenizer, prompt, max_new_tokens=8) == prompt + " cevap"

def test_corpus_split_keeps_dialogues_intact_at_importer_boundaries():
    from frieren_neural.training import split_corpus_text

    dialogues = [f"Kullanıcı: soru {index}\nAsistan: yanıt {index}" for index in range(10)]
    corpus = "\n\n---\n\n".join(dialogues)
    train_text, validation_text = split_corpus_text([corpus], 0.2)

    train_dialogues = train_text.split("\n\n---\n\n")
    validation_dialogues = validation_text.split("\n\n---\n\n")
    assert train_dialogues == dialogues[:8]
    assert validation_dialogues == dialogues[8:]
    assert set(train_dialogues).isdisjoint(validation_dialogues)


def test_training_stream_ends_each_assistant_turn_before_next_user():
    from frieren_neural.tokenizer import BPETokenizer
    from frieren_neural.training import encode_dialogue_stream

    text = (
        "Kullanıcı: ilk soru\nAsistan: ilk yanıt\n"
        "Kullanıcı: ikinci soru\nAsistan: ikinci yanıt"
    )
    tokenizer = BPETokenizer.train([text], vocab_size=280)
    encoded = encode_dialogue_stream(text, tokenizer)

    assert encoded.count(tokenizer.bos_id) == 1
    assert encoded.count(tokenizer.eos_id) == 2
    chunks = []
    current = []
    for token in encoded:
        if token == tokenizer.eos_id:
            chunks.append(current)
            current = []
        elif token != tokenizer.bos_id:
            current.append(token)
    assert tokenizer.decode(chunks[0]).endswith("Asistan: ilk yanıt\n")
    assert tokenizer.decode(chunks[1]).startswith("Kullanıcı: ikinci soru\n")


def test_resume_rejects_checkpoint_with_legacy_dialogue_encoding(tmp_path: Path):
    corpus = ["Frieren studies magic. Fern studies spells. " * 50]
    checkpoint = tmp_path / "legacy-dialogue.pt"
    config = TrainingConfig(
        max_steps=1, eval_interval=1, eval_batches=1, batch_size=1, block_size=8,
        d_model=16, n_heads=2, n_layers=1, dropout=0.0,
    )
    train_model(corpus, checkpoint, config, device="cpu")
    saved = torch.load(checkpoint, map_location="cpu", weights_only=True)
    saved.pop("dialogue_encoding_version", None)
    torch.save(saved, checkpoint)

    with pytest.raises(ValueError, match="dialogue encoding"):
        train_model(corpus, checkpoint, replace(config, max_steps=2), resume=True, device="cpu")


def test_evaluate_checkpoint_uses_chat_aware_dialogue_encoding(tmp_path: Path, monkeypatch):
    from frieren_neural import training

    checkpoint = tmp_path / "chat-evaluation.pt"
    config = TrainingConfig(
        max_steps=1, eval_interval=1, eval_batches=1, batch_size=1, block_size=8,
        d_model=16, n_heads=2, n_layers=1, dropout=0.0,
    )
    training.train_model(["Frieren studies magic. Fern studies spells. " * 60], checkpoint, config, device="cpu")

    observed = []
    original = training.encode_dialogue_stream

    def capture(text, tokenizer):
        tokens = original(text, tokenizer)
        observed.append((text, tokens.count(tokenizer.eos_id)))
        return tokens

    monkeypatch.setattr(training, "encode_dialogue_stream", capture)
    evaluation_text = "Kullanıcı: Fern kimdir? Bana iki cümleyle açıklar mısın?\nAsistan: Fern, Frieren'in çırağıdır. Fern sakin, dikkatli ve güçlü bir büyücüdür."
    training.evaluate_checkpoint(
        checkpoint, [evaluation_text], batch_size=1, batches=1, device="cpu"
    )

    assert observed == [(evaluation_text, 1)]


def test_generation_prompt_inserts_eos_between_completed_assistant_turns():
    from frieren_neural.tokenizer import BPETokenizer
    from frieren_neural.training import encode_generation_prompt

    prompt = (
        "Kullanıcı: Bana kısa yanıt ver.\n"
        "Asistan: Elbette, kısa yanıt vereceğim.\n"
        "Kullanıcı: TCP nedir?\n"
        "Asistan:"
    )
    tokenizer = BPETokenizer.train([prompt], vocab_size=280)
    encoded = encode_generation_prompt(prompt, tokenizer)

    assert encoded.count(tokenizer.bos_id) == 1
    assert encoded.count(tokenizer.eos_id) == 1
    eos_index = encoded.index(tokenizer.eos_id)
    assert tokenizer.decode(encoded[1:eos_index]).endswith("Asistan: Elbette, kısa yanıt vereceğim.\n")
    assert tokenizer.decode(encoded[eos_index + 1:]).endswith("Asistan:")

    single_turn = encode_generation_prompt("Kullanıcı: Merhaba.\nAsistan:", tokenizer)
    assert single_turn.count(tokenizer.eos_id) == 0
