# Agent Execution Protocol

This protocol turns the engineering doctrine into a concrete work loop for
coding agents. Use it for every nontrivial change.

The more autonomous the coding agent, the more explicit the boundaries must be.
Do not treat a task as "write code until tests pass."

## Instruction Interpretation Mode

Before substantial work, decide whether the task is literal or interpretive.

Use literal mode when the requester gives exact steps, exact wording, or says to
follow instructions precisely. In literal mode, treat the instructions as
constraints unless they are contradictory or impossible.

Use interpretive mode when the requester gives a high-level goal, incomplete
direction, or a desired outcome without exact implementation. In interpretive
mode, preserve the goal, identify assumptions, and make the smallest durable
design choice that satisfies the request.

For interpretive work, state the edit contract before changing substantial
artifacts:

- what role the result should play
- what remains fixed
- what changes
- which parts of the request are instructions rather than artifact content

If the task is ambiguous in a way that affects architecture, persistence,
authority, security, or user-visible behavior, stop and ask or present a small
set of options.

## Preserve Stable Semantics

When the task points to a specific problem, solve that problem first.

Preserve existing terminology, headings, structure, public contracts, and
conceptual framing unless the task explicitly asks to change them or they are
the source of the problem.

Do not treat request wording as replacement artifact text unless the requester
asks for that wording to appear.

For nontrivial revisions, make the intended delta clear: what stays fixed, what
changes, and why.

## Work Loop

1. Orient
   Read `AGENTS.md`, `docs/project-profile.md`, relevant ADRs, nearby code, and
   the contract docs for affected boundaries.

2. Classify the change
   Use the risk taxonomy below. A change may touch more than one class.

3. Identify affected boundaries
   Name the affected layers: frontend, API, domain, policy, state, persistence,
   workflow, model service, tool, side effect, observability, infrastructure.

4. State the plan
   List files or modules to change, tests to run, non-goals, and the main risk.
   Keep this short for low-risk work. Be explicit for high-risk work. Confirm
   that implementation files follow the preferred stack or record why a
   substitute tool better preserves the project goals.

5. Implement narrowly
   Make the smallest change that preserves the boundary model. Do not widen
   scope without recording why. When work is reacting to a failure, apply
   `Root Cause Before Patch` before editing.

6. Verify
   Run the narrowest checks that prove the change. Broaden verification when the
   blast radius crosses shared contracts, persistence, policy, workflows, tools,
   or user-visible behavior.

7. Report
   Summarize what changed and how it was verified. Surface mode, assumptions,
   risk, boundaries, residual risk, and follow-up work when they materially help
   the user evaluate the result.

## Root Cause Before Patch

Do not write code merely to make an error disappear.

When a failure appears, identify whether it comes from:

- incorrect requirement interpretation
- invalid input
- wrong domain model
- missing policy
- invalid state transition
- persistence mismatch
- workflow ordering
- side-effect failure
- test setup error
- environment or configuration issue

Fix the root cause where practical. If more than one cause is plausible, report
the options and the evidence for each.

## Change Classification

Classify every meaningful change before implementation. A change can have more
than one class.

| Class | Meaning | Common gates |
| --- | --- | --- |
| Docs-only | Documentation, examples, wording, or planning artifacts with no behavior change | consistency check |
| UI-only | Frontend representation or local UI state with no backend authority change | UI state check, screenshot or component test when useful |
| Domain | Business rule, validation, invariant, or state transition | unit/property/transition tests |
| API | Request/response shape, handler boundary, serialization, client contract | schema and compatibility tests |
| Persistence | Schema, migration, constraint, ownership, data lifecycle | migration and constraint tests, rollback/mitigation notes |
| Policy | Auth, delegation, approval, capability, tenant access | allow/deny tests and audit check |
| Workflow | Long-running process, retry, compensation, external dependency | retry/idempotency/failure tests |
| Side effect | MLB API, model service, file, cloud resource, queue, command execution | policy, idempotency, timeout, audit |
| Model service | Prediction request/response shape, model adapter, model behavior | schema, timeout, malformed-output, and unavailable-service tests |
| Infrastructure | Deployment, secrets, build, networking, observability | reproducibility and rollback/mitigation check |
| Toolchain | New language, package manager, framework, runtime, database, queue, or cloud service | project-profile update or ADR, CI/deploy plan |

