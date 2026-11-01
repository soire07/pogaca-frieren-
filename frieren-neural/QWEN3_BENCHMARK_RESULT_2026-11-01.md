# Qwen3-0.6B benchmark result — 2026-11-01

## Decision

**NOT READY — do not replace Frieren Neural and do not deploy.**

The pinned candidate completed all 24 benchmark prompts on a GitHub-hosted CPU runner and produced a reproducible evidence artifact. The run proves the adapter works; it does not establish acceptable answer quality.

## Provenance

- Workflow run: [41336429934](https://github.com/soire07/pogaca-frieren-/actions/runs/41336429934)
- Artifact: `frieren-neural-qwen3-0.6b-cpu-benchmark` (artifact ID `13094749204`, 7,673 bytes, retained for 30 days)
- Model: `Qwen/Qwen3-0.6B`
- Immutable revision: `c1899de289a04d12100db370d81485cdf75e47ca`
- Declared license: Apache-2.0
- Prompt set: `tr-conversation-v1`, 24 cases
- Prompt SHA-256: `dd719ea86036fabf381b8d2b58bf59ccadb1b9d8e0d80f313cae681bdab3bc6a`
- Runtime: Python 3.11.17, PyTorch 2.15.0+cpu, Transformers 4.51.3
- Execution: CPU, float32, 2 threads, greedy decoding, 80-token output cap

## Measured runtime

| Metric | Result |
|---|---:|
| Model load | 9.826 s |
| 24-prompt generation total | 195.952 s |
| Median response latency | 10.332 s |
| p95 response latency | 10.513 s |
| Peak process RSS | 4,913.87 MiB |
| Responses at the 80-token cap | 14 / 24 |
| Empty responses | 0 / 24 |
| Explicit role-label leakage in output | TR-018 |

These measurements are specific to the GitHub-hosted CPU runner and this runtime configuration; they are not a Render/free-host guarantee.

## Quality observations (automated inspection, not human scoring)

- TR-001 greeting is short and natural.
- TR-007 Turkish rewrite is usable and preserves the intended meaning.
- TR-008 summary broadly preserves the incident sequence, though phrasing is awkward.
- TR-010 discount calculation begins correctly (36 TL discount) but the response is cut off before the final price.
- TR-011 refusal output repeats the request framing and does not give a clear, useful safe response.
- TR-017 multi-turn TCP answer repeats itself and does not respect the short-answer instruction.
- TR-018 emits literal `Kullanıcı:` and `Asistan:` role labels in the answer.
- TR-021 fails to provide one of the required status values with a reason.
- Several longer answers end at the generation cap; truncation prevents a fair assessment of completeness.

This is a deterministic output inspection. No reviewer scores or automatic model-generated quality scores were fabricated. The full raw responses and per-case timings are in the workflow artifact.

## Comparison limitations

The prior scratch-trained checkpoint is a historical pre-objective-v2 checkpoint. Its old output report used a different decoding configuration and a different prompt serialization path. Therefore, do not claim a controlled apples-to-apples quality win from these two historical reports. The same 24 case IDs are present, but a valid final comparison must standardize prompt rendering, decoding policy, token budget, and human review.

## Next steps

1. Preserve this artifact and the old scratch checkpoint unchanged.
2. Prepare a blinded two-reviewer score sheet for both candidates using the same prompt set and scoring rubric.
3. Run a controlled rerun with a larger output budget and a clearly bounded latency/memory budget; compare the full raw responses, not just loss/perplexity.
4. Decide whether quantization is needed for a free host only after measuring its actual memory, latency, and answer quality. Do not infer deployability from the 4.9 GiB CPU-runner peak.
5. Keep production deployment blocked until both reviewers complete the rubric and safety/privacy checks pass.

## Scope and safety

- No production bot, database, Render service, or Vercel deployment was changed.
- No Vercel functions were added.
- No paid API was used.
- The benchmark workflow is separate from normal CI and only runs on manual dispatch or its explicitly scoped benchmark-path change.
- The result is evidence for candidate evaluation only, not a deployment approval.
