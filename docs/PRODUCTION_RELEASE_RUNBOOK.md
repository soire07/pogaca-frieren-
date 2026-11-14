# Production release and database migration runbook

This runbook is a release gate for Poğaça Frieren. It does not authorize a production migration, merge, deployment, or Discord command registration by itself.

## Current release boundaries

- PR #217 was merged into `main` on 2026-11-05; it is not an outstanding release gate. Evaluate every release against the exact current PR HEAD and its own CI evidence.
- Production PostgreSQL and live player rows must not be used for rehearsal.
- Discord command registration remains a separate, explicit operation. Both production registration workflows are manual-only; no schedule may write to Discord.
- The registration script performs read-before-write and skips unchanged definitions to preserve Discord's daily command-create quota.
- Vercel Preview readiness is not proof that the production domain serves the PR code.
- Keep the feature inventory's `auditComplete=false`; do not promote runtime-unverified entries to complete.

## Verified baseline — 2026-11-14

- Current `main` release commit: `97b4595f96f5a69757805b26f3ef29b6edeaae28`.
- Housing/editor delivery (#387) is merged. Vercel production deployment `dpl_EyKgDqSV4gChJxkddj7PymZSufA8` is READY and owns `frierenbot.vercel.app`; its code commit is `862ae867f017d23f3512b52f91eb7cd0b4daaa5a`.
- Render Poğaça service is live on `97b4595f96f5a69757805b26f3ef29b6edeaae28`. Startup logs show 87 commands loaded, PostgreSQL connected, bot online, and no application error logs in the post-deploy window. This is not proof that every command has been exercised through live Discord.
- Frieren Guard's external readiness sender (#388) is merged, but emits no events until the same dedicated `FRIEREN_GUARD_EVENT_SECRET` is configured in GitHub Actions secrets and the Poğaça Render service.
- Feature inventory: 2,029 records, 354 evidence-linked implemented records, 1,675 planned records; 325 normalized roadmap capability groups, including 225 groups with repeated action variants. `auditComplete=false` remains intentional.
- Frieren Neural's automated quality-gate PR #341 remains draft. Its CI passed 238 tests, but the active GGUF candidate remains NOT READY until two independent human reviews, valid training provenance, and held-out metrics are supplied.
- Automated browser tests still do not complete a real Discord OAuth consent/session. Authenticated owner OAuth and live Discord command E2E remain separate verification gates.

## Database rehearsal

1. Use a disposable PostgreSQL instance/schema only. The CI migration rehearsal is restricted to the local `frieren_audit` database and creates a uniquely named temporary schema.
2. Verify migration ordering, checksums, idempotence, transaction rollback, and preservation of pre-existing rows in that isolated schema.
3. For any future production schema change, first rehearse the exact immutable SQL against a disposable copy/branch of the production schema and representative data. Never point the rehearsal at `pogaca-frieren-db` production.
4. Capture the pre-release schema version and migration checksums. Confirm the application version being deployed is compatible with both the pre-migration and post-migration schema.
5. Do not ship destructive DDL, table rewrites, or data deletion in the same release as an application deploy unless a tested restore path exists and has been explicitly approved.

## Rollback strategy

- The migration runner supports atomic forward migrations and checksum verification; it does not implement automatic down migrations.
- Prefer backward-compatible expand/contract migrations. If an application deploy fails, roll the application back to the last known-good Render deploy while keeping additive schema changes in place.
- Do not attempt an improvised SQL reversal. If a schema change is destructive or data-affecting, stop writes and use only a previously tested database restore procedure; verify that the current Neon project/plan exposes the required restore point before relying on it.
- If restore capability or the data-loss window is uncertain, the release is blocked. A successful application rollback is not a database rollback.

## Final release sequence

1. All required CI, PostgreSQL integration, command contract, and local mobile/desktop browser smoke checks pass on one exact HEAD.
2. Review the migration diff, schema impact, export/delete scope, and command target distribution.
3. Obtain explicit approval for merge and production deployment.
4. Merge once; verify Render and Vercel separately. Do not infer one platform's success from the other's status.
5. Verify bot readiness and panel OAuth on the deployed version without writing test data to real player accounts.
6. Register Discord commands only through the separately approved workflow and only for the intended test/production guild targets.
7. Record commit SHA, deployment IDs, migration version, command registration result, and rollback reference.

## OAuth and browser evidence

The automated browser smoke uses an isolated local site server. It verifies Android Chrome, iOS WebKit, desktop Chromium layouts, CSRF rejection, OAuth redirect parameters/state, and invalid callback-state rejection. It does not complete a real Discord consent screen or prove an authenticated owner session. Those require an authorized interactive browser session and must remain a separate release gate.
