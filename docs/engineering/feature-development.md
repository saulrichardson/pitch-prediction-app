# Feature Development Guide

Use this guide before building meaningful features. The goal is to keep feature
work connected to the whole system without creating heavyweight process.

For this project, examples should be grounded in the actual stack: React
components, TypeScript API types, Next.js API routes, domain modules, model
service adapters, SQL tables and migrations, tests, and deployment checks. Use
additional workflow, policy, or stronger-verification artifacts only when the
feature needs those boundaries.

## 1. Define Intent

Write the user, operator, or system intent in one or two sentences:

```text
As a <user or actor>, I want to <intent>, so that <outcome>.
```

For coding-agent tasks, also state the development intent:

```text
Given <repository context>, change <system behavior or documentation> so that <outcome>.
```

Then state what the system or coding agent must not change or allow.

## 2. Name The Domain Concepts

Identify the domain objects involved. Prefer meaningful names:

- `UserProfile`
- `BillingRun`
- `Membership`
- `StateTransition`
- `PredictionRequest`
- `PredictionResponse`
- `PolicyDecision`

Avoid generic names when the concept matters:

- `payload`
- `data`
- `metadata`
- `result`
- `status`

Generic fields can exist, but they should not hide the system vocabulary.

## 3. Identify State And Events

For each lifecycle, define:

- states
- events
- valid transitions
- invalid transitions
- terminal states
- retry behavior
- cancellation behavior

Use the smallest state machine that explains the behavior.

## 4. Define Authority

Answer:

- who is authenticated?
- what is the user allowed to do?
- what may another service or coding agent do on the user's behalf?
- what capability does each side-effect path expose?
- what requires approval?
- what is denied by default?

Policy should be testable outside UI visibility or generated code.

## 5. Define Persistence

Identify durable facts and constraints:

- primary records
- ownership or tenant scope
- foreign keys
- uniqueness rules
- check constraints
- idempotency keys
- audit events
- outbox events

If a fact must survive retries, crashes, or worker restarts, it belongs in
durable storage or workflow history.

## 6. Define Side Effects

List each side effect:

- model service call
- file write
- external API call
- notification
- queue publish
- cloud resource change

For each one, define:

- policy check
- timeout
- retry behavior
- idempotency key
- audit record
- failure state
- compensation if needed

## 7. Define Model Or External Data Boundaries

If the pitch model service, MLB API, classifier, recommendation model, or other
external or nondeterministic component is involved, define:

- input schema
- output schema
- validation behavior
- failure behavior
- model/version trace
- retention rules

The feature should work safely when the component returns malformed,
incomplete, unavailable, or overconfident output.

## 8. Define Observability

Every important action should carry correlation IDs such as:

- request id
- workspace id
- timeline id
- game id
- workflow id
- prediction run id
- audit event id

Log enough structured data to reconstruct behavior without leaking secrets or
private content.

## 9. Define Tests

Test the invariants, not just examples:

- unauthorized access is rejected
- invalid transitions are rejected
- duplicate events do not duplicate effects
- malformed model service output is rejected safely
- high-risk actions require approval
- workflow retries preserve correctness
- database constraints reject impossible facts

## 10. Ship The Smallest Safe Slice

Prefer a thin vertical slice over disconnected layers:

```text
React intent -> TypeScript API command -> domain transition -> SQL record -> observable result
```

Then widen only where the feature needs it.
