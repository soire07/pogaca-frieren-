import pytest
import torch

from frieren_neural import GPTConfig, GPTLanguageModel
from frieren_neural.tokenizer import BPETokenizer
from frieren_neural.training import (
    encode_dialogue_stream_with_loss_mask,
    generate_text,
    _sample_batch,
)


def test_dialogue_loss_mask_supervises_assistant_turn_and_eos_only():
    text = "Kullanıcı: Merhaba\nAsistan: Selam dünya\nKullanıcı: Nasılsın\nAsistan: İyiyim"
    tokenizer = BPETokenizer.train([text], vocab_size=280)
    token_ids, loss_mask = encode_dialogue_stream_with_loss_mask(text, tokenizer)

    assert len(token_ids) == len(loss_mask)
    assert token_ids[0] == tokenizer.bos_id
    assert sum(loss_mask) > 0
    supervised = tokenizer.decode([token for token, enabled in zip(token_ids, loss_mask) if enabled and token != tokenizer.eos_id])
    unsupervised = tokenizer.decode([token for token, enabled in zip(token_ids, loss_mask) if not enabled and token not in (tokenizer.bos_id, tokenizer.eos_id)])
    assert "Asistan: Selam dünya" in supervised
    assert "Asistan: İyiyim" in supervised
    assert sum(enabled and token == tokenizer.eos_id for token, enabled in zip(token_ids, loss_mask)) == 2
    assert "Kullanıcı: Merhaba" in unsupervised
    assert "Kullanıcı: Nasılsın" in unsupervised


def test_non_chat_corpus_keeps_legacy_full_token_supervision():
    tokenizer = BPETokenizer.train(["Frieren studies magic."], vocab_size=280)
    token_ids, loss_mask = encode_dialogue_stream_with_loss_mask("Frieren studies magic.", tokenizer)
    assert len(token_ids) == len(loss_mask)
    assert all(loss_mask)


def test_assistant_masked_batch_never_contains_an_empty_loss_window():
    data = torch.arange(40, dtype=torch.long)
    mask = torch.zeros(40, dtype=torch.bool)
    mask[18:25] = True
    generator = torch.Generator(device="cpu").manual_seed(9)

    inputs, targets = _sample_batch(
        data, target_mask=mask, batch_size=8, block_size=6,
        device=torch.device("cpu"), generator=generator,
    )

    assert inputs.shape == targets.shape == (8, 6)
    assert torch.all((targets != -100).any(dim=1))
    assert torch.all((targets[targets != -100] >= 0))


def test_masked_batch_rejects_corpus_without_assistant_targets():
    data = torch.arange(20, dtype=torch.long)
    with pytest.raises(ValueError, match="assistant targets"):
        _sample_batch(
            data, target_mask=torch.zeros_like(data, dtype=torch.bool),
            batch_size=2, block_size=4, device=torch.device("cpu"),
            generator=torch.Generator(device="cpu").manual_seed(1),
        )


def test_model_loss_ignores_user_targets_and_rejects_all_ignored_targets():
    model = GPTLanguageModel(GPTConfig(
        vocab_size=20, d_model=16, n_heads=2, n_layers=1,
        max_seq_len=8, dropout=0.0,
    ))
    inputs = torch.tensor([[1, 2, 3, 4]], dtype=torch.long)
    targets = torch.tensor([[-100, 5, -100, 7]], dtype=torch.long)
    _, loss = model(inputs, targets=targets)
    assert torch.isfinite(loss)

    with pytest.raises(ValueError, match="at least one supervised"):
        model(inputs, targets=torch.full_like(targets, -100))


def test_generation_stops_before_leaked_role_labels(monkeypatch):
    tokenizer = BPETokenizer.train(["cevap devam Kullanıcı Asistan"], vocab_size=280)
    model = GPTLanguageModel(GPTConfig(
        vocab_size=tokenizer.vocab_size, d_model=16, n_heads=2,
        n_layers=1, max_seq_len=32, dropout=0.0,
    ))
    prompt = "Kullanıcı: Merhaba\nAsistan:"
    prompt_ids = torch.tensor([tokenizer.encode(prompt)], dtype=torch.long)
    completion = tokenizer.encode("Merhaba, dünya!\nAsistan: başka cevap")
    generated = torch.tensor([prompt_ids[0].tolist() + completion], dtype=torch.long)
    monkeypatch.setattr(model, "generate", lambda *_args, **_kwargs: generated)

    assert generate_text(model, tokenizer, prompt, max_new_tokens=16).endswith("Merhaba, dünya!")



def test_resume_rejects_checkpoint_trained_with_full_stream_loss(tmp_path):
    from frieren_neural.training import TrainingConfig, train_model

    corpus = ["Kullanıcı: soru 1\nAsistan: cevap 1", "Kullanıcı: soru 2\nAsistan: cevap 2"]
    checkpoint = tmp_path / "old-objective.pt"
    config = TrainingConfig(
        max_steps=1, eval_interval=1, eval_batches=1, batch_size=1,
        block_size=8, validation_fraction=0.2, d_model=16, n_heads=2,
        n_layers=1, dropout=0.0, tokenizer_vocab_size=280,
    )
    train_model(corpus, checkpoint, config, device="cpu")
    saved = torch.load(checkpoint, map_location="cpu", weights_only=True)
    saved.pop("loss_objective_version")
    torch.save(saved, checkpoint)

    with pytest.raises(ValueError, match="loss objective"):
        train_model(corpus, checkpoint, config, resume=True, device="cpu")
