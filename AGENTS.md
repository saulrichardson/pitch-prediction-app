# Agent Operating Guide

Project: Pitch Prediction App

This file is the root operating guide for coding agents working in this
repository. It is generated from the reusable high-integrity agentic engineering
template, then owned by this project.

Project-specific decisions override the base doctrine only when they are
recorded in `docs/project-profile.md` or an ADR under `docs/adr/`.

## North Star

Build systems whose behavior remains explicit, constrained, testable,
observable, and reviewable, even when much of the code is produced by
autonomous coding agents.

```text
Autonomous agents may propose code, plans, and actions.
The system may accept them only through explicit boundaries:
typed inputs, domain rules, policy checks, review gates, state transitions,
tests, durable persistence, controlled side effects, and observable execution.
```

## Read Order

Before substantial work, read these files:

1. `AGENTS.md`
2. `docs/project-profile.md`
3. `docs/product-intent.md`
4. `docs/engineering/agent-execution-protocol.md`
5. `docs/engineering/definition-of-done.md`
6. `docs/engineering/doctrine.md`
7. `docs/architecture/system-map.md`
8. `docs/architecture/stack-profile.md`
9. Relevant contract docs in `docs/contracts/`
10. Relevant threat model, feature brief, ADR, or local module documentation

If the repository has implementation code, inspect the code before changing it.
Do not assume the docs are more current than the source.

## Documentation Map

Use this map when you need a specific kind of guidance:

- `AGENTS.md`: root operating contract, read order, stack guardrails, and
  required coding-agent behavior.
- `README.md`: project overview, current documentation set, basic repository
  workflow, and template update instructions.
- `docs/project-profile.md`: project-local facts, selected stack, language
  preferences, users, tenant model, sensitive data, approvals, external systems,
  irreversible actions, critical invariants, non-goals, and open questions.
- `docs/product-intent.md`: freeform product narrative and raw notes about what
  the product should do, who it serves, desired workflows, examples, non-goals,
  and questions before they become formal contracts.
- `docs/engineering/agent-execution-protocol.md`: work loop, change
  classification, risk taxonomy, gates, verification meaning, and reporting
  judgment.
- `docs/engineering/definition-of-done.md`: completion criteria for behavior,
  boundaries, documentation, tests, and risk-specific work.
- `docs/engineering/doctrine.md`: stable first-principles engineering doctrine
  for state, authority, side effects, persistence, workflows, nondeterminism,
  and observability.
- `docs/engineering/feature-development.md`: feature-planning checklist from
  intent through domain concepts, authority, persistence, effects,
  observability, and tests.
- `docs/engineering/deployment-readiness.md`: deployment gate for environment,
  migrations, secrets, observability, rollback, and operational readiness.
- `docs/engineering/formal-methods.md`: when to use stronger verification such
  as property tests, model-based tests, lightweight specs, or formal methods
  for critical invariants.
- `docs/architecture/system-map.md`: development-time path, product runtime path,
  layer responsibilities, common domain objects, and design smells.
- `docs/architecture/stack-profile.md`: job-aligned implementation languages,
  toolchain guidance, substitution rules, and when to add a new layer.
- `docs/contracts/README.md`: index for durable system contracts that other
  code, services, workflows, tools, or policies depend on.
- `docs/contracts/state-machines.md`: lifecycle states, events, guards,
  terminal states, transition ownership, and test expectations.
- `docs/contracts/tool-registry.md`: registered tool and side-effect
  capabilities, including inputs, outputs, policy, approval, timeout,
  idempotency, audit event, and failure states.
- `docs/contracts/model-service.md`: pitch model service boundary, validation,
  failure behavior, and observability expectations.
- `docs/contracts/workflow-events.md`: workflow event names, retry semantics,
  idempotency behavior, and failure handling.
- `docs/contracts/policy-inputs.md`: authority dimensions, policy decision
  inputs, allow/deny results, and policy audit events.
