import torch

from frieren_neural import GPTConfig, GPTLanguageModel


def tiny_model() -> GPTLanguageModel:
    return GPTLanguageModel(
        GPTConfig(
            vocab_size=12,
            d_model=16,
            n_heads=2,
            n_layers=1,
            max_seq_len=16,
            dropout=0.0,
        )
    )


def test_generation_stops_immediately_when_all_sequences_emit_eos(monkeypatch):
    model = tiny_model().eval()

    def emit_eos(probabilities, num_samples):
        return torch.full(
            (probabilities.size(0), num_samples),
            3,
            dtype=torch.long,
            device=probabilities.device,
        )

    monkeypatch.setattr(torch, "multinomial", emit_eos)
    prompt = torch.tensor([[1, 2]], dtype=torch.long)

    result = model.generate(prompt, max_new_tokens=8, eos_token_id=3)

    assert result.tolist() == [[1, 2, 3]]


def test_generation_continues_until_limit_when_eos_is_not_emitted(monkeypatch):
    model = tiny_model().eval()

    def emit_regular_token(probabilities, num_samples):
        return torch.full(
            (probabilities.size(0), num_samples),
            4,
            dtype=torch.long,
            device=probabilities.device,
        )

    monkeypatch.setattr(torch, "multinomial", emit_regular_token)
    prompt = torch.tensor([[1, 2]], dtype=torch.long)

    result = model.generate(prompt, max_new_tokens=4, eos_token_id=3)

    assert result.tolist() == [[1, 2, 4, 4, 4, 4]]
