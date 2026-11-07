"""Microbenchmark for the cached, vectorized assistant-only batch sampler."""
from __future__ import annotations

import argparse
import json
import os
import statistics
import time

import torch

from frieren_neural.training import _sample_batch, _valid_batch_starts


def _reference_sample(data, mask, starts, *, batch_size, block_size, generator):
    choices = torch.randint(starts.numel(), (batch_size,), generator=generator)
    selected = starts[choices]
    inputs = torch.stack([data[int(start):int(start) + block_size] for start in selected])
    targets = torch.stack([data[int(start) + 1:int(start) + block_size + 1] for start in selected])
    target_mask = torch.stack([mask[int(start) + 1:int(start) + block_size + 1] for start in selected])
    return inputs, targets.masked_fill(~target_mask, -100)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--iterations", type=int, default=250)
    args = parser.parse_args()
    if args.iterations < 10:
        parser.error("--iterations must be at least 10")

    torch.set_num_threads(max(1, min(4, os.cpu_count() or 1)))
    data = torch.arange(250_000, dtype=torch.long)
    mask = torch.zeros_like(data, dtype=torch.bool)
    for start in range(64, len(data), 256):
        mask[start:start + 96] = True
    starts = _valid_batch_starts(mask, 128)

    def reference():
        return _reference_sample(
            data, mask, starts, batch_size=4, block_size=128,
            generator=torch.Generator().manual_seed(20261107),
        )

    def optimized():
        return _sample_batch(
            data, batch_size=4, block_size=128, device=torch.device("cpu"),
            generator=torch.Generator().manual_seed(20261107),
            target_mask=mask, valid_starts=starts,
        )

    expected = reference()
    actual = optimized()
    assert torch.equal(expected[0], actual[0])
    assert torch.equal(expected[1], actual[1])

    def measure(fn):
        samples = []
        for _ in range(3):
            started = time.perf_counter()
            for _ in range(args.iterations):
                fn()
            samples.append((time.perf_counter() - started) / args.iterations)
        return statistics.median(samples)

    reference_seconds = measure(reference)
    optimized_seconds = measure(optimized)
    print(json.dumps({
        "iterations_per_method": args.iterations,
        "reference_seconds_per_batch": reference_seconds,
        "optimized_seconds_per_batch": optimized_seconds,
        "speedup": reference_seconds / optimized_seconds if optimized_seconds else None,
        "outputs_identical": True,
        "thread_count": torch.get_num_threads(),
    }, indent=2))


if __name__ == "__main__":
    main()
