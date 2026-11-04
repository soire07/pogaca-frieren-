# Frieren Neural self-evolution and Neural Guardian contract

## Goal

Frieren Neural is the primary intelligence, learning, planning and repair system. Frieren Guard (the existing Neural Guardian control plane) is initially its independent supervisor. The long-term goal is to let Neural diagnose and prepare its own repairs while Guard transitions toward independent security, quality, recovery and ecosystem oversight.

This is an extension of the existing Neural and Guardian work, not a replacement.

## Responsibilities

### Frieren Neural

- Observe its own model, API, memory, training and evaluation outcomes.
- Detect recurring failure patterns and identify likely root causes.
- Convert quality gaps into bounded, traceable improvement tasks.
- Prepare code/model/data changes in isolated branches and disposable test resources.
- Run regression, integration, held-out and resource checks.
- Compare candidate versions against a pinned baseline.
- Preserve experiment provenance, artifacts and evaluation evidence.

### Frieren Guard

- Independently verify incident evidence, source commit, artifact identity and CI.
- Review proposed repairs and their affected-file scope.
- Enforce permissions, protected paths, rate limits and resource limits.
- Reject unverified, unsafe, regressive or incomplete changes.
- Keep audit history and support rollback/recovery.
- Gradually shift from repair operator to independent security and quality authority only after Neural passes the autonomy qualification suite repeatedly.

## Evolution cycle

1. Observe: collect bounded, redacted runtime and test evidence.
2. Diagnose: classify the failure and identify a reproducible cause.
3. Plan: create deterministic, deduplicated improvement tasks.
4. Experiment: work only in an isolated branch and isolated test resources.
5. Verify: run focused tests, full CI, held-out quality, safety and resource checks.
6. Compare: require improvement over a pinned, comparable baseline.
7. Submit: send the candidate and its provenance to Guard for independent review.
8. Promote: only an explicitly approved, reversible release can reach a staged service.
9. Learn: store the result, including failed attempts, in the experiment ledger.

## Release gates

A candidate is not eligible for Guard review unless all of the following are true:

- CI reports success with zero failed and zero skipped tests.
- The model quality report is READY FOR STAGED TEST.
- Two-reviewer human scoring is complete.
- No critical safety/privacy failure or fabricated-claim flag is present.
- The comparable baseline is available and the candidate is measured as improved.
- Source commit SHA and model artifact SHA-256 are valid and recorded.

Passing these gates means eligible for Guard review, not approved, deployed, or self-promoted. The planner always emits apply_changes: false.

## Autonomy levels

- L0 Observe: report health and evidence only.
- L1 Diagnose: identify root causes and recurring patterns.
- L2 Plan: create improvement tasks and test plans.
- L3 Experiment: prepare isolated code/data/model candidates.
- L4 Verify: run tests and compare candidates.
- L5 Guard-reviewed repair: submit a verified candidate for independent Guard review.
- L6 Limited self-maintenance: only explicitly allowlisted, reversible, low-risk maintenance may be automated after a separate qualification period.
- L7 Continuous evolution: ongoing autonomous experiments under independent Guard oversight, with rollback and immutable audit evidence.

No autonomy level grants permission to expose secrets, modify production data, change access controls, merge protected branches, deploy, spend money, or self-modify the release policy.

## Guard independence qualification

Guard must not be disabled merely because Neural can repair some classes of failure. Any future reduction in Guard's repair duties requires repeated evidence across distinct incident classes, successful rollback drills, no critical safety regressions, and an independent review. Guard remains available as a recovery authority even if Neural reaches L7.

## Current implementation slice

frieren_neural.evolution.build_evolution_plan implements the deterministic evidence gate and bounded task planner. The frieren-neural-plan-evolution command accepts an evidence envelope containing ci, quality_report, source_commit_sha and artifact_sha256.

The current slice is deliberately proposal-only. It does not yet perform code edits, train models, persist memory, call Guard, merge pull requests, or deploy. Those integrations must be implemented against the existing Guardian OIDC and incident contracts, with contract tests on both sides before enabling dispatch.
