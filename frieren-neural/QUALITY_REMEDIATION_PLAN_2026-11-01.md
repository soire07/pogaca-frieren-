# Frieren Neural — quality remediation plan (2026-11-01)

## Current release decision

**NOT READY. Do not deploy any current candidate.**

This is a model-quality and resource-fit failure, not a deployment/configuration problem. The production bot, database, Render services, and owner panel remain out of scope.

## Verified findings

1. The preserved scratch checkpoint is step 8,000 and uses `loss_objective_version=0` / `legacy_full_stream`. It predates the assistant-response-only objective v2 and is not a valid v2 resume checkpoint.
2. The scratch model is a small from-scratch decoder (the trainer defaults to 128 hidden dimensions, 4 attention heads, 4 layers and a 512-token BPE vocabulary). Its measured 329.37 MiB RSS is not evidence of useful language capability; the 24-case benchmark found incoherent Turkish.
3. The repository contains a corpus-manifest example and strict licensed-corpus loader, but no actual training corpus. The model therefore has no reproducible, checked-in evidence of a sufficiently large, licensed Turkish dialogue corpus.
4. Qwen3-0.6B float32 measured 5,000.75 MiB peak RSS and 289.548 s generation time. Q8 measured 1,067.69 MiB and 69.575 s. Q4_K_M measured 1,039.33 MiB and 59.451 s in workflow 41342378762. Neither quantized candidate is proven to fit the target free host; both also have output-quality blockers.
5. The Q4 decision record previously contained stale figures (39.966 s / 1,039.03 MiB) and stale wording that said the benchmark was still pending. Those values and statements have been corrected against the authoritative GitHub Actions job log. The measured Q4 values are 59.451 s / 1,039.33 MiB.
6. A 24-prompt benchmark is a useful regression gate, but it is not enough data to establish broad conversational competence. It must remain separate from training data and human reviewers must score outputs independently.

## Required remediation, in order

### Gate 1 — data before more training

- Build a versioned Turkish conversational corpus from original, human-reviewed examples and explicitly licensed public-domain / permissively licensed material.
- Each source must have source URL or origin, license, usage permission, content hash, and preprocessing record.
- Remove duplicates, near-duplicates, personal data, unsafe instructions, boilerplate, and malformed role sequences.
- Split by conversation/document before tokenizer training. Keep the 24 benchmark prompts and all future evaluation sets held out.
- Do not scrape copyrighted books, anime scripts, subtitles, private Discord messages, or user conversations without explicit rights and permission.
- Do not fabricate a corpus manifest or claim provenance for generated text.

### Gate 2 — correct training objective and tokenizer

- Train only from a clean v2 initialization; never resume the legacy v0 checkpoint.
- Keep assistant-only loss masking and EOS supervision. Add tests for user-message masking, assistant response masking, multi-turn boundaries, and truncation.
- Evaluate tokenizer coverage on Turkish diacritics, suffixes, punctuation, code, URLs, and Discord-style text. Increase vocabulary only if corpus statistics justify it; do not assume a larger vocabulary alone improves quality.
- Add deterministic train/validation/test split fingerprints and record corpus, tokenizer, config, and checkpoint hashes in every run.

### Gate 3 — controlled model experiments

- Establish a parameter/sequence-length/batch-size matrix that fits a strict memory budget with headroom; measure peak RSS including runtime and context, not just checkpoint size.
- Compare a clean scratch v2 baseline against one smaller quantized pretrained candidate using the same prompt semantics, output budget, and explicit chat template. Do not compare unlike templates as if token-level conditions were identical.
- Add output stopping rules: EOS-aware stopping, repetition diagnostics, role-marker suppression at the decoding boundary, and safe truncation reporting. These are decoding fixes, not substitutes for training quality.
- Track Turkish fluency, instruction adherence, factuality, multi-turn consistency, refusal quality, latency, and RSS separately.
- Require a larger held-out set and two independent human reviewers before any candidate can pass.

### Gate 4 — target-host proof and staged integration

- Measure the selected candidate on the actual free-tier host with cold start, warm requests, concurrent requests, and memory headroom. GitHub runner RSS is not target-host proof.
- If no candidate fits, keep the neural model out of production. Use a safe, deterministic retrieval/FAQ fallback for the bot rather than silently swapping in an unqualified model.
- Only after all gates pass, create a separate staged service. Do not connect to production bot traffic or production data until staged tests pass.

## Acceptance criteria

- No legacy v0 checkpoint used for v2 training.
- Reproducible, licensed corpus manifest and immutable hashes.
- No train/evaluation leakage.
- No role-marker or reasoning leakage in final user-visible responses.
- Two independent human reviews; no critical safety/privacy failures.
- Every quality dimension >= 3.2/4, overall >= 3.4/4, instruction adherence and Turkish quality >= 90% at score 3 or 4, and no multi-turn consistency failures.
- Measured target-host RSS stays below 70% of the service memory limit under expected load, with cold-start and latency budgets met.
- Production remains unchanged until explicit release approval.

## Immediate blocker

A real model-quality improvement cannot be honestly completed from benchmark summaries alone. The repository currently lacks the actual licensed training corpus required to train a better scratch model. The safe next action is corpus creation and validation, not another blind hyperparameter run or production deployment.
