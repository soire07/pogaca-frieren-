"""Resource-conscious CPU training profile for the Turkish starter corpus."""

from __future__ import annotations

import argparse
import json

from .training import TrainingConfig, load_licensed_corpus, train_model


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Train a small Frieren Neural baseline with conservative CPU settings."
    )
    parser.add_argument("--data", required=True, help="Licensed corpus directory with corpus_manifest.json")
    parser.add_argument("--checkpoint", default="checkpoints/frieren-neural-small.pt")
    parser.add_argument("--steps", type=int, default=1_000)
    parser.add_argument("--batch-size", type=int, default=4)
    parser.add_argument("--block-size", type=int, default=64)
    parser.add_argument("--eval-interval", type=int, default=100)
    parser.add_argument("--eval-batches", type=int, default=3)
    parser.add_argument("--d-model", type=int, default=64)
    parser.add_argument("--n-heads", type=int, default=2)
    parser.add_argument("--n-layers", type=int, default=2)
    parser.add_argument("--tokenizer-vocab-size", type=int, default=384)
    parser.add_argument("--seed", type=int, default=1337)
    return parser


def main() -> None:
    args = build_parser().parse_args()
    config = TrainingConfig(
        max_steps=args.steps,
        eval_interval=args.eval_interval,
        eval_batches=args.eval_batches,
        batch_size=args.batch_size,
        block_size=args.block_size,
        d_model=args.d_model,
        n_heads=args.n_heads,
        n_layers=args.n_layers,
        tokenizer_vocab_size=args.tokenizer_vocab_size,
        seed=args.seed,
    )
    documents = load_licensed_corpus(args.data)
    metrics = train_model(documents, args.checkpoint, config, device="cpu")
    print(json.dumps(metrics, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
