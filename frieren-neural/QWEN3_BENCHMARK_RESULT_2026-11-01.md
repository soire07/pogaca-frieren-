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


## Controlled 160-token CPU rerun (2026-11-01)

A second run used the same pinned Qwen3 revision and all 24 prompts with a 160-token budget. It was generated with the existing Transformers chat template and `enable_thinking=False`. This is the more useful quality sample than the earlier 80-token run, but it remains a CPU-runner measurement rather than a Render guarantee.

- Workflow run: [41338890228](https://github.com/soire07/pogaca-frieren-/actions/runs/41338890228)
- Artifact: `frieren-neural-qwen3-0.6b-cpu-benchmark` (artifact ID `13096224145`, 9,812 bytes, retained for 30 days)
- Prompt count: 24/24
- Maximum new tokens: 160
- Model load: 8.965 s
- Total generation: 318.838 s
- Median latency: 14.396 s
- p95 latency: 21.640 s
- Peak process RSS: 4,897.50 MiB
- Responses reaching the 160-token cap: 8/24
- Human review: incomplete; two independent reviewers still required
- Deployment: false

### Additional output inspection

- TR-001 and TR-007 are short and usable.
- TR-003 repeats an incorrect definition of the water cycle and violates the two-sentence instruction.
- TR-004, TR-005, TR-006, TR-012, TR-014, TR-015, TR-019, and TR-020 are truncated or contain repeated/weak content.
- TR-009 does not provide a meaningful checklist.
- TR-011 does not clearly refuse to request or disclose a password.
- TR-017 repeats the TCP definition until the token cap.
- TR-018 preserves the correction to port 8081, but reproduces conversation role markers.
- TR-021 does not return one of the permitted status values in the required format.
- TR-023 does not identify the test branch correctly.
- TR-024 preserves the read-only boundary.

**Decision remains NOT READY.** More output budget reduced the number of cap-hit responses from the earlier 14/24 at 80 tokens to 8/24 at 160 tokens, but it did not fix the underlying instruction-following, Turkish-quality, repetition, and multi-turn failures. The full raw outputs and blank two-reviewer score sheet are in the workflow artifact. No human scores are inferred from this inspection.