- `docs/contracts/telemetry-events.md`: trace, metric, log, and audit event
  names needed to reconstruct important behavior.
- `docs/security/threat-model.md`: project threat model, required controls, open
  threats, and review triggers.
- `docs/adr/README.md`: when to write architecture decision records and what
  kinds of decisions require durable explanation.
- `docs/adr/0001-adopt-agentic-engineering-doctrine.md`: initial decision that
  adopts this doctrine.
- `docs/adr/0002-adopt-job-aligned-typescript-stack.md`: decision that
  supersedes the generated purity-oriented stack with the current job-aligned
  TypeScript stack profile.
- `docs/adr/0008-adopt-serverless-web-architecture.md`: current
  serverless deployment decision: CloudFront, Lambda Web Adapter, DynamoDB,
  and existing Lambda model inference.
- `docs/templates/adr.md`: template for architecture, stack, toolchain, policy,
  persistence, workflow, or security decisions.
- `docs/templates/feature-brief.md`: template for meaningful feature planning
  before implementation.
- `docs/templates/agent-task.md`: template for assigning bounded work to a
  coding agent, including boundaries, system map, tooling, and verification.
- `docs/templates/threat-model.md`: template for feature- or system-specific
  threat modeling.
- `docs/templates/tool-capability.md`: template for a new tool or side-effect
  capability before registration.
- `docs/templates/state-machine.md`: template for defining lifecycle states,
  events, guards, invalid transitions, and tests.
- `scripts/doctor.sh`: local documentation health check for generated projects.

If you cannot find the rule in the map, inspect nearby code and record any new
durable convention in `docs/project-profile.md`, an ADR, or the relevant
contract file.

## Project Stack Defaults

- frontend web: Next.js App Router + React + TypeScript
- mobile: none in v1; add only with an ADR
- backend/API: Next.js API routes + Node.js + TypeScript
- model service: separate FastAPI/Python inference boundary with HTTP and Lambda handlers
- durable database: DynamoDB for the deployed serverless demo; PostgreSQL support through Drizzle for legacy SQL durable mode
- data access: explicit DynamoDB, memory, and PostgreSQL storage adapters
- cloud target: AWS CloudFront + Lambda Web Adapter + DynamoDB, AWS Lambda model inference, Secrets Manager, ECR, and CDK
- background work: none in v1; add jobs or workflow runtime only when required
- authorization: signed anonymous workspace session boundary
- testing: Vitest, Playwright, API/domain tests, and integration checks where useful
- observability: structured logs, cloud logs/metrics, traces where available,
  and audit events for important actions
- CI/CD: GitHub Actions or equivalent with lockfiles and repeatable builds

This project uses a job-aligned mainstream full-stack profile. The previous
purity-oriented stack remains useful as design inspiration, but it is not the
prescribed implementation stack for this project. Preserve the principles, not
the exact tools.

Technology choices should fit the job context and project ecosystem. Prefer the
selected mainstream stack unless a different tool better preserves the system
boundaries or matches existing project constraints.

## Language And Tooling Guidance

Coding agents should start from this project's selected languages and tools for
production implementation. The stack exists to preserve the doctrine's
boundaries, not to win an argument about tools.

Preferred implementation stack:

- frontend web: Next.js App Router, React, and TypeScript
- backend/API: Next.js API routes, Node.js, and TypeScript
- model service: FastAPI/Python behind a server-side TypeScript adapter, with
  HTTP locally and Lambda in AWS
- database and migrations: DynamoDB in deployed serverless mode; PostgreSQL with
  Drizzle ORM and migrations when SQL durable mode is enabled
- data access: typed storage adapters around memory, DynamoDB, and Drizzle
- background work: none by default; add jobs, schedulers, or workflow runtime
  only for long-running or retryable work
- authorization and policy: signed anonymous workspace session checks and
  explicit server-side ownership checks
