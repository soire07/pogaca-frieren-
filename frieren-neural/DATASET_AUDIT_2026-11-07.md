# Frieren Neural — pinned corpus quality audit (2026-11-07)

## Scope and provenance

This audit uses the exact archived training artifact from workflow run [42406544117](https://github.com/soire07/pogaca-frieren-/actions/runs/42406544117), dataset `cisimcik/turkish-chat-max-25k` pinned at revision `7cf29049fd24970df3a32fb19a49eedd937128b9`. It inspects the processed train and held-out text, not an inferred dataset profile.

- Train: 14,622 dialogues, 19,057 assistant turns.
- Held-out: 1,619 dialogues, 2,099 assistant turns.
- The importer rejected 8,302 of 24,543 rows as non-Turkish or tool-bearing; 16,241 were accepted.
- No duplicate row IDs were reported by the importer. This is distinct from repeated answer text.

## Confirmed data-quality findings

| Metric | Train | Held-out |
|---|---:|---:|
| Exact repeated assistant responses | 3,807 / 19,057 (20.0%) | 368 / 2,099 (17.5%) |
| Assistant responses shorter than 10 characters | 3,512 (18.4%) | 402 (19.2%) |
| Assistant responses shorter than 30 characters | 5,395 (28.3%) | 614 (29.3%) |
| Median assistant response length | 178 chars | 182 chars |
| 90th percentile response length | 685 chars | 703 chars |

Repeated labels include `A`, `B`, `C`, `D`, `Nötr`, `Çelişki`, and `Gerektirme`. This is evidence that the source combines conversational dialogue with short classification/quiz-style tasks. Those examples are not necessarily invalid, but their frequency must be controlled rather than mistaken for broad conversational coverage.

## Confirmed source-order distribution shift

The source corpus is not randomly ordered. In ten consecutive train-corpus deciles, the fraction of assistant turns shorter than 10 characters was:

| Decile in source order | Short-response fraction |
|---:|---:|
| 1 | 0.8% |
| 2 | 15.0% |
| 3 | 4.4% |
| 4 | 0.0% |
| 5 | 0.7% |
| 6 | 38.8% |
| 7 | 84.1% |
| 8 | 15.6% |
| 9 | 0.0% |
| 10 | 51.6% |

The prior `split_corpus_text` reserved the final 10% of the source-ordered dialogues for validation. The validation tail therefore sampled a markedly different task mix from much of the training portion. The old validation loss was not a reliable same-distribution indicator. This is a verified preprocessing defect, not a hypothesis.

## Tokenizer/context diagnostic

Using the exact 1,024-token checkpoint BPE merges on a deterministic sample of 120 dialogues per split:

| Split | Median tokens/dialogue | P90 | Maximum | Complete dialogues at or below 512 tokens |
|---|---:|---:|---:|---:|
| Train sample | 371.5 | 820 | 1,234 | 74.2% |
| Held-out sample | 362 | 744 | 1,645 | 73.3% |

The tokenizer round-tripped the inspected sample without changing its text. The 512-token context still cannot hold every complete conversation; training uses overlapping context windows, so this is a context limitation rather than evidence of tokenizer corruption.

## Corrective change

Commit `574f96408a9521309d39ae793f08391796c09f21` changes the dialogue-level train/validation split:

- Dialogue units are assigned by stable SHA-256 content ordering, independent of source row order.
- Exact duplicate dialogues are grouped and kept in the same partition, preventing exact-content leakage.
- The existing chronological character split remains only for unstructured text without dialogue boundaries.
- Regression tests cover order independence, complete-dialogue boundaries, and duplicate isolation.

The next training run must start from fresh initialization. The old checkpoint's training corpus fingerprint and validation split are incompatible with this corrected partition; resuming it would mix training histories from different data splits.

## Remaining quality gate

This correction fixes a demonstrated train/validation distribution bug. It does not by itself clean all short-answer/classification tasks or guarantee coherent Turkish generation. The new run must be evaluated with the same held-out source split, fixed 24-prompt benchmark, output inspection, and two independent human reviewers. Keep the candidate `NOT READY` until every release criterion passes.
