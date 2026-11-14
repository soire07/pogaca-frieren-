# Frieren Guard external readiness monitor

This workflow is an external sender implemented with GitHub Actions. It performs a real HTTP GET against the Poğaça `/ready` endpoint once per hour. It does not create test incidents: it sends a signed Guardian event only when the actual readiness response is unhealthy or the network probe fails.

## Required secret

Add the same dedicated random secret to GitHub repository Actions secrets and the Poğaça Render service as `FRIEREN_GUARD_EVENT_SECRET`. Use at least 32 random characters. Never commit it, place it in repository variables, or reuse a public test value.

The receiver supports a legacy bridge-secret fallback, but this sender intentionally requires the dedicated secret so the external integration has an independently managed credential.

## Behavior and limits

- Healthy `GET /ready` response (`HTTP 200` and JSON `status: "ok"`): no event is sent.
- Non-200, unhealthy JSON, invalid JSON, timeout, or network failure: sends a real observation with source `frieren_guard`.
- Event IDs are stable per UTC day, so repeated workflow runs on the same day are idempotent at the receiver.
- The workflow runs hourly to avoid continuously waking the free Render service.
- The monitor reads readiness only; it does not access Discord user data, database rows, or production secrets.
- A signed event is evidence that the monitor observed an unhealthy endpoint, not proof of the underlying cause.

## Activation

The workflow is enabled after merge to `main`. Until the dedicated secret exists in both GitHub Actions and Render, delivery cannot authenticate and the workflow will fail closed rather than sending unsigned events.