- testing: unit, integration, component, API, and end-to-end tests with the
  project-selected JavaScript/TypeScript testing stack
- observability: structured logging, cloud logs/metrics, traces where
  available, and audit events for important actions
- CI/CD: GitHub Actions or equivalent with package lockfiles and repeatable
  build steps
- repository automation: POSIX shell or project-selected JavaScript/TypeScript
  scripts when they fit the toolchain better

Use React and TypeScript to model explicit UI state with clear props, reducers,
or discriminated unions. Use Node.js and TypeScript API code as adapters around
validated requests, application services, domain modules, SQL persistence, and
controlled side effects.

When a feature uses a language or major tool outside the preferred stack, record
the choice in `docs/project-profile.md` or an ADR. Name the boundary it owns,
why the selected mainstream stack is insufficient, how it is tested and
deployed, and how it preserves typed boundaries, explicit authority, durable
state, controlled side effects, testable behavior, observable execution, and
maintainable code for the team.

If a selected stack entry says `Other / undecided` or `None yet`, choose and
record the local tool before implementing that layer.

## Operating Model

For coding-agent work, locate the change on this path:

```text
task intent
  -> repository context
  -> change classification
  -> design boundary
  -> implementation plan
  -> code change
  -> tests / verification
  -> review evidence
  -> documentation / ADR if needed
  -> deployability check
```

For runtime product behavior, locate the feature on this path:

```text
user intent
  -> frontend state
  -> API boundary
  -> domain model
  -> policy / authorization
  -> state transition
  -> durable persistence
  -> workflow orchestration
  -> external side effects
  -> observability
  -> deployment / infrastructure
```

Most defects are caused by skipping or scattering one of these layers.

## Coding Agent Operating Contract

Coding agents must not treat a task as "write code until tests pass." For every
meaningful change, the agent must:

1. classify the change
2. identify affected boundaries
3. preserve domain rules
4. avoid widening scope
5. add or update verification
6. report what changed and why
7. flag risks and unresolved questions when they affect review or next steps

Use `docs/engineering/agent-execution-protocol.md` for the full risk taxonomy
and gates.

## Non-Negotiable Boundaries

- Autonomous agent output is proposal, not authority.
- User input is useful, not automatically valid.
- Frontend checks improve experience, not security.
- Policy lives in code or policy files, not UI visibility.
- State changes go through explicit transitions.
- Side effects are durable, idempotent where possible, and auditable.
- External data, tool results, and model outputs are untrusted input.
- Secrets are never exposed to client code, logs, or broad tools.
- Production behavior must be reconstructable from traces, logs, audit events,
  workflow history, and durable records.

## Evidence Over Assumption

Ground implementation decisions in repository artifacts:

- code
- tests
- schemas
- configs
- migrations
- logs
- docs
- ADRs
- contract files
- representative data examples

Do not rely on generic knowledge, common conventions, or prior expectations when
concrete project artifacts are available.

Treat assumptions as hypotheses. If required information is missing, say what is
missing and choose only conservative, easily-correctable defaults unless the
task requires a decision.

For nontrivial work, manually inspect both the relevant inputs and outputs.
Passing tests or matching a common pattern is not enough if the result does not
satisfy the actual goal and execution path.

## No Heuristic Final Evidence

Heuristics may guide investigation. They do not prove correctness.

Do not conclude that a result is correct only because it follows a common
pattern, resembles nearby code, satisfies a linter, compiles, or passes
generated tests.

Use concrete evidence from the current repository and task.

## Design Choice Rule

If multiple reasonable approaches exist, choose only when the decision is local,
reversible, and consistent with existing project artifacts.

Ask or record an ADR when the decision affects:

- architecture
- persistence
- public API
- authorization
- tenant model
- workflow behavior
- tool capability
- runtime model behavior
- deployment
- implementation language or major framework

## Preferred Shape Of Code

Prefer:

