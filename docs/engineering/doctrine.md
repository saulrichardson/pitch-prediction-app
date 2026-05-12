# Engineering Doctrine

We build software whose behavior remains explicit, constrained, testable,
observable, and reviewable, even when much of the code is produced by
autonomous coding agents.

This doctrine applies to web applications, APIs, databases, infrastructure,
workflows, internal tools, and model-backed product behavior.

The general rule:

```text
Autonomous agents may propose code, plans, and actions.
The system may accept them only through explicit boundaries:
typed inputs, domain rules, policy checks, review gates, state transitions,
tests, durable persistence, controlled side effects, and observable execution.
```

## Why This Exists

Autonomous code generation amplifies existing software risks:

- unclear requirements
- scattered business rules
- implicit state machines
- uncontrolled side effects
- weak authorization boundaries
- unsafe data migrations
- race conditions
- invalid states
- shallow tests
- poor observability
- unreviewable changes
- untraceable production behavior
- generated code that works locally but violates architecture

If humans manually hold the architecture in their heads, loose conventions can
survive for a while. When autonomous coding agents generate code, hidden
conventions break quickly. The more autonomous the coding agent, the more
explicit the system boundaries must be.

This doctrine exists to make intent, invariants, authority, side effects, and
verification visible enough that both humans and coding agents can safely extend
the codebase.

## General Software Principles

- Make requirements explicit.
- Make state explicit.
- Make events explicit.
- Make transitions explicit.
- Make authority explicit.
- Make side effects controlled.
- Make durable facts constrained.
- Make workflows recoverable.
- Make behavior observable.
- Make changes reviewable.
- Make tests prove invariants.
- Make deployments reproducible.

These principles matter for ordinary deterministic code and for model-backed
features.

## Goal-First Engineering

Coding agents must start from the project goal and the local source-of-truth
artifacts, not from standard patterns, legacy conventions, or the most common
library approach.

A common pattern is only a hypothesis. It becomes acceptable only when it fits
the stated goal, the current codebase, the project profile, and the relevant
contracts.

When the goal conflicts with an existing abstraction, do not preserve the old
abstraction by default. Surface the mismatch and either reshape the abstraction
cleanly or record why a temporary compromise is necessary.

Optimize for a system that becomes clearer, truer to the goal, and easier to
reason about.

## First-Class Change Rule

When a requirement materially changes behavior, data flow, ownership,
authority, persistence, or system boundaries, implement it as a first-class
concept.

Do not bury important changes in one-off conditionals, compatibility shims,
scattered flags, wrapper functions, or hidden exception paths.

If something is now important to the system, reflect it in the appropriate
artifacts:

- domain model
- types or schemas
- API contracts
- state machines
- policy inputs
- database constraints
- workflow events
- tool capabilities
- tests
- telemetry or audit events
- docs or ADRs

A reader should be able to see that the behavior is supported by the system
model, not accidentally patched around it.

## Development-Time Path

Coding-agent work should follow this path:

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

This path prevents an autonomous coding agent from treating a task as "write
code until tests pass." Passing tests is not enough if the change violates
authority, persistence, workflow, observability, or architectural boundaries.

## Runtime Path

Application behavior should still be understood across the full stack:

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

Every meaningful feature should know where it sits in this path.

## Authority Model

The system distinguishes:

- authentication: who is the actor?
- authorization: what may the actor do?
- delegation: what may another actor or service do on the actor's behalf?
- capability: what exact tool, resource, or operation is available now?
- approval: does this action require human confirmation?

Users, services, workflows, coding agents, and tools may all have different
authority boundaries. UI visibility and generated code do not define authority.

## State Model

Important lifecycles should be modeled as state machines.

State should change through events and transition functions, not arbitrary status
assignment.

Example:

```text
current state + event + facts + policy = next state or rejection
```

If a lifecycle matters to correctness, safety, policy, auditability, or user
trust, it deserves explicit states and transitions.

## Side-Effect Capability Model

Side effects include database writes, model service calls, MLB API reads, file
writes, command execution, queue publishes, notifications, and cloud resource
changes.

The preferred sequence is:

```text
decide
persist the decision
record the event
execute side effects through a workflow, outbox, or controlled capability
observe the result
```

Side effects should be visible, bounded, policy-checked, retryable where
possible, idempotent where practical, and auditable.

Tools are one kind of side-effect capability. They must be narrow, typed,
capability-scoped, and registered before they are exposed to product workflows
or automation.

## Persistence Model

The database is the durable source of truth.

Use database constraints for durable invariants:

- foreign keys
- unique constraints
- non-null constraints
- check constraints
- constrained status values
- idempotency keys
- audit/event tables
- ownership relationships

If something must always be true, ask whether the database can enforce it.

## Workflow Model

Long-running, failure-prone, multi-step work belongs in durable workflows or an
equivalent recoverable execution model.

Use workflows for processes such as:

- approval flows
- tool execution
- external API orchestration
- scheduled operations
- human-in-the-loop work
- retryable side effects
- model batch scoring or replay verification

A worker crash should not erase the business process.

## Nondeterministic Component Model

The pitch model service is one example of a nondeterministic component. Others
include autonomous coding agents, recommendation models, classifiers, external
APIs, user-submitted files, and tool outputs.

The rule is:

```text
nondeterministic output is input, not authority
```

Any nondeterministic output that affects behavior must pass through the same
software boundaries as other untrusted input: parsing, validation, domain rules,
policy, state transitions, persistence, tests, and observability.

## Observability Model

Every important action should be reconstructable.

The system should be able to answer:

- what task or user intent started this?
- what code, state, or context was involved?
- what boundary was crossed?
- what policy was evaluated?
- what state changed?
- what side effect occurred?
- what failed or retried?
- what tests or checks support the change?
- what was recorded for audit or review?

Use structured logs, traces, metrics, audit events, and stable correlation IDs.
Do not leak secrets or private data into telemetry.

## Ordinary Feature Example

Example: reveal the current pitch.

```text
user clicks Reveal Actual
API loads the signed workspace session
storage returns only a timeline owned by that workspace
domain transition reveals the current pitch and evaluates the prediction
database persists the updated timeline
audit records timeline.revealed
UI shows actual pitch and model-vs-actual result
```

## Migration Example

Example: database migration proposed by a coding agent.

```text
task is classified as persistence risk
schema ownership and invariants are identified
migration and rollback/mitigation are considered
tests verify old and new behavior
ADR is added if ownership or invariants changed
deployability check is reported
```

## Workflow Example

Example: scheduled demo-data cleanup.

```text
workflow owns retries
retention rules identify expired anonymous workspaces
database deletes or archives scoped records
cleanup outcome is audited
failure path is observable
```

## Final Test

For any significant design, future maintainers and coding agents should be able
to understand:

- what state exists
- how it can change
- who can change it
- what effects happen
- what was recorded
- what can be retried
- what can be audited
- what can fail
- what verification supports it

If those answers are unclear, the design is drifting.
