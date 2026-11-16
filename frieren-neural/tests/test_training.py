from dataclasses import replace
from pathlib import Path

import pytest
import torch

from frieren_neural.training import TrainingConfig, evaluate_loss, load_checkpoint, load_text_corpus, split_tokens, train_model


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

    with pytest.raises(ValueError, match="Training corpus does not match this checkpoint"):
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
            "sha256": __import__("hashlib").sha256(b"Frieren studies magic.").hexdigest(),
        }],
    }
    (corpus_dir / "corpus_manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    assert load_licensed_corpus(corpus_dir) == ["Frieren studies magic."]

    manifest["documents"][0].pop("sha256")
    (corpus_dir / "corpus_manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    with pytest.raises(ValueError, match="SHA-256 is required"):
        load_licensed_corpus(corpus_dir)


def test_licensed_corpus_hashes_exact_file_bytes_and_rejects_tampering(tmp_path: Path):
    import hashlib
    import json
    from frieren_neural.training import load_licensed_corpus

    corpus_dir = tmp_path / "byte-exact"
    corpus_dir.mkdir()
    raw = "Frieren studies magic.\r\n".encode("utf-8")
    (corpus_dir / "source.txt").write_bytes(raw)
    manifest = {
        "schema_version": 1,
        "documents": [{
            "path": "source.txt",
            "source": "Pinned source",
            "license": "CC0-1.0",
            "usage": "Permitted for training",
            "sha256": hashlib.sha256(raw).hexdigest(),
        }],
    }
    manifest_path = corpus_dir / "corpus_manifest.json"
    manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
    assert load_licensed_corpus(corpus_dir) == ["Frieren studies magic."]

    (corpus_dir / "source.txt").write_bytes(b"Tampered corpus content.")
    with pytest.raises(ValueError, match="SHA-256 mismatch"):
        load_licensed_corpus(corpus_dir)


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
    manifest["documents"][0]["sha256"] = __import__("hashlib").sha256(b"listed text").hexdigest()
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
    assert metrics["loss_objective_version"] == 2
    assert metrics["checkpoint_training_loss_objective_version"] == 2


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

def test_corpus_split_keeps_dialogues_intact_and_is_independent_of_source_order():
    from frieren_neural.training import split_corpus_text

    dialogues = [f"Kullanıcı: soru {index}\nAsistan: yanıt {index}" for index in range(100)]
    corpus = "\n\n---\n\n".join(dialogues)
    train_text, validation_text = split_corpus_text([corpus], 0.2)
    shuffled_text, shuffled_validation = split_corpus_text(["\n\n---\n\n".join(reversed(dialogues))], 0.2)

    train_dialogues = train_text.split("\n\n---\n\n")
    validation_dialogues = validation_text.split("\n\n---\n\n")
    assert train_dialogues == shuffled_text.split("\n\n---\n\n")
    assert validation_dialogues == shuffled_validation.split("\n\n---\n\n")
    assert set(train_dialogues).isdisjoint(validation_dialogues)
    assert len(validation_dialogues) > 0
    assert len(train_dialogues) > len(validation_dialogues)


def test_corpus_split_keeps_exact_duplicate_dialogues_in_one_partition():
    from frieren_neural.training import split_corpus_text

    repeated = "Kullanıcı: aynı soru\nAsistan: aynı yanıt"
    dialogues = [repeated, repeated] + [
        f"Kullanıcı: soru {index}\nAsistan: farklı yanıt {index}" for index in range(20)
    ]
    train_text, validation_text = split_corpus_text(["\n\n---\n\n".join(dialogues)], 0.2)
    train_dialogues = train_text.split("\n\n---\n\n")
    validation_dialogues = validation_text.split("\n\n---\n\n")
    assert not (repeated in train_dialogues and repeated in validation_dialogues)


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



def test_vectorized_batch_sampling_matches_cached_assistant_target_windows():
    from frieren_neural.training import _sample_batch, _valid_batch_starts

    data = torch.arange(20, dtype=torch.long)
    mask = torch.tensor(
        [False, False, False, True, True, False, False, False, True, True,
         False, False, False, False, True, True, False, False, False, False],
        dtype=torch.bool,
    )
    expected_starts = _valid_batch_starts(mask, 4)
    assert torch.equal(expected_starts, torch.tensor([0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14]))

    generator = torch.Generator(device="cpu").manual_seed(77)
    inputs, targets = _sample_batch(
        data, batch_size=3, block_size=4, device=torch.device("cpu"),
        generator=generator, target_mask=mask, valid_starts=expected_starts,
    )
    assert torch.all((targets[:, :-1] == -100) | (inputs[:, 1:] == targets[:, :-1]))
    assert torch.all((targets == -100) | (targets >= 0))
    assert torch.all((targets == -100).any(dim=1))


def test_valid_batch_starts_rejects_windows_without_assistant_targets():
    from frieren_neural.training import _valid_batch_starts

    with pytest.raises(ValueError, match="no assistant targets"):
        _valid_batch_starts(torch.zeros(12, dtype=torch.bool), 4)


def test_warm_start_candidate_uses_parent_weights_without_overwriting_parent(tmp_path: Path, monkeypatch):
    import hashlib

    from frieren_neural.training import load_checkpoint

    corpus = ["\n\n---\n\n".join(
        f"Kullanıcı: Frieren kimdir {index}?\nAsistan: Bir büyücüdür."
        for index in range(12)
    )]
    heldout = ["\n\n---\n\n".join(
        f"Kullanıcı: Fern kimdir {index}?\nAsistan: Bir büyücüdür."
        for index in range(12)
    )]
    baseline = tmp_path / "baseline.pt"
    config = TrainingConfig(
        max_steps=2, eval_interval=1, eval_batches=1, batch_size=1, block_size=8,
        learning_rate=1e-3, validation_fraction=0.2, seed=41,
        d_model=16, n_heads=2, n_layers=1, dropout=0.0, tokenizer_vocab_size=280,
    )
    dataset_metadata = {
        "dataset_sha256": "a" * 64, "dataset_id": "example/base",
        "dataset_revision": "b" * 40, "source_fingerprint_sha256": "c" * 64,
        "processed_sha256": "d" * 64, "split": "train", "sample_count": 12,
    }
    train_model(corpus, baseline, config, device="cpu", training_dataset_metadata=dataset_metadata)
    baseline_sha = hashlib.sha256(baseline.read_bytes()).hexdigest()

    from frieren_neural.evolution import run_candidate_search
    from frieren_neural.tokenizer import BPETokenizer

    def unexpected_tokenizer_training(*_args, **_kwargs):
        raise AssertionError("warm-start candidates must reuse the parent tokenizer")

    monkeypatch.setattr(BPETokenizer, "train", unexpected_tokenizer_training)
    report = run_candidate_search(
        corpus, heldout, baseline, tmp_path / "candidates",
        candidate_steps=1, heldout_batches=1, learning_rate_factors=(1.0,), device="cpu",
        training_dataset_metadata=dataset_metadata,
    )

    assert hashlib.sha256(baseline.read_bytes()).hexdigest() == baseline_sha
    assert report["baseline"]["checkpoint_sha256"] == baseline_sha
    assert report["promotion"]["automatic_promotion"] is False
    assert report["promotion"]["human_review_required"] is False
    assert report["promotion"]["automated_quality_gate_required"] is True
    baseline_review = tmp_path / "candidates" / "baseline-quality" / "quality-report.json"
    assert baseline_review.is_file()
    candidate_review = Path(report["trials"][0]["quality_report"])
    assert candidate_review.is_file()
    candidate_quality = __import__("json").loads(candidate_review.read_text(encoding="utf-8"))
    assert "automated_case_pass_rate_below_92_percent" in candidate_quality["blocking_reasons"]
    assert "automated_quality" in candidate_quality
    assert not (candidate_review.parent / "human-scores.template.json").exists()
    candidate = tmp_path / "candidates" / "candidate-01-lr-1.pt"
    assert candidate.is_file()
    _, _, metadata = load_checkpoint(candidate, device="cpu")
    assert metadata["parent_checkpoint_sha256"] == baseline_sha
    assert metadata["parent_checkpoint_step"] == 2
    assert metadata["step"] == 1


def test_warm_start_rejects_incompatible_model_context(tmp_path: Path):
    corpus = ["Frieren studies magic. " * 30]
    checkpoint = tmp_path / "parent.pt"
    config = TrainingConfig(
        max_steps=1, eval_interval=1, eval_batches=1, batch_size=1, block_size=8,
        d_model=16, n_heads=2, n_layers=1, dropout=0.0,
    )
    dataset_metadata = {
        "dataset_sha256": "a" * 64, "dataset_id": "example/base",
        "dataset_revision": "b" * 40, "source_fingerprint_sha256": "c" * 64,
        "processed_sha256": "d" * 64, "split": "train", "sample_count": 10,
    }
    train_model(corpus, checkpoint, config, device="cpu", training_dataset_metadata=dataset_metadata)
    incompatible = replace(config, block_size=16)
    with pytest.raises(ValueError, match="model/tokenizer settings do not match"):
        train_model(
            corpus, tmp_path / "candidate.pt", incompatible,
            initialize_from=checkpoint, device="cpu",
            training_dataset_metadata=dataset_metadata,
        )


def test_training_tokenizer_fallback_requires_strictly_more_tokens_than_context(tmp_path: Path):
    corpus = ["Frieren studies magic. " * 30]
    checkpoint = tmp_path / "context-boundary.pt"
    config = TrainingConfig(
        max_steps=1, eval_interval=1, eval_batches=1, batch_size=1, block_size=8,
        d_model=16, n_heads=2, n_layers=1, dropout=0.0,
        tokenizer_vocab_size=512, tokenizer_min_frequency=2,
    )
    result = train_model(corpus, checkpoint, config, device="cpu")
    assert result["step"] == 1
    saved = torch.load(checkpoint, map_location="cpu", weights_only=True)
    assert saved["tokenizer"]["type"] == "byte_bpe"


def test_resume_reuses_checkpoint_tokenizer_without_retraining(tmp_path: Path, monkeypatch):
    from frieren_neural.tokenizer import BPETokenizer

    corpus = ["Frieren studies magic. Fern studies spells. " * 20]
    checkpoint = tmp_path / "reuse-tokenizer.pt"
    config = TrainingConfig(
        max_steps=1, eval_interval=1, eval_batches=1, batch_size=1, block_size=8,
        d_model=16, n_heads=2, n_layers=1, dropout=0.0, tokenizer_vocab_size=280,
    )
    train_model(corpus, checkpoint, config, device="cpu")

    def unexpected_tokenizer_training(*_args, **_kwargs):
        raise AssertionError("resume must reuse the checkpoint tokenizer")

    monkeypatch.setattr(BPETokenizer, "train", unexpected_tokenizer_training)
    resumed = train_model(corpus, checkpoint, replace(config, max_steps=2), resume=True, device="cpu")
    assert resumed["step"] == 2


def test_candidate_search_reports_failure_when_no_trial_trains(tmp_path: Path, monkeypatch):
    from frieren_neural import evolution

    corpus = ["Frieren learns magic. Fern studies spells. " * 20]
    heldout = ["Fern learns spells. Frieren studies magic. " * 20]
    baseline = tmp_path / "baseline-failure-test.pt"
    config = TrainingConfig(
        max_steps=1, eval_interval=1, eval_batches=1, batch_size=1, block_size=8,
        learning_rate=1e-3, validation_fraction=0.2, seed=17,
        d_model=16, n_heads=2, n_layers=1, dropout=0.0, tokenizer_vocab_size=280,
    )
    train_model(corpus, baseline, config, device="cpu")

    def fail_candidate(*_args, **_kwargs):
        raise RuntimeError("synthetic isolated candidate failure")

    monkeypatch.setattr(evolution, "train_model", fail_candidate)
    report = evolution.run_candidate_search(
        corpus, heldout, baseline, tmp_path / "failed-candidates",
        candidate_steps=1, heldout_batches=1, learning_rate_factors=(1.0,), device="cpu",
    )

    assert report["status"] == "CANDIDATE_SEARCH_FAILED"
    assert report["successful_trial_count"] == 0
    assert report["failed_trial_count"] == 1



def test_heldout_manifest_metadata_is_pinned_and_split_scoped(tmp_path: Path):
    import hashlib
    import json
    from frieren_neural.training import load_corpus_manifest_metadata

    corpus_file = tmp_path / "source.txt"
    processed_content = "Frieren studies magic.\\n"
    corpus_file.write_text(processed_content, encoding="utf-8")
    processed_sha = hashlib.sha256(processed_content.encode("utf-8")).hexdigest()
    manifest = {
        "schema_version": 1,
        "dataset": {
            "id": "example/turkish-heldout",
            "revision": "a" * 40,
            "license": "CC0-1.0",
            "split": "heldout",
            "dialogues": 12,
            "source_sha256": "b" * 64,
            "processed_sha256": processed_sha,
        },
        "documents": [{
            "path": "source.txt",
            "source": "Pinned test corpus",
            "license": "CC0-1.0",
            "usage": "Test-only fixture",
            "sha256": processed_sha,
        }],
    }
    (tmp_path / "corpus_manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    metadata = load_corpus_manifest_metadata(tmp_path)
    assert metadata["split"] == "heldout"
    assert metadata["sample_count"] == 12
    assert metadata["dataset_revision"] == "a" * 40
    assert metadata["dataset_id"] == "example/turkish-heldout"
    assert metadata["source_fingerprint_sha256"] == "b" * 64
    assert metadata["processed_sha256"] == processed_sha
    assert len(metadata["dataset_sha256"]) == 64
    assert metadata["evaluation_version"] == "frieren-neural-heldout-v1"

    test_metadata = load_corpus_manifest_metadata(tmp_path, required_split="heldout")
    assert test_metadata["source_split"] == "heldout"
    manifest["dataset"]["split"] = "test"
    (tmp_path / "corpus_manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    test_metadata = load_corpus_manifest_metadata(tmp_path, required_split="test")
    assert test_metadata["split"] == "heldout"
    assert test_metadata["source_split"] == "test"

    manifest["dataset"]["split"] = "train"
    (tmp_path / "corpus_manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    train_metadata = load_corpus_manifest_metadata(tmp_path, required_split="train")
    assert train_metadata["split"] == "train"

    manifest["dataset"]["processed_sha256"] = "0" * 64
    manifest["documents"][0]["sha256"] = "0" * 64
    (tmp_path / "corpus_manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    with pytest.raises(ValueError, match="Processed corpus file SHA-256"):
        load_corpus_manifest_metadata(tmp_path, required_split="train")


def test_evaluate_checkpoint_emits_heldout_manifest_provenance(monkeypatch):
    from types import SimpleNamespace
    from frieren_neural import training

    fake_model = SimpleNamespace(config=SimpleNamespace(max_seq_len=8))
    fake_metadata = {
        "step": 5,
        "corpus_sha256": "a" * 64,
        "corpus_content_sha256": "b" * 64,
        "loss_objective_version": training.LOSS_OBJECTIVE_VERSION,
    }
    heldout_metadata = {
        "dataset_sha256": "c" * 64,
        "sample_count": 20,
        "split": "heldout",
        "source_split": "test",
        "evaluation_version": training.HELDOUT_EVALUATION_VERSION,
        "dataset_id": "example/heldout",
        "dataset_revision": "d" * 40,
        "row_ids_sha256": "e" * 64,
    }
    monkeypatch.setattr(training, "load_checkpoint", lambda *args, **kwargs: (fake_model, object(), fake_metadata))
    monkeypatch.setattr(training, "encode_dialogue_stream", lambda *args, **kwargs: [1, 2, 3])
    monkeypatch.setattr(training, "encode_dialogue_stream_with_loss_mask", lambda *args, **kwargs: ([1, 2, 3], [True, True, True]))
    monkeypatch.setattr(training, "evaluate_loss", lambda *args, **kwargs: 2.0)

    result = training.evaluate_checkpoint("candidate.pt", ["heldout dialogue"], dataset_metadata=heldout_metadata)
    assert result["dataset_sha256"] == "c" * 64
    assert result["sample_count"] == 20
    assert result["split"] == "heldout"
    assert result["source_split"] == "test"
    assert result["evaluation_version"] == training.HELDOUT_EVALUATION_VERSION


def test_resume_rejects_a_different_pinned_training_manifest(tmp_path: Path):
    corpus = ["Frieren studies magic. Fern studies spells. " * 8]
    checkpoint = tmp_path / "manifest-bound.pt"
    config = TrainingConfig(
        max_steps=1, eval_interval=1, eval_batches=1, batch_size=1, block_size=8,
        d_model=16, n_heads=2, n_layers=1, dropout=0.0,
    )
    original = {
        "dataset_sha256": "a" * 64,
        "dataset_id": "example/turkish",
        "dataset_revision": "b" * 40,
        "source_fingerprint_sha256": "c" * 64,
        "processed_sha256": "d" * 64,
        "split": "train",
        "sample_count": 10,
    }
    changed = {**original, "source_fingerprint_sha256": "e" * 64}
    train_model(corpus, checkpoint, config, training_dataset_metadata=original)
    with pytest.raises(ValueError, match="Training dataset manifest does not match this checkpoint"):
        train_model(
            corpus, checkpoint, config, resume=True,
            training_dataset_metadata=changed,
        )


def test_warm_start_allows_a_new_pinned_dataset_and_preserves_parent_lineage(tmp_path: Path):
    import hashlib

    corpus = ["Frieren studies magic. Fern studies spells. " * 8]
    baseline_checkpoint = tmp_path / "baseline-lineage.pt"
    candidate_checkpoint = tmp_path / "candidate-lineage.pt"
    base_config = TrainingConfig(
        max_steps=1, eval_interval=1, eval_batches=1, batch_size=1, block_size=8,
        d_model=16, n_heads=2, n_layers=1, dropout=0.0,
    )
    baseline_dataset = {
        "dataset_sha256": "a" * 64, "dataset_id": "example/base",
        "dataset_revision": "b" * 40, "source_fingerprint_sha256": "c" * 64,
        "processed_sha256": "d" * 64, "split": "train", "sample_count": 10,
    }
    candidate_dataset = {
        "dataset_sha256": "e" * 64, "dataset_id": "example/verified-knowledge",
        "dataset_revision": "f" * 40, "source_fingerprint_sha256": "1" * 64,
        "processed_sha256": "2" * 64, "split": "train", "sample_count": 5,
    }

    train_model(corpus, baseline_checkpoint, base_config, training_dataset_metadata=baseline_dataset)
    _, _, baseline_metadata = load_checkpoint(baseline_checkpoint)
    candidate_corpus = ["Fern studies a new collection of spells. Stark explores another archive. " * 8]
    candidate_config = TrainingConfig(
        max_steps=2, eval_interval=1, eval_batches=1, batch_size=1, block_size=8,
        d_model=16, n_heads=2, n_layers=1, dropout=0.0,
    )
    train_model(
        candidate_corpus, candidate_checkpoint, candidate_config,
        initialize_from=baseline_checkpoint,
        training_dataset_metadata=candidate_dataset,
    )
    train_model(
        candidate_corpus, candidate_checkpoint, replace(candidate_config, max_steps=3),
        resume=True,
        training_dataset_metadata=candidate_dataset,
    )

    _, _, metadata = load_checkpoint(candidate_checkpoint)
    assert metadata["training_dataset"] == candidate_dataset
    assert metadata["corpus_sha256"] != baseline_metadata["corpus_sha256"]
    assert metadata["parent_training_dataset"] == baseline_dataset
    assert metadata["parent_checkpoint_sha256"] == hashlib.sha256(baseline_checkpoint.read_bytes()).hexdigest()
    assert metadata["parent_checkpoint_step"] == 1
    assert metadata["step"] == 3


def test_training_can_warm_start_a_wider_candidate_without_overwriting_parent(tmp_path: Path):
    from frieren_neural.hf_corpus import prepare_turkish_chat_max_25k
    from frieren_neural.training import load_corpus_manifest_metadata, load_licensed_corpus

    rows = []
    for index in range(40):
        rows.append({
            "id": f"warm-{index}",
            "language_mode": "tr_only",
            "has_tools": False,
            "messages": [
                {"role": "user", "content": f"Frieren büyü çalışması {index} nasıl yapılır?"},
                {"role": "assistant", "content": f"Önce temel kuralları öğren, sonra {index} numaralı alıştırmayı çöz."},
            ],
        })
    corpus_root = tmp_path / "licensed"
    prepare_turkish_chat_max_25k(rows, corpus_root, revision="a" * 40, license_name="Apache-2.0")
    train_dir = corpus_root / "train"
    documents = load_licensed_corpus(train_dir)
    provenance = load_corpus_manifest_metadata(train_dir, required_split="train")

    parent_path = tmp_path / "parent.pt"
    candidate_path = tmp_path / "expanded-candidate.pt"
    base = TrainingConfig(
        max_steps=1, eval_interval=1, eval_batches=1, batch_size=1, block_size=8,
        seed=41, d_model=16, n_heads=2, n_layers=1, dropout=0.0,
        tokenizer_vocab_size=280,
    )
    train_model(documents, parent_path, base, training_dataset_metadata=provenance, device="cpu")
    parent_hash = __import__("hashlib").sha256(parent_path.read_bytes()).hexdigest()

    expanded_config = replace(base, max_steps=2, d_model=32, n_heads=4)
    result = train_model(
        documents, candidate_path, expanded_config, initialize_from=parent_path,
        training_dataset_metadata=provenance, device="cpu",
    )

    assert result["step"] == 2
    assert result["parent_checkpoint_step"] == 1
    assert result["parent_checkpoint_sha256"] == parent_hash
    assert parent_path.is_file()
    assert __import__("hashlib").sha256(parent_path.read_bytes()).hexdigest() == parent_hash
    model, _, metadata = load_checkpoint(candidate_path, device="cpu")
    assert metadata["model_config"]["d_model"] == 32
    assert metadata["model_config"]["n_heads"] == 4
    assert model.config.d_model == 32
