import json

from frieren_neural import quickstart


def test_small_training_cli_uses_conservative_cpu_defaults(monkeypatch, capsys):
    captured = {}

    monkeypatch.setattr(
        "sys.argv",
        ["frieren-neural-train-small", "--data", "corpus", "--steps", "2"],
    )
    monkeypatch.setattr(quickstart, "load_licensed_corpus", lambda path: ["Merhaba. " * 100])

    def fake_train(documents, checkpoint, config, *, device):
        captured.update(
            documents=documents,
            checkpoint=checkpoint,
            config=config,
            device=device,
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
