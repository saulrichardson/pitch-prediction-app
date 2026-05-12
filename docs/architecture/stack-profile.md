# Stack Profile

This is the stack profile for `Pitch Prediction App`. It keeps the reusable
high-integrity engineering doctrine, but changes the prescribed implementation
stack to a job-aligned mainstream full-stack profile.

The stack exists to support one boundary:

```text
Autonomous agents may propose code, plans, and actions.
The system may accept them only through explicit boundaries:
typed inputs, domain rules, policy checks, review gates, state transitions,
tests, durable persistence, controlled side effects, and observable execution.
```

## Job-Aligned Full-Stack Profile

This profile uses the languages and tools most relevant to the target role while
preserving the doctrine's engineering boundaries.

| Concern | Project choice | Boundary preserved |
| --- | --- | --- |
| Frontend web | Next.js App Router + React + TypeScript | Explicit UI state, typed component props, controlled effects, modeled loading/error/empty states |
| Backend/API | Next.js API routes + Node.js + TypeScript | Thin HTTP adapters, typed request/response models, application services, domain modules |
| Model service | FastAPI/Python runtime exposed through HTTP locally and Lambda in AWS | Isolated model runtime, product-oriented request/response boundary |
| Durable database | DynamoDB for the deployed serverless demo; PostgreSQL support through Drizzle for legacy SQL durable mode | Durable state with explicit ownership; SQL constraints and migrations when PostgreSQL mode is enabled |
| Data access | Explicit memory, DynamoDB, and PostgreSQL storage adapters | Typed persistence boundaries and reviewable schema changes |
| Background work | None in v1; add jobs or workflow runtime only when required | Explicit ownership of retries, idempotency, failure states, and observability when this boundary exists |
| Authorization | Signed anonymous workspace session boundary | Server-side ownership checks, not only UI visibility |
| Tool sandbox | None in v1 | Add only when executing third-party or generated code requires a new boundary |
| Testing | Vitest, Playwright, API/domain tests, and integration checks | Verification scaled by risk across UI, API, domain, persistence, model service, and side effects |
| Build and release | npm workspaces, lockfile, Lambda container images, ECR, CloudFront, CDK | Repeatable builds and reviewable artifacts |
| Observability | Structured logs, health checks, cloud logs/metrics where available, audit events | Reconstructable behavior and operational feedback |
| Cloud | AWS CloudFront + Lambda Web Adapter + DynamoDB for the web/API path; AWS Lambda, Secrets Manager, ECR, CDK | Reproducible infrastructure with least privilege and operational clarity |

The previous purity-oriented stack remains useful as design inspiration, but it
is not the prescribed implementation stack for this job-aligned profile.
Preserve the principles, not the exact tools.

## Implementation Language Guidance

The selected stack is the preferred starting point for coding agents. It should
guide implementation choices without blocking a better local decision when the
preferred stack is insufficient for the task.

Preferred implementation stack:

- frontend web code: Next.js App Router + React + TypeScript
- backend/API code: Next.js API routes + Node.js + TypeScript
- model service code: FastAPI/Python behind a server-side TypeScript adapter,
  with HTTP and Lambda invocation modes
- persistence and migrations: DynamoDB in the serverless demo; PostgreSQL with
  Drizzle ORM and migrations when SQL durable mode is enabled
- data access: typed storage adapters around memory, DynamoDB, and Drizzle
- background work: none by default; add jobs, schedulers, or workflow runtime
  only for long-running or retryable work
- authorization and policy: signed anonymous workspace session checks and
  explicit server-side ownership checks
- testing: unit, integration, component, API, and end-to-end tests using the
  project-selected JavaScript/TypeScript testing stack
- observability: structured logging, cloud logs/metrics, traces where
  available, and audit events for important actions
- CI/CD: GitHub Actions or equivalent with package lockfiles and repeatable
  build steps
- repository automation: POSIX shell or project-selected JavaScript/TypeScript
  scripts when they fit the toolchain better

## Principle Mapping

Use mainstream tools while keeping the same engineering judgment:

- explicit UI state: React + TypeScript state unions, reducers, and clear props
- pure domain core: TypeScript domain modules with pure functions where possible
- typed API boundary: TypeScript request/response schemas, validation, and
  OpenAPI where useful
- durable truth: SQL constraints, migrations, keys, indexes, and clear ownership
- durable workflows: queues, jobs, schedulers, cloud workflow services, or a
  workflow runtime when needed
- explicit policy: TypeScript authorization modules, middleware, app-specific
  permission modules, or a dedicated policy engine when justified
- stronger verification: tests first; property, model-based, or formal methods
  only for critical invariants where ordinary tests are not convincing
- reproducible builds: package lockfiles, CI/CD, repeatable build steps, and
  artifact discipline

## Substitution Rule

Technology choices should fit the job context and project ecosystem. Prefer the
selected mainstream stack unless a different tool better preserves the system
boundaries or matches existing project constraints.

A replacement should preserve:

- typed boundaries
- explicit authority
- durable state
- controlled side effects
- testable behavior
- observable execution
- maintainable code for the team

When choosing a substitute language or major tool, record:

- what boundary it owns
- why the selected mainstream stack is insufficient
- package manager and dependency policy
- test and CI commands
- deployment path
- security and maintenance owner
- rollback or removal story

## Backward Compatibility

Backward compatibility is not assumed by default.

Preserve compatibility only when the project profile, an ADR, a contract, a
public API commitment, a migration plan, or the current task explicitly requires
it.

When the cleanest design requires a breaking change, surface that fact and
record the migration, rollout, or replacement path appropriate to the risk.

## Stack Is Not Architecture

The architecture is not a specific language, framework, database, or cloud. The
architecture is the boundary model:

```text
intent -> typed command -> policy -> state transition -> background work -> side effect
```

Keep this model even when the project uses mainstream tools.

Prefer project-selected components. Add a new tool only when the current
project has selected it or the feature needs the boundary that tool protects.

## When To Add A Layer

Add a layer when it protects a real boundary:

- add authorization modules when authority is nontrivial
- add background jobs, queues, schedulers, or workflow runtime when work is
  long-running, retryable, or externally dependent
- add stronger verification when an invariant is critical and easy to get
  subtly wrong
- add a sandbox when third-party or generated code may execute
- add infrastructure automation when manual setup would become unreproducible

Avoid adding tools only because an idealized reference stack lists them.

## Early Vertical Slice

The first runnable slice should usually be:

```text
React intent
  -> typed TypeScript API command
  -> domain transition
  -> storage record
  -> structured log, metric, or audit event
```

After that, add authorization depth, background work, side-effect capabilities,
and cloud deployment incrementally as the product surface requires them.
