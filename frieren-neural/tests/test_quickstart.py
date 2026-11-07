import json

from frieren_neural import quickstart


def test_small_training_cli_uses_conservative_cpu_defaults(monkeypatch, capsys):
    captured = {}

    monkeypatch.setattr(
        "sys.argv",
        ["frieren-neural-train-small", "--data", "corpus", "--steps", "2"],
    )
    monkeypatch.setattr(quickstart, "load_licensed_corpus", lambda path: ["Merhaba. " * 100])
    dataset_metadata = {"dataset_sha256": "a" * 64, "dataset_id": "example/tr", "dataset_revision": "b" * 40, "source_fingerprint_sha256": "c" * 64, "processed_sha256": "d" * 64, "split": "train", "sample_count": 1}
    monkeypatch.setattr(quickstart, "load_corpus_manifest_metadata", lambda path, required_split: dataset_metadata)

    def fake_train(documents, checkpoint, config, *, resume=False, device, training_dataset_metadata=None):
        captured.update(
            documents=documents,
            checkpoint=checkpoint,
            config=config,
            device=device,
            resume=resume,
            training_dataset_metadata=training_dataset_metadata,
        )
        return {"step": config.max_steps, "checkpoint": checkpoint, "device": device}

    monkeypatch.setattr(quickstart, "train_model", fake_train)
    quickstart.main()

    result = json.loads(capsys.readouterr().out)
    assert result["step"] == 2
    assert captured["device"] == "cpu"
    assert captured["config"].batch_size == 4
    assert captured["config"].block_size == 64
    assert captured["config"].d_model == 64
    assert captured["config"].n_heads == 2
    assert captured["config"].n_layers == 2
    assert captured["config"].eval_batches == 3
    assert captured["training_dataset_metadata"] == dataset_metadata



def test_small_training_cli_passes_resume_to_trainer(monkeypatch, capsys):
    captured = {}
    monkeypatch.setattr(
        "sys.argv",
        ["frieren-neural-train-small", "--data", "corpus", "--steps", "16000", "--resume"],
    )
    monkeypatch.setattr(quickstart, "load_licensed_corpus", lambda path: ["Merhaba. " * 100])
    dataset_metadata = {"dataset_sha256": "a" * 64, "dataset_id": "example/tr", "dataset_revision": "b" * 40, "source_fingerprint_sha256": "c" * 64, "processed_sha256": "d" * 64, "split": "train", "sample_count": 1}
    monkeypatch.setattr(quickstart, "load_corpus_manifest_metadata", lambda path, required_split: dataset_metadata)

    def fake_train(documents, checkpoint, config, *, resume, device, training_dataset_metadata=None):
        captured.update(resume=resume, steps=config.max_steps, device=device, training_dataset_metadata=training_dataset_metadata)
        return {"step": config.max_steps, "checkpoint": checkpoint, "device": device}

    monkeypatch.setattr(quickstart, "train_model", fake_train)
    quickstart.main()

    result = json.loads(capsys.readouterr().out)
    assert result["step"] == 16000
    assert captured == {"resume": True, "steps": 16000, "device": "cpu", "training_dataset_metadata": dataset_metadata}
