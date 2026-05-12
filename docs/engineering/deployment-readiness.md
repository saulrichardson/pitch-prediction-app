# Deployment Readiness

Use this as a release gate for moving from local development to cloud users.
It is intentionally provider-neutral.

## Required Properties

Before deployment, the system should have:

- a reproducible local setup path
- explicit environment configuration
- no secrets committed to source
- database migrations that can run forward predictably
- rollback or mitigation notes for risky changes
- health checks or equivalent runtime probes
- structured logs and traces for critical paths
- audit records for state changes and side effects
- least-privilege credentials for services and tools
- a clear distinction between development, staging, and production
- tests covering critical invariants

## Configuration

Configuration should be explicit and environment-specific:

- database URLs
- service endpoints
- model/provider settings
- policy bundle paths
- workflow namespace or task queues
- telemetry exporters
- sandbox limits
- feature flags

Use examples and documentation for required variables, but never commit real
secrets.

## Database And Migrations

Migrations should preserve durable truth:

- constraints should be added intentionally
- backfills should be repeatable or idempotent
- destructive changes need a rollback or mitigation plan
- application code and schema changes should be deployable in a safe order
- production migrations should be observable

## Workflows

Durable workflows need deployment care:

- workflow definitions should be versioned safely
- activity timeouts should be explicit
- retries should be bounded and intentional
- idempotency keys should protect external effects
- stuck or waiting workflows should be discoverable
- manual intervention paths should be documented

## Policy

Policy should be deployed as a controlled artifact:

- default deny where practical
- test cases for allow and deny paths
- separation between user, service, workflow, and capability authority
- audit trail for high-risk decisions
- approval requirements for high-risk actions

## Observability

A deployed system should answer:

- is the service healthy?
- are workflows progressing?
- are model service calls failing, timing out, or drifting in schema compliance?
- are external API calls being denied or failing unexpectedly?
- are authorization failures expected or suspicious?
- are retries creating pressure or duplicate attempts?
- can a user-visible action be traced end to end?

## Release Notes

Every meaningful release should record:

- user-visible change
- schema or migration change
- policy change
- workflow change
- model service schema or model version change
- tool capability change
- operational risk
- verification performed

Keep release notes factual and short.
