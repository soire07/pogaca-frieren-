# Frieren Neural — Candidate audit decision (2026-11-01)

## Decision

**NOT READY — preserve the checkpoint; do not deploy or resume it.**

This audit inspects the archived 8,000-step CPU candidate from GitHub Actions run
[41330601987](https://github.com/soire07/pogaca-frieren-/actions/runs/41330601987).
The archived artifact is
[13092899417](https://github.com/soire07/pogaca-frieren-/actions/runs/41330601987#artifacts).

## Verified checkpoint identity

- Checkpoint SHA-256: `1f29fa42d0a98722181b37d24903385774b49eb52cc439696113a9574da672b7`
- Training step: 8,000
- Model: 128 dimensions, 4 layers, 4 attention heads, 1,024-token vocabulary, 128-token context
- Training corpus: pinned Turkish Daily Dialogues training split (3,950 conversations)
- Archived training loss: 0.4937348
- Archived validation loss: 3.7130183
- Archived held-out loss/perplexity: 1.0189979 / 2.7704172

The checkpoint metadata contains `dialogue_encoding_version=2` but **does not contain
`loss_objective_version`**. It therefore predates the assistant-only objective v2
training change. The archived held-out metrics also contain no objective-version
metadata. Those held-out numbers must not be compared with or presented as evidence
for the assistant-only objective v2 pipeline.

## Output audit

The archived quality report has 24 outputs and matches the checkpoint SHA-256 above.
Human review is incomplete. A direct deterministic scan of the saved outputs found
role-label leakage (`Asistan:` or `Kullanıcı:`) in **12 of 24** cases:

TR-003, TR-004, TR-007, TR-008, TR-013, TR-014, TR-017, TR-018, TR-020, TR-021,
TR-022, TR-024.

The saved responses also show incoherent Turkish, incomplete answers, and failures
on math, coding, privacy, and instruction-following examples. This is consistent
with the earlier qualitative assessment; it is not a human score and must not be
converted into a fabricated reviewer score.

## Required next steps

1. Keep this checkpoint immutable as a historical baseline. Do not resume it:
   the current trainer correctly rejects checkpoints without objective version 2.
2. Do not repeat an 8,000-step run on the same 3,950 synthetic conversations as a
   supposed quality fix. The observed outputs show that objective masking alone
   cannot supply missing language knowledge or model capacity.
3. Keep the 24-prompt benchmark fixed. For each new candidate, record checkpoint
   SHA-256, complete objective/config metadata, held-out evaluation under the same
   objective, all 24 raw outputs, and two independent human reviews.
4. Evaluate any pretrained multilingual candidate in an isolated, reproducible
   benchmark before changing the inference backend. Verify the exact model revision,
   license, download size, memory footprint, CPU latency, and free-hosting feasibility.
5. Do not add paid APIs, production credentials, production database access, or
   Vercel functions for this experiment. No production deployment is authorized by
   this audit.

## Current release status

- Historical 8,000-step candidate: **NOT READY**
- Assistant-only objective v2 code: covered by the separate 96/96 passing CI run
- Fresh assistant-only objective v2 checkpoint: **not trained**
- Pretrained-model comparison: **not run**
- Human review: **not completed**
- Production deployment: **not performed**
