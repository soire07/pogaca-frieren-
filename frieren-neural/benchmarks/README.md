# Isolated pretrained-model benchmark

This directory contains CPU-only evaluation adapters. They do not import model weights
into the Frieren Neural trainer, change the custom checkpoint format, or touch any
production bot, database, Render service, Vercel deployment, or Vercel function.

## Qwen3-0.6B float32 candidate

- Model: [Qwen/Qwen3-0.6B](https://huggingface.co/Qwen/Qwen3-0.6B)
- Immutable revision: `c1899de289a04d12100db370d81485cdf75e47ca`
- Runtime: CPU, float32, two threads, greedy decoding, 160-token output cap.
- Prompts: fixed 24-case Turkish quality benchmark.

The completed run is recorded in `../QWEN3_BENCHMARK_RESULT_2026-11-01.md`.
It used about 4.9 GiB peak RSS on GitHub's CPU runner and is not a free-host fit proof.

## Qwen3-0.6B GGUF Q8_0 candidate

- Official model repository: [Qwen/Qwen3-0.6B-GGUF](https://huggingface.co/Qwen/Qwen3-0.6B-GGUF)
- File: `Qwen3-0.6B-Q8_0.gguf` (639,000,000 bytes)
- Expected SHA-256: `9465e63a22add5354d9bb4b99e90117043c7124007664907259bd16d043bb031`
- License declared upstream: Apache-2.0
- Runtime: `llama-cpp-python==0.3.16`, CPU, two threads, 1,024-token context,
  greedy decoding, 160-token output cap.
- The benchmark verifies exact byte count and SHA-256 before loading the model.
- It records download/load time, per-prompt latency, total generation time, peak RSS,
  all 24 raw outputs, and a two-reviewer blank scoring template.

Run on GitHub: **Actions → Frieren Neural — Qwen3 GGUF Q8 CPU Benchmark → Run workflow**.
The workflow is isolated, CPU-only, and stores evidence for 30 days. It is not part of
production CI and adds no application or Vercel functions.

## Qwen3-0.6B GGUF Q4_K_M candidate

- Upstream conversion: [unsloth/Qwen3-0.6B-GGUF](https://huggingface.co/unsloth/Qwen3-0.6B-GGUF)
- Pinned revision: `060ae942940c11394cfb1a7313ddcb92c2c4db11`
- File: `Qwen3-0.6B-Q4_K_M.gguf`, SHA-256:
  `dd4750858c52f1c040e9ff4f54ba9365e11e8e81021abffd9b9c02646cf334d7`
- Declared upstream license: Apache-2.0.
- Workflow: [41342378762](https://github.com/soire07/pogaca-frieren-/actions/runs/41342378762)
- Runtime: `llama-cpp-python==0.3.16`, CPU, two threads, 1,024-token context,
  greedy decoding, 160-token cap.
- Latest measured peak process RSS: 1,039.33 MiB. The smaller 396.7 MB model file
  did not materially reduce total process memory compared with Q8_0.

The benchmark writes `gguf-q4-quality-report.json` and a blank reviewer sheet.
It remains a separate experimental candidate, not an application dependency.

## Review protocol

Two reviewers must independently complete the generated `human-scores.template.json`
using the rubric in `../QUALITY_GATE.md`. Do not fabricate scores or let a model grade
its own output. A comparable, human-scored baseline and all release gates are required
before any staged test.

## Interpretation

Quantization can reduce model-weight memory, but actual process RSS includes runtime,
context/KV cache, and allocator overhead. The GGUF benchmark is required to measure those
costs; the 639 MB file size alone does not establish that a Render free instance can host it.
No benchmark artifact authorizes production deployment.
