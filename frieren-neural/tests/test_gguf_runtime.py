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
