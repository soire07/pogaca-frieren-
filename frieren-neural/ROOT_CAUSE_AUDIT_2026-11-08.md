# Frieren Neural — 48K root-cause audit (2026-11-08)

## Decision

**NOT READY. Do not deploy, do not continue blind training, and do not alter the active model backend.**

This audit reads the actual archived 48K checkpoint, train/held-out corpus, and all 24 raw benchmark outputs from GitHub Actions artifact 13608530293 (run 42453599366). It does not infer output quality from loss alone.

## Exact candidate identity

- Training run: https://github.com/soire07/pogaca-frieren-/actions/runs/42453599366
- Source commit: `d6157a0033a82529e28355f11b0f54a4a8802506`
- Checkpoint SHA-256: `cc4a6e63a1fcf9aeed5abe9ebdbef6353391917c686624e96155412e1917041e`
- Training step: 48,000
- Model config: vocab 1,024; d_model 128; 4 heads; 4 layers; context 512; dropout 0.1
- Unique model parameters: 988,928 (the state-dict tensor sum double-counts the tied input/output embedding)
- Tokenizer: byte-level BPE, 1,024 vocabulary entries
- Training objective: assistant response tokens + assistant EOS only (objective v2)
- Train: 14,622 dialogues / 19,057 assistant turns
- Held-out: 1,619 dialogues / 2,099 assistant turns
- Train loss 3.6171578109; validation loss 3.6636347950
- Held-out loss 3.4855269480; perplexity 32.6396219618 over 1,619 dialogues
- Quality gate: NOT READY

## Directly observed output failures

The fixed 24-prompt evaluation uses the archived raw outputs. Failures include:

- TR-001 greeting: incoherent Turkish token sequence rather than a greeting.
- TR-003 water cycle: malformed words and no reliable two-sentence explanation.
- TR-010 arithmetic: incorrect and internally inconsistent calculations; expected answer is 204 TL.
- TR-013 Python: no valid list-empty check.
- TR-018 correction: fails to retain corrected port 8081.
- TR-024 database boundary: fails to preserve the read-only constraint.

The failures are not merely stylistic. They affect basic language generation, arithmetic, coding, instruction adherence, and conversation state.

## Evidence-backed contributing constraints

1. **Very low model capacity for the task.** The candidate has 988,928 unique parameters, 128 hidden dimensions, 4 layers, 4 heads, and a 1,024-token vocabulary. This is a tiny from-scratch language model, not a pretrained language model. The observed output failures are consistent with insufficient learned language capacity. This is a strong capacity limitation, not proof that one hyperparameter alone caused every failure.
2. **Limited and heterogeneous training material.** The exact corpus audit records 19,057 assistant turns, 20.0% exact repeated assistant responses, and 28.3% shorter than 30 characters. Repeated labels include A/B/C/D, Nötr, Çelişki, and Gerektirme, demonstrating a mixed dialogue/classification task distribution. Short answers can be valid; they must not be indiscriminately deleted.
3. **Context coverage is limited.** The pinned tokenizer audit sampled 120 dialogues per split: only 74.2% of train and 73.3% of held-out dialogues fit completely inside the 512-token context. The tokenizer round-trip was lossless in that sample; tokenizer corruption was not observed.
4. **No classic overfitting signal in the final sampled metrics.** Train loss 3.6172 and validation loss 3.6636 are close. This does not prove generalization or quality; it does mean the evidence does not support claiming that overfitting is the primary cause.
5. **Loss is not a conversational quality metric.** Held-out perplexity 32.64 coexists with catastrophic outputs. Additional optimizer steps alone are not an evidence-backed fix.

## Previously fixed issue — not the cause of this candidate

The source-order validation distribution bug was fixed in commit `574f96408a9521309d39ae793f08391796c09f21` at 21:20:39Z. The 24K training run used as the continuation parent was created at 21:27:13Z from descendant commit `858563082d95261f5cd552ea921f1499bdef1718`, whose ancestry includes the split fix. Therefore the 48K continuation did not use the known pre-fix 24K split. Do not misattribute the current generation failure to that already-corrected issue.

## What is and is not proven

Proven: the current checkpoint is unusable on the fixed benchmark; the model is extremely small; the tokenizer vocabulary is small; the corpus is mixed and contains substantial short/repeated-answer content; more training steps improved loss but did not produce coherent benchmark outputs.

Not proven: that increasing steps, changing only vocabulary size, deleting short responses, or changing only one architecture dimension will fix the model. No such claim should be made without a controlled experiment.

## Safe next experiment

Keep the same Frieren Neural project and do not swap in another model or paid API. Before another expensive training run:

1. Preserve this 48K checkpoint as a failed-quality baseline; never overwrite it.
2. Build a versioned, human-reviewed, license-verified conversational subset from the already pinned source. Keep classification/label-only tasks separately measurable rather than silently mixing them into conversational training. Do not remove examples solely because they are short or repeated.
3. Create a fixed train/validation/test manifest and verify no exact or near-duplicate dialogue crosses partitions.
4. Run a small, isolated pilot with the same model family and unchanged fixed 24-prompt benchmark. Record exact corpus/tokenizer/config/checkpoint hashes and output samples.
5. Compare output quality, not only loss. Stop if Turkish fluency, instruction following, math, code, or multi-turn behavior remains poor. Only then decide whether the current architecture can meet the target under free CPU constraints.

No production credentials, production database, Render, Vercel, live Discord, or paid API were used. No deployment or merge is authorized by this audit.