- typed request and response boundaries
- small API handlers that call application/domain services
- pure domain functions for business rules and state transitions
- explicit state machines for important lifecycles
- narrow capability-scoped tools
- database constraints for durable invariants
- durable workflows for long-running or retryable processes
- structured telemetry with stable correlation IDs
- ADRs for architectural choices that future agents might question

Avoid:

- broad side-effect capabilities such as arbitrary SQL, shell execution,
  arbitrary HTTP, or arbitrary file write
- lifecycle statuses assigned directly from many files
- business rules hidden in UI conditionals, migrations, or route handlers
- untyped blobs named `payload`, `metadata`, or `data` when the concept has
  domain meaning
- side effects before durable decisions are recorded
- introducing infrastructure that does not preserve the system boundaries

## Fail Fast And Loudly

Prefer explicit errors over silent fallbacks.

Do not hide misconfiguration, malformed input, invalid state, missing policy,
missing credentials, or unsupported behavior behind permissive defaults.

Avoid defensive or magical branching that makes the system appear to work while
skipping the intended boundary.

Do not add feature flags, compatibility branches, or fallback paths unless the
task explicitly requires them or an ADR records the reason.

## Feature Work Checklist

Before implementing, answer the smallest useful version of these questions:

1. What user intent is served?
2. What domain objects are involved?
3. What lifecycle or state machine changes?
4. What permissions, delegation, capability, or approval checks are required?
5. What durable facts and database constraints are needed?
6. What side effects occur, and are they retryable or idempotent?
7. Is a durable workflow required?
8. Is the model service or another external data boundary involved, and what
   typed output may it return?
9. Are side-effect capabilities or tools involved, and what narrow capability
   do they expose?
10. What telemetry and audit records are needed to reconstruct behavior?
11. What tests prove the important invariant?

Small changes do not require long documents. They still require clear answers.

## Testing And Verification

Tests should focus on behavior and invariants:

- pure domain logic
- state transitions
- authorization and delegation
- database constraints
- idempotency and duplicate delivery
- workflow retry and compensation behavior
- model service schema parsing and malformed-output paths
- side-effect capability allow/deny behavior
- critical end-to-end flows

When changing production behavior, run the narrowest verification that proves the
change and broaden only when the blast radius requires it.

Verification depends on risk:

- docs-only: consistency review and path/link check
- pure domain: unit or property tests
- state machine: valid and invalid transition tests
- workflow: retry, idempotency, timeout, and compensation tests
- database: migration and constraint tests
- policy: allow and deny tests
- model service boundary: schema, timeout, unavailable, and malformed-output tests
- tool capability: policy, approval, timeout, idempotency, and audit tests
- critical invariant: property tests, model-based tests, lightweight specs, or
  formal methods when ordinary tests are not convincing

## Definition Of Done

A change is done only when:

- intended user or domain behavior is implemented
- affected boundaries are identified
- state transitions are explicit where relevant
- policy checks exist where relevant
- durable facts are persisted with constraints where relevant
- side effects are controlled and observable where relevant
- tests or checks cover important success and failure paths
- telemetry and audit behavior are considered
- contracts, docs, or ADRs are updated if architecture changed

## Documentation Discipline

Documentation should clarify decisions, not freeze implementation details too
early. Use:

- `docs/project-profile.md` for local project facts and deviations
- `docs/product-intent.md` for freeform product narrative and functionality
  notes
- `docs/engineering/doctrine.md` for stable engineering principles
- `docs/architecture/system-map.md` for the system boundary model
- `docs/architecture/stack-profile.md` for stack choices and substitution rules
- `docs/contracts/` for state, model-service, capability, policy, workflow, and
  telemetry contracts
- `docs/security/threat-model.md` for project threat modeling
- `docs/adr/` for durable architectural decisions
- `docs/templates/feature-brief.md` before building meaningful features

When a local choice becomes important enough that future agents need to preserve
it, document it close to the code or add an ADR.
