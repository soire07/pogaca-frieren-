import hashlib
import json

import torch

from frieren_neural import native_evaluation
from frieren_neural.scratch_model import FrierenNeuralConfig, FrierenNeuralModel
from frieren_neural.tokenizer import BPETokenizer


def _write_heldout(root):
    root.mkdir(parents=True)
    text = "\n\n---\n\n".join(
        f"Kullanıcı: Merhaba, bu test {index}.\nAsistan: Merhaba, test yanıtı {index}."
        for index in range(8)
    ) + "\n"
    (root / "assistant-dialogues.txt").write_text(text, encoding="utf-8")
    raw = text.encode("utf-8")
    manifest = {
        "schema_version": 1,
        "dataset": {"id": "native-eval-test", "version": "1", "license": "CC0-1.0"},
        "documents": [{
            "path": "assistant-dialogues.txt",
            "source": "Original synthetic unit-test conversations",
            "license": "CC0-1.0",
            "usage": "Synthetic test fixture permitted for model evaluation",
            "sha256": hashlib.sha256(raw).hexdigest(),
        }],
    }
    (root / "corpus_manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False), encoding="utf-8"
    )
    return text


def _write_checkpoint(path, text):
    tokenizer = BPETokenizer.train([text], vocab_size=300)
    config = FrierenNeuralConfig(
        vocab_size=tokenizer.vocab_size, d_model=16, n_layers=1,
        n_heads=2, n_kv_heads=1, max_seq_len=64,
    )
    model = FrierenNeuralModel(config)
    torch.save({
        "format_version": 2,
        "architecture_id": "frieren-neural-transformer-v2",
        "pretrained_weights": False,
        "model_config": config.to_dict(),
        "model_state": model.state_dict(),
        "tokenizer": tokenizer.to_dict(),
        "step": 3,
        "seed": 7,
        "training_corpus_sha256": hashlib.sha256(b"train").hexdigest(),
        "manifest_sha256": hashlib.sha256(b"manifest").hexdigest(),
        "licenses": ["CC0-1.0"],
        "training_config": {"steps": 3, "d_model": 16},
    }, path)


def test_native_heldout_evaluation_scores_only_assistant_targets(tmp_path):
    text = _write_heldout(tmp_path / "heldout")
    tokenizer = BPETokenizer.train([text], vocab_size=300)
    config = FrierenNeuralConfig(
        vocab_size=tokenizer.vocab_size, d_model=16, n_layers=1,
        n_heads=2, n_kv_heads=1, max_seq_len=64,
    )
    model = FrierenNeuralModel(config)

    result = native_evaluation.evaluate_native_heldout(model, tokenizer, text)
    from frieren_neural.training import encode_dialogue_stream_with_loss_mask
    _, expected_mask = encode_dialogue_stream_with_loss_mask(text, tokenizer)

    assert result["split"] == "heldout"
    assert result["sample_count"] == sum(expected_mask[1:])
    assert result["loss"] >= 0
    assert result["perplexity"] >= 1
    assert len(result["dataset_sha256"]) == 64


def test_native_quality_evaluator_loads_v2_generates_all_24_prompts_and_stays_blocked(tmp_path, monkeypatch):
    heldout_dir = tmp_path / "heldout"
    text = _write_heldout(heldout_dir)
    checkpoint = tmp_path / "native-v2.pt"
    _write_checkpoint(checkpoint, text)
    output_dir = tmp_path / "report"
    monkeypatch.setattr(native_evaluation, "DECODING_SETTINGS", {
        "seed": 11, "temperature": 0.7, "top_k": 5, "max_new_tokens": 2,
    })

    report = native_evaluation.evaluate_native_checkpoint(
        checkpoint, [heldout_dir], output_dir
    )

    assert len(report["outputs"]) == 24
    assert report["heldout_metrics"]["sample_count"] > 0
    assert report["decision"] == "NOT READY"
    assert "human_review_missing" in report["blocking_reasons"]
    assert (output_dir / "human-scores.template.json").is_file()
    assert (output_dir / "quality-report.json").is_file()
