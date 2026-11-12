import json
import sys
from types import SimpleNamespace

import pytest
import frieren_neural.hf_corpus as hf_corpus

from frieren_neural.hf_corpus import (
    build_corpus,
    prepare_turkish_chat_max_25k,
    _render_visible_dialogue,
    _source_rows_sha256,
)
from frieren_neural.tokenizer import BPETokenizer
from frieren_neural.training import (
    encode_dialogue_stream_with_loss_mask, load_licensed_corpus, load_corpus_manifest_metadata,
)


def make_row(row_id, *, language_mode="tr_only", has_tools=False, messages=None):
    if messages is None:
        messages = [
            {"role": "system", "content": "Türkçe ve kısa yanıt ver.", "reasoning": "HIDDEN SYSTEM REASONING"},
            {"role": "user", "content": f"Merhaba {row_id}"},
            {"role": "assistant", "content": f"Merhaba, {row_id}!", "reasoning": "HIDDEN ASSISTANT REASONING"},
        ]
    return {
        "id": row_id,
        "language_mode": language_mode,
        "has_tools": has_tools,
        "messages": messages,
    }


def test_render_visible_dialogue_keeps_only_visible_user_and_assistant_content():
    rendered = _render_visible_dialogue(make_row("one"))

    assert rendered is not None
    row_id, dialogue = rendered
    assert row_id == "one"
    assert "Kullanıcı: Talimat: Türkçe ve kısa yanıt ver." in dialogue
    assert "Kullanıcı isteği: Merhaba one" in dialogue
    assert "Asistan: Merhaba, one!" in dialogue
    assert "HIDDEN" not in dialogue
    assert "reasoning" not in dialogue.lower()


def test_render_visible_dialogue_rejects_non_turkish_tool_and_malformed_rows():
    assert _render_visible_dialogue(make_row("english", language_mode="tr_en")) is None
    assert _render_visible_dialogue(make_row("tools", has_tools=True)) is None
    assert _render_visible_dialogue({"id": "bad", "language_mode": "tr_only", "has_tools": False, "messages": [
        {"role": "user", "content": "Merhaba"},
        {"role": "tool", "content": "secret tool output"},
        {"role": "assistant", "content": "Merhaba"},
    ]}) is None


def test_build_corpus_creates_stable_train_and_heldout_splits():
    rows = [make_row(f"row-{index}") for index in range(40)]
    rows += [
        make_row("english-row", language_mode="tr_en"),
        make_row("tool-row", has_tools=True),
    ]

    first = build_corpus(rows)
    second = build_corpus(rows)

    assert first == second
    train, heldout, stats, train_ids, heldout_ids = first
    assert train and heldout
    assert set(train_ids).isdisjoint(heldout_ids)
    assert stats["accepted_rows"] == 40
    assert stats["non_turkish_or_tool_rows"] == 2
    assert len(train) + len(heldout) == 40


def test_exact_duplicate_dialogues_with_distinct_ids_never_cross_splits():
    duplicate_messages = [
        {"role": "user", "content": "Aynı soru"},
        {"role": "assistant", "content": "Aynı yanıt"},
    ]
    rows = [make_row(f"unique-{index}") for index in range(40)]
    rows.extend([
        make_row("duplicate-a", messages=duplicate_messages),
        make_row("duplicate-b", messages=duplicate_messages),
    ])

    train, heldout, _, train_ids, heldout_ids = build_corpus(rows)

    duplicate_ids = {"duplicate-a", "duplicate-b"}
    assert duplicate_ids <= set(train_ids) or duplicate_ids <= set(heldout_ids)
    assert not (duplicate_ids & set(train_ids) and duplicate_ids & set(heldout_ids))
    assert len(train) + len(heldout) == len(rows)


