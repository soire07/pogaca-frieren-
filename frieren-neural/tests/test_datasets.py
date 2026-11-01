import hashlib
import io
import json

import pytest

from frieren_neural import datasets


def _record():
    return {
        "conversation_id": "test-001",
        "split": "train",
        "language": "tr",
        "synthetic": True,
        "messages": [
            {"role": "user", "content": "Merhaba."},
            {"role": "assistant", "content": "Merhaba, nasıl yardımcı olabilirim?"},
            {"role": "user", "content": "Bir soru soracağım."},
            {"role": "assistant", "content": "Elbette, dinliyorum."},
        ],
    }


def _install_fake_download(monkeypatch, raw):
    monkeypatch.setattr(datasets, "DATASET_SHA256", hashlib.sha256(raw).hexdigest())
    monkeypatch.setattr(datasets, "EXPECTED_RECORDS", 1)
    monkeypatch.setattr(datasets.urllib.request, "urlopen", lambda request, timeout: io.BytesIO(raw))


def test_prepare_dataset_verifies_source_and_writes_manifest(tmp_path, monkeypatch):
    raw = (json.dumps(_record(), ensure_ascii=False) + "\n").encode("utf-8")
    _install_fake_download(monkeypatch, raw)
    output = tmp_path / "prepared"

    result = datasets.prepare_turkish_daily_dialogues(output)

    assert result["records"] == 1
    assert result["sha256"] == hashlib.sha256(raw).hexdigest()
    text = (output / "turkish-daily-dialogues-train.txt").read_text(encoding="utf-8")
    assert "Kullanıcı: Merhaba." in text
    assert "Asistan: Merhaba, nasıl yardımcı olabilirim?" in text
    manifest = json.loads((output / "corpus_manifest.json").read_text(encoding="utf-8"))
    assert manifest["documents"][0]["license"] == "CC BY 4.0"
    assert "Enes Deniz" in manifest["documents"][0]["source"]
    assert "SHA-256" in manifest["documents"][0]["usage"]


def test_prepare_dataset_refuses_to_overwrite_existing_files(tmp_path, monkeypatch):
    raw = (json.dumps(_record(), ensure_ascii=False) + "\n").encode("utf-8")
    _install_fake_download(monkeypatch, raw)
    output = tmp_path / "existing"
    output.mkdir()
    (output / "keep.txt").write_text("keep", encoding="utf-8")

    with pytest.raises(FileExistsError, match="never overwritten"):
        datasets.prepare_turkish_daily_dialogues(output)

    assert (output / "keep.txt").read_text(encoding="utf-8") == "keep"


def test_prepare_dataset_rejects_checksum_mismatch(tmp_path, monkeypatch):
    raw = (json.dumps(_record(), ensure_ascii=False) + "\n").encode("utf-8")
    _install_fake_download(monkeypatch, raw)
    monkeypatch.setattr(datasets, "DATASET_SHA256", "0" * 64)

    with pytest.raises(ValueError, match="SHA-256 mismatch"):
        datasets.prepare_turkish_daily_dialogues(tmp_path / "prepared")


@pytest.mark.parametrize(
    "change",
    [
        lambda row: row.update(split="test"),
        lambda row: row.update(language="en"),
        lambda row: row.update(synthetic=False),
        lambda row: row["messages"][1].update(role="user"),
        lambda row: row["messages"][0].update(content="  "),
    ],
)
def test_prepare_dataset_rejects_unexpected_records(tmp_path, monkeypatch, change):
    row = _record()
    change(row)
    raw = (json.dumps(row, ensure_ascii=False) + "\n").encode("utf-8")
    _install_fake_download(monkeypatch, raw)

    with pytest.raises(ValueError):
        datasets.prepare_turkish_daily_dialogues(tmp_path / "prepared")


def test_prepare_dataset_supports_a_separate_held_out_test_split(tmp_path, monkeypatch):
    row = _record()
    row["split"] = "test"
    raw = (json.dumps(row, ensure_ascii=False) + "\n").encode("utf-8")
    digest = hashlib.sha256(raw).hexdigest()
    monkeypatch.setattr(
        datasets,
        "DATASET_SPLITS",
        {"test": {"url": "https://example.invalid/test.jsonl", "sha256": digest, "records": 1}},
    )
    monkeypatch.setattr(
        datasets.urllib.request,
        "urlopen",
        lambda request, timeout: io.BytesIO(raw),
    )
    output = tmp_path / "test-corpus"

    result = datasets.prepare_turkish_daily_dialogues(output, split="test")

    assert result["split"] == "test"
    assert result["records"] == 1
    assert (output / "turkish-daily-dialogues-test.txt").is_file()
    manifest = json.loads((output / "corpus_manifest.json").read_text(encoding="utf-8"))
    assert manifest["documents"][0]["path"] == "turkish-daily-dialogues-test.txt"


def test_prepare_dataset_rejects_unknown_split(tmp_path):
    with pytest.raises(ValueError, match="split must be one of"):
        datasets.prepare_turkish_daily_dialogues(tmp_path / "unknown", split="dev")
