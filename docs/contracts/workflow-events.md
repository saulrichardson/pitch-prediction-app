# Workflow Event Contracts

This app has no durable background workflow runtime in v1. Timeline actions are
synchronous API/domain/storage operations.

Use this file when the project introduces a real long-running or retryable
workflow, such as scheduled data ingestion, model batch evaluation, retention
cleanup, or deployment automation that needs durable state.

## Required Fields For Future Workflows

For each workflow event, record:

- workflow name
- event name
- payload type
- idempotency key
- retry behavior
- side effects triggered
- audit or telemetry event
- failure states

## Current Events

Current user-visible timeline actions are audit events, not durable workflow
events:

- `timeline.created`
- `timeline.revealed`
- `timeline.advanced`
- `branch.alternate_pitch`
- `branch.generated_pitch`

See `docs/contracts/telemetry-events.md`.

## Rules For Future Workflows

- workflows should record decisions before side effects
- external callbacks need idempotency keys
- retries must not produce duplicate side effects
- approval waiting states must be visible when approval is required
- cancellation behavior must be explicit