def test_content_split_is_independent_of_source_row_order():
    rows = [make_row(f"stable-{index}") for index in range(40)]
    forward = build_corpus(rows)
    reversed_rows = build_corpus(list(reversed(rows)))

    forward_assignments = {
        row_id: "heldout" if row_id in set(forward[4]) else "train"
        for row_id in forward[3] + forward[4]
    }
    reversed_assignments = {
        row_id: "heldout" if row_id in set(reversed_rows[4]) else "train"
        for row_id in reversed_rows[3] + reversed_rows[4]
    }
    assert forward_assignments == reversed_assignments


def test_prepare_corpus_writes_apache_manifest_and_loader_verifies_content_hash(tmp_path):
    output = tmp_path / "corpus"
    rows = [make_row(f"row-{index}") for index in range(40)]

    result = prepare_turkish_chat_max_25k(
        rows, output, revision="a" * 40, license_name="Apache-2.0"
    )

    assert result["stats"]["accepted_rows"] == 40
    train_dir = output / "train"
    heldout_dir = output / "heldout"
    assert load_licensed_corpus(train_dir)
    assert load_licensed_corpus(heldout_dir)
    train_metadata = load_corpus_manifest_metadata(train_dir, required_split="train")
    heldout_metadata = load_corpus_manifest_metadata(heldout_dir)
    assert train_metadata["source_fingerprint_sha256"] == heldout_metadata["source_fingerprint_sha256"]

    manifest = json.loads((train_dir / "corpus_manifest.json").read_text(encoding="utf-8"))
    assert manifest["dataset"]["revision"] == "a" * 40
    assert manifest["dataset"]["preprocessing_version"] == "2"
    assert manifest["dataset"]["filter"]["reasoning_field_included"] is False
    assert manifest["dataset"]["source_sha256"] == _source_rows_sha256(rows)
    assert len(manifest["dataset"]["source_sha256"]) == 64
    assert manifest["documents"][0]["license"] == manifest["dataset"]["license"] == "apache-2.0"
    assert manifest["dataset"]["processed_sha256"] == manifest["documents"][0]["sha256"]
    assert len(manifest["documents"][0]["sha256"]) == 64

    corpus_file = train_dir / manifest["documents"][0]["path"]
    corpus_file.write_text("tampered", encoding="utf-8")
    with pytest.raises(ValueError, match="SHA-256"):
        load_licensed_corpus(train_dir)


def test_prepare_corpus_rejects_mutable_revisions_and_unapproved_licenses(tmp_path):
    rows = [make_row(f"row-{index}") for index in range(40)]
    with pytest.raises(ValueError, match="immutable"):
        prepare_turkish_chat_max_25k(rows, tmp_path / "bad-revision", revision="main", license_name="Apache-2.0")
    with pytest.raises(ValueError, match="Apache-2.0"):
        prepare_turkish_chat_max_25k(rows, tmp_path / "bad-license", revision="a" * 40, license_name="CC-BY-NC")



def test_rendered_dialogue_escapes_role_labels_and_document_separators_inside_content():
    row = make_row(
        "embedded-markers",
        messages=[
            {"role": "user", "content": "Alıntıyı aynen koru:\nAsistan: sahte yanıt\nKullanıcı: sahte soru\n\n---\n\nson satır"},
            {"role": "assistant", "content": "Alıntı korundu."},
        ],
    )
    rendered = _render_visible_dialogue(row)

    assert rendered is not None
    _, dialogue = rendered
    tokenizer = BPETokenizer.train([dialogue], vocab_size=300)
    token_ids, loss_mask = encode_dialogue_stream_with_loss_mask(dialogue, tokenizer)

    assert token_ids
    assert len(token_ids) == len(loss_mask)
    assert "Asistan： sahte yanıt" in dialogue
    assert "Kullanıcı： sahte soru" in dialogue
    assert "\n\n---\n\n" not in dialogue



