from frieren_neural.gguf_runtime import generate_completion


class FakeChatModel:
    def __init__(self):
        self.request = None

    def create_chat_completion(self, **kwargs):
        self.request = kwargs
        return {"choices": [{"message": {"content": "Merhaba, nasıl yardımcı olabilirim?"}}]}


def test_persona_prompt_uses_real_line_breaks_before_user_message():
    model = FakeChatModel()

    answer = generate_completion(model, "Merhaba")

    user_content = model.request["messages"][0]["content"]
    assert "Kullanıcının isteğini yerine getir:\n\nMerhaba" in user_content
    assert answer == "Merhaba, nasıl yardımcı olabilirim?"


def test_generation_uses_a_reproducible_seed():
    model = FakeChatModel()
    generate_completion(model, "Merhaba", seed=1234)
    assert model.request["seed"] == 1234

def test_model_runtime_bounds_context_and_threads_for_small_instances(monkeypatch, tmp_path):
    import sys
    import types

    import frieren_neural.gguf_runtime as runtime

    captured = {}

    class FakeLlama:
        def __init__(self, **kwargs):
            captured.update(kwargs)

    monkeypatch.setitem(sys.modules, "llama_cpp", types.SimpleNamespace(Llama=FakeLlama))
    monkeypatch.setattr(runtime, "ensure_model_file", lambda _path=None: tmp_path / "model.gguf")
    monkeypatch.setenv("FRIEREN_MODEL_THREADS", "4")
    monkeypatch.setenv("FRIEREN_CONTEXT_SIZE", "4096")
    runtime.load_model.cache_clear()
    try:
        runtime.load_model()
    finally:
        runtime.load_model.cache_clear()

    assert captured["n_threads"] == 2
    assert captured["n_ctx"] == 2048
    assert captured["n_batch"] == 64
