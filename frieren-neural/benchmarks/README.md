# Isolated pretrained-model benchmark

This directory contains a CPU-only evaluation adapter. It does not import model weights
into the Frieren Neural trainer, change the custom checkpoint format, or touch any
production bot, database, Render service, Vercel deployment, or Vercel function.

## Candidate

- Model: [Qwen/Qwen3-0.6B](https://huggingface.co/Qwen/Qwen3-0.6B)
- Publisher: Qwen
- License: Apache-2.0 (verify the upstream license before redistribution)
- Immutable revision: `c1899de289a04d12100db370d81485cdf75e47ca`
- Runtime: CPU, float32, two threads, greedy decoding, maximum 80 new tokens.
- Prompts: the existing fixed 24-case Turkish quality benchmark; the prompt-set SHA-256 is stored in the report.

The official model card identifies the model as 0.6B parameters, multilingual (100+ languages
and dialects), and requires Transformers 4.51.0 or newer for Qwen3 architecture support.
This workflow pins Transformers 4.51.3 and the model revision to make the run reproducible.

## Run

On GitHub, open **Actions → Frieren Neural — Pretrained CPU Benchmark → Run workflow**.
The workflow runs on a public GitHub-hosted CPU runner and uploads JSON/Markdown evidence
for 30 days. It is manual-only; normal CI does not download the 1.5 GB model.

The full run always evaluates all 24 prompts. No partial run can be mistaken for a release
benchmark. The report includes model load time, per-prompt latency, peak process RSS,
runtime versions, raw outputs, and a human-review-required status.

## Interpretation

This is a candidate comparison, not an endorsement. Review Turkish quality, correctness,
privacy/safety, instruction adherence, and multi-turn behavior independently. Compare
the same prompts with the existing candidate under equivalent decoding limits. Do not
deploy based on perplexity, latency, or an automated model score alone.
