"""Frieren Neural research package with lazy imports for the lightweight GGUF server."""

from importlib import import_module

_EXPORTS = {
    "BPETokenizer": ".tokenizer",
    "CharacterTokenizer": ".tokenizer",
    "GPTConfig": ".model",
    "GPTLanguageModel": ".model",
    "TrainingConfig": ".training",
    "evaluate_checkpoint": ".training",
    "generate_text": ".training",
    "load_checkpoint": ".training",
    "load_licensed_corpus": ".training",
    "load_text_corpus": ".training",
    "split_corpus_text": ".training",
    "train_model": ".training",
}

__all__ = list(_EXPORTS)


def __getattr__(name: str):
    module_name = _EXPORTS.get(name)
    if module_name is None:
        raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
    value = getattr(import_module(module_name, __name__), name)
    globals()[name] = value
    return value
