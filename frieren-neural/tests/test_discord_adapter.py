import pytest

from frieren_neural.discord_adapter import split_message


def test_split_message_respects_limit_and_preserves_all_characters():
    text = ("Frieren studies magic.\n" * 200) + ("x" * 2100)
    chunks = split_message(text, limit=1900)
    assert chunks
    assert all(0 < len(chunk) <= 1900 for chunk in chunks)
    assert "".join(chunks) == text


def test_split_message_handles_long_words_without_data_loss():
    text = "x" * 5000
    chunks = split_message(text, limit=1900)
    assert [len(chunk) for chunk in chunks] == [1900, 1900, 1200]
    assert "".join(chunks) == text


def test_split_message_rejects_invalid_limit():
    with pytest.raises(ValueError, match="limit"):
        split_message("hello", limit=0)
