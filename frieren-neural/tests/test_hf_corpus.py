import json

import pytest

from frieren_neural.hf_corpus import (
    build_corpus,
    prepare_turkish_chat_max_25k,
    _render_visible_dialogue,
)
from frieren_neural.training import load_licensed_corpus


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

    manifest = json.loads((train_dir / "corpus_manifest.json").read_text(encoding="utf-8"))
    assert manifest["dataset"]["revision"] == "a" * 40
    assert manifest["dataset"]["filter"]["reasoning_field_included"] is False
    assert manifest["documents"][0]["license"] == "Apache-2.0"
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