## Change Risk Taxonomy

Low-risk changes:

- documentation edits
- copy changes
- local refactors with no behavior change
- tests that do not alter production code

Medium-risk changes:

- frontend state or validation
- API response shape
- pure domain validation
- noncritical data transformation
- new tests for existing behavior

High-risk changes:

- database migration or constraint change
- policy or authorization change
- workflow state or retry behavior
- model service input/output schema
- tool capability or side-effect behavior
- authentication, tenant, or ownership boundary
- observability changes for critical flows
- substituting a package manager, framework, runtime, or implementation language
  for the preferred stack

Critical-risk changes:

- irreversible external action
- secret handling
- broad tool exposure such as shell, SQL, arbitrary HTTP, or arbitrary file write
- cross-tenant data access
- approval bypass or approval weakening
- production data deletion
- cloud resource mutation with user or cost impact
- adding a broad general-purpose runtime path without a clear owner, CI check,
  and deployment boundary

## Gates By Risk

Low risk:

- keep the change narrow
- run a relevant local check when practical
- report what changed

Medium risk:

- identify affected boundaries
- run focused tests or checks
- update docs if behavior or contracts changed

High risk:

- create or update a feature brief or ADR
- update the relevant contract catalog entry
- test success and denial/failure paths
- confirm observability or audit behavior
- define rollback, mitigation, or compensation where relevant

Critical risk:

- require an explicit approval model
- require a threat model
- require denial and failure-path tests
- require auditability before execution
- require rollback, mitigation, or compensation notes
- do not expose broad capabilities without a written ADR

## Stop Conditions

Stop and report instead of continuing when:

- the task requires choosing between multiple architectural approaches and no
  local decision exists
- the implementation would preserve an old abstraction that no longer matches
  the stated goal
- the change would become a patch, shim, or hidden special case instead of a
  first-class concept
- deterministic checks pass but the output conflicts with the actual input,
  goal, or source-of-truth artifacts
- the agent cannot ground an important claim in code, tests, schemas, docs,
  logs, or data
- high-risk or critical-risk work lacks a policy, approval, rollback,
  mitigation, or verification path
- required secrets, credentials, external systems, or representative data are
  unavailable and the task cannot be verified without them
- executing the next step would create an irreversible side effect not already
  approved by the project model or requester

## What Verification Means

Verification is risk-dependent. It does not always mean formal methods, and it
does not mean no verification for small changes.

Use the smallest proof that fits the risk:

- docs-only: consistency review and link/path check
- pure function: unit tests or property tests
- state machine: transition tests, invalid-transition tests, terminal-state tests
- workflow: retry, timeout, idempotency, cancellation, and compensation tests
- database: migration, rollback/mitigation, constraint, and duplicate-event tests
- policy: allow/deny tests with representative actors, tenants, and capabilities
- model service boundary: schema validation, unavailable-service, timeout, and
  malformed-output tests
- tool capability: policy, approval, timeout, idempotency, audit, and failure tests
- critical invariant: property tests, model-based tests, lightweight specs, or
  formal methods when ordinary tests are not convincing

## Reporting Judgment

Reports should be useful, not ceremonial.

For small, low-risk, or obvious changes, concise prose is preferred. Name what
changed and what was checked. Do not force a long structured report when there
are no meaningful assumptions, risks, or architectural choices to surface.

Use a structured report when the work is nontrivial, ambiguous, high-risk,
crosses important boundaries, changes contracts, or requires the user to review
tradeoffs.

When structure helps, use this shape and omit fields that add no signal:

```text
Mode:
- literal / interpretive, when relevant

Goal restated:
- <goal in project terms>

Assumptions:
- <assumptions that affected the work>

Changed:
- <short list>

Risk class:
- low / medium / high / critical, when relevant

Boundaries touched:
- <frontend / API / domain / policy / state / persistence / workflow / side effect / observability / infrastructure, when relevant>

Verification:
- <commands or checks run>

Manual checks:
- <inputs and outputs inspected against the actual goal>

Docs or contracts updated:
- <docs, contracts, or ADRs updated>

Residual risk:
- <remaining risk worth surfacing>
```

Mode, assumptions, and risk are reasoning aids. Think about them during the
work. Surface them to the user when they affect interpretation, safety, review,
or next steps.
