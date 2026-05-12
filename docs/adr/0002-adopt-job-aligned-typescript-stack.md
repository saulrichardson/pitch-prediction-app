# ADR: Adopt Job-Aligned TypeScript Stack

- status: accepted
- date: 2026-05-09
- owners: project maintainers

## Context

`Pitch Prediction App` should keep the high-integrity agentic engineering doctrine, but
the generated purity-oriented implementation stack does not match the current
project needs.

The project needs a practical stack aligned with mainstream Baseball Systems
work: React, TypeScript, Node.js APIs, SQL, an isolated Python model service,
cloud basics, testing, observability, and CI/CD.

The doctrine remains unchanged:

- explicit state
- typed boundaries
- clear domain models
- controlled side effects
- database truth
- observable behavior
- coding-agent discipline

## Decision

Use a job-aligned mainstream full-stack implementation profile:

- frontend web: Next.js App Router + React + TypeScript
- backend/API: Next.js API routes + Node.js + TypeScript
- model service: FastAPI/Python inference boundary, with HTTP locally and
  Lambda in the current AWS demo
- database: DynamoDB for deployed serverless storage; PostgreSQL support
  remains through Drizzle for legacy SQL durable mode
- data access: Drizzle ORM, migrations, and storage adapters
- cloud: AWS CloudFront, AWS Lambda, DynamoDB, Secrets Manager, ECR, and CDK
- background work: none in v1; add jobs or workflow runtime only when required
- authorization: signed anonymous workspace session boundary
- testing: Vitest, Playwright, API/domain tests, and integration checks
- observability: structured logs, cloud logs/metrics, traces where available,
  and audit events for important actions
- CI/CD: GitHub Actions or equivalent with lockfiles and repeatable builds

The previous purity-oriented stack remains useful as design inspiration, but it
is not the prescribed implementation stack for this job-aligned profile.
Preserve the principles, not the exact tools.

## Rationale

Next.js, React, and TypeScript give mainstream UI and API development while
preserving explicit UI state through typed props, discriminated unions, reducers,
and modeled loading, error, empty, unauthorized, and success states.

Node.js + TypeScript gives a practical web/API environment while preserving thin
route handlers, typed request and response models, separate domain modules,
application services, SQL repositories, and controlled side effects.

PostgreSQL remains the durable source of truth when durable mode is enabled.
FastAPI/Python is isolated to the model service so Python and PyTorch
dependencies do not enter the Next.js web container.

Durable workflow tools, dedicated policy engines, formal methods, and sandboxes
are optional. Add them only when a feature needs the boundary they protect.

## Boundary Mapping

| Principle | Job-aligned implementation |
| --- | --- |
| Explicit UI state | Next.js + React + TypeScript state unions, reducers, and clear props |
| Pure domain core | TypeScript domain modules with pure functions where possible |
| Typed API boundary | Next.js API route validation and TypeScript request/response models |
| Model boundary | FastAPI/Python runtime with product-oriented prediction request/response types |
| Durable truth | PostgreSQL constraints, migrations, keys, indexes, and clear ownership when durable mode is enabled |
| Durable workflow | None in v1; queues, jobs, schedulers, or workflow runtime only when needed |
| Explicit policy | Signed anonymous workspace session checks and server-side ownership checks |
| Stronger verification | Tests first; property, model-based, or formal methods only for critical invariants |
| Repeatable builds | Lockfiles, CI/CD, repeatable build steps, and artifact discipline |

## Consequences

Coding agents should default to the job-aligned TypeScript stack for production
implementation.

Project docs should no longer prescribe purity-oriented tools as the default
implementation stack.

When a feature introduces a major tool outside the selected mainstream stack, it
must record the boundary it owns, why the selected stack is insufficient, how it
is tested and deployed, and how it preserves the doctrine.

## Verification

- `AGENTS.md`, `README.md`, `docs/project-profile.md`, and
  `docs/architecture/stack-profile.md` describe the job-aligned stack.
- `docs/engineering/formal-methods.md` makes formal methods optional and
  risk-driven.
- `scripts/doctor.sh` verifies the expected documentation structure exists.
