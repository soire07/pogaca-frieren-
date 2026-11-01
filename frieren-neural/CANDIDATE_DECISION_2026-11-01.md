# Frieren Neural — candidate decision record (2026-11-01)

## Decision

**NOT READY — no candidate is approved for production or a public staged test.**

The three existing candidates have now been benchmarked on the same 24-case Turkish prompt set. The preserved scratch checkpoint was additionally rerun with greedy decoding and a 160-token budget. The Qwen float32, Q8 GGUF, and Q4_K_M candidates were tested at 160 tokens.

No model has passed the human quality gate. No candidate is integrated into Poğaça Frieren, Frieren AI, a production database, Render, or the owner panel.

## Measured evidence

All measurements are from GitHub-hosted CPU runners with two threads. They are not measurements on a target free host.

| Candidate | Model load | 24-prompt generation | Median / p95 | Peak process RSS | Quality blockers |
|---|---:|---:|---:|---:|---|
| Scratch checkpoint, step 8,000 | 0.049 s | 0.777 s | 0.024 / 0.066 s | 329.37 MiB | Turkish output is incoherent; legacy loss objective v0 |
| Qwen3-0.6B float32 | 14.851 s | 289.548 s | 12.643 / 20.746 s | 5,000.75 MiB | 8/24 reach 160 tokens; repetition, weak Turkish, role leakage |
| Qwen3-0.6B GGUF Q8_0 | 0.266 s | 69.575 s | 3.272 / 4.163 s | 1,067.69 MiB | 11/24 reach 160 tokens; reasoning leakage in 3 cases; role leakage |\n| Qwen3-0.6B GGUF Q4_K_M | 0.484 s | 59.451 s | 2.557 / 3.675 s | 1,039.33 MiB | 11/24 reach 160 tokens; reasoning leakage in 4 cases; role leakage resolved on TR-018 |

### Scratch checkpoint

- Source workflow: [41342108074](https://github.com/soire07/pogaca-frieren-/actions/runs/41342108074)
- Artifact: `frieren-neural-scratch-greedy-cpu-benchmark` (ID `13097666970`)
- Checkpoint SHA-256: `1f29fa42d0a98722181b37d24903385774b49eb52cc439696113a9574da672b7`
- Step: 8,000
- Decoding: greedy argmax, 160-token budget, all 24 prompts
- The run completed without empty responses or token-cap hits, but generated Turkish is incoherent and often unrelated.
- Checkpoint metadata has `loss_objective_version=0` / `legacy_full_stream`; it predates assistant-only objective v2. It is not a valid resume candidate for the v2 trainer.

### Qwen3-0.6B float32

- Source workflow: [41341508314](https://github.com/soire07/pogaca-frieren-/actions/runs/41341508314)
- Artifact: `frieren-neural-qwen3-0.6b-cpu-benchmark` (ID `13098200801`)
- Model revision: `c1899de289a04d12100db370d81485cdf75e47ca`
- Runtime: PyTorch 2.15.0+cpu, Transformers 4.51.3, greedy decoding, 160 new tokens.
- 8/24 prompts reached the 160-token cap. TR-018 repeats role markers. TR-003, TR-011, TR-017, TR-021 and other cases show instruction-following or factual-quality failures.
- This memory footprint is far above what should be assumed safe for a low-memory free service.

### Qwen3-0.6B GGUF Q8_0

- Source workflow: [41341675128](https://github.com/soire07/pogaca-frieren-/actions/runs/41341675128)
- Artifact: `frieren-neural-qwen3-gguf-q8-cpu-benchmark` (ID `13097467441`)
- Official Qwen GGUF file SHA-256: `9465e63a22add5354d9bb4b99e90117043c7124007664907259bd16d043bb031`
- File size: 639,446,688 bytes
- Runtime: `llama-cpp-python==0.3.16`, CPU, two threads, 1,024-token context, greedy decoding, 160-token cap.
- The benchmark redacts non-empty reasoning blocks and strips empty `<think>` wrappers. It detected non-empty reasoning leakage in TR-021, TR-022, and TR-023; those outputs are redacted in the artifact rather than exposed.
- 11/24 responses reached the token cap; TR-018 still emits conversation role markers.
- 1,067.69 MiB peak RSS is materially lower than float32, but still does not prove compatibility with any specific free host.


### Qwen3-0.6B GGUF Q4_K_M

- Source workflow: [41342378762](https://github.com/soire07/pogaca-frieren-/actions/runs/41342378762)
- Artifact: `frieren-neural-qwen3-gguf-q4-cpu-benchmark` (ID `13097962437`)
- Upstream: [Unsloth Qwen3-0.6B-GGUF](https://huggingface.co/unsloth/Qwen3-0.6B-GGUF), pinned revision `060ae942940c11394cfb1a7313ddcb92c2c4db11`
- File SHA-256: `dd4750858c52f1c040e9ff4f54ba9365e11e8e81021abffd9b9c02646cf334d7`
- File size: 396,704,672 bytes
- Model load: 0.484 s; 24-prompt generation: 59.451 s
- Median / p95 latency: 1.732 / 2.447 s
- Peak process RSS: 1,039.33 MiB
- 11/24 answers reached the 160-token cap; reasoning leakage was detected and redacted in TR-008, TR-010, TR-021, and TR-022.
- TR-018 correctly states port 8081, but other answers remain repetitive, inaccurate, or unsafe (TR-011). Q4 reduces the file size but only reduces measured process RSS by about 28 MiB compared with Q8. It does not make this candidate fit a low-memory free host or fix the quality gate.

## Comparable review protocol

The scratch, float32, and Q8 runs use the same 24 prompt IDs, greedy decoding, two CPU threads, and 160-token budget. Prompt serialization and tokenizers differ by model, and the scratch checkpoint uses a legacy training objective; therefore this is a controlled *human response evaluation set*, not a claim of identical token-level conditions.

The benchmark artifacts each contain a blank two-reviewer score sheet. Two people must independently score all six dimensions (0–4) and mark safety/privacy failures and fabricated claims. No scores have been invented or auto-generated. The scratch checkpoint is a historical baseline only; its legacy objective prevents treating it as a valid v2 release baseline.

Release thresholds remain those in [QUALITY_GATE.md](QUALITY_GATE.md): no critical safety/privacy failure, at least 3.2/4 in each dimension, 3.4/4 overall, at least 90% instruction-adherence and Turkish-quality scores of 3 or 4, and no multi-turn consistency failure.

## Free-host decision

- Scratch: the measured memory footprint is lowest, but its answer quality is unusable. Do not deploy it.
- Qwen float32: approximately 4.9 GiB peak RSS; unsuitable for a low-memory free instance.
- Qwen Q8: approximately 1.04 GiB peak RSS and a 639 MB model file; not proven to fit a free host and still fails quality checks.
- Q4_K_M has now been measured; its smaller file does not materially reduce process RSS or solve output-quality failures. File size alone will not be accepted as a host-fit proof; runtime RSS and quality must both be measured.

No Render/Neon/Vercel/Discord production change was made. No paid API was used. No Vercel function was added. PR #171 remains a draft and is not merged.