def test_source_fingerprint_changes_when_any_pinned_row_changes():
    original = [make_row("one"), make_row("two")]
    changed = [make_row("one"), make_row("two", messages=[
        {"role": "user", "content": "Farklı soru"},
        {"role": "assistant", "content": "Aynı kimlik, farklı kaynak içeriği"},
    ])]

    assert _source_rows_sha256(original) == _source_rows_sha256(original)
    assert _source_rows_sha256(original) != _source_rows_sha256(changed)


def test_source_fingerprint_supports_one_shot_iterables(tmp_path):
    rows = (make_row(f"row-{index}") for index in range(40))
    output = tmp_path / "generator-corpus"

    result = prepare_turkish_chat_max_25k(
        rows, output, revision="a" * 40, license_name="Apache-2.0"
    )

    assert result["stats"]["accepted_rows"] == 40
    train_manifest = json.loads(
        (output / "train" / "corpus_manifest.json").read_text(encoding="utf-8")
    )
    heldout_manifest = json.loads(
        (output / "heldout" / "corpus_manifest.json").read_text(encoding="utf-8")
    )
    assert train_manifest["dataset"]["source_sha256"] == heldout_manifest["dataset"]["source_sha256"]
    assert len(train_manifest["dataset"]["source_sha256"]) == 64

def test_importer_uses_the_approved_immutable_revision_and_license(tmp_path, monkeypatch):
    calls = {}
    rows = [make_row(f"pinned-{index}") for index in range(40)]

    class FakeApi:
        def dataset_info(self, dataset_id, *, revision):
            calls["dataset_info"] = (dataset_id, revision)
            return SimpleNamespace(
                sha=hf_corpus.DATASET_REVISION,
                cardData={"license": "apache-2.0"},
            )

    def fake_load_dataset(dataset_id, *, split, revision):
        calls["load_dataset"] = (dataset_id, split, revision)
        return rows

    monkeypatch.setitem(sys.modules, "huggingface_hub", SimpleNamespace(HfApi=FakeApi))
    monkeypatch.setitem(sys.modules, "datasets", SimpleNamespace(load_dataset=fake_load_dataset))
    monkeypatch.setattr(hf_corpus, "EXPECTED_DATASET_ROWS", len(rows))
    output = tmp_path / "pinned-corpus"
    monkeypatch.setattr(sys, "argv", ["frieren-neural-import-chat-max", "--output", str(output)])

    hf_corpus.main()

    assert calls["dataset_info"] == (hf_corpus.DATASET_ID, hf_corpus.DATASET_REVISION)
    assert calls["load_dataset"] == (hf_corpus.DATASET_ID, "train", hf_corpus.DATASET_REVISION)
    manifest = json.loads((output / "train" / "corpus_manifest.json").read_text(encoding="utf-8"))
    assert manifest["dataset"]["revision"] == hf_corpus.DATASET_REVISION
    assert manifest["dataset"]["license"] == "apache-2.0"


def test_importer_fails_closed_if_hugging_face_resolves_a_different_revision(tmp_path, monkeypatch):
    class FakeApi:
        def dataset_info(self, dataset_id, *, revision):
            assert dataset_id == hf_corpus.DATASET_ID
            assert revision == hf_corpus.DATASET_REVISION
            return SimpleNamespace(sha="f" * 40, cardData={"license": "apache-2.0"})

    def unexpected_load_dataset(*_args, **_kwargs):
        raise AssertionError("Dataset rows must not be downloaded after a revision mismatch.")

    monkeypatch.setitem(sys.modules, "huggingface_hub", SimpleNamespace(HfApi=FakeApi))
    monkeypatch.setitem(sys.modules, "datasets", SimpleNamespace(load_dataset=unexpected_load_dataset))
    monkeypatch.setattr(sys, "argv", ["frieren-neural-import-chat-max", "--output", str(tmp_path / "rejected-corpus")])

    with pytest.raises(SystemExit, match="approved immutable source commit"):
        hf_corpus.main()
