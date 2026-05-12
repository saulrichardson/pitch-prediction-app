# Definition Of Done

A change is done only when the implementation, contracts, verification, and
documentation match the risk of the change.

## Baseline

Every completed change should satisfy:

- the intended user or domain behavior is implemented
- affected boundaries are identified
- unrelated scope is left alone
- implementation languages and tools follow the project profile, or a
  substitution is recorded with its boundary and rationale
- generated or temporary artifacts are not committed accidentally
- verification has been run or the reason it could not run is stated
- the final response clearly names the change and verification, with
  assumptions, risk, and follow-up only when they add useful signal

## Manual Verification

A change is not done until the relevant inputs and outputs have been inspected
against the actual goal.

For nontrivial changes, verify:

- what input or state existed before the change
- what the change inferred
- what behavior, data, or contract changed
- what was intentionally preserved
- what output or system state now results
- whether the result is substantively correct, not merely syntactically valid

Heuristics, generated tests, type checks, and conventions are useful signals.
They are not substitutes for checking the specific case in front of the agent.

## Boundary Checks

When relevant, a completed change should also satisfy:

- frontend state represents loading, failure, stale, unauthorized, and success states
- API boundaries parse and validate typed requests
- domain rules live in domain code, not scattered handlers or UI conditionals
- state transitions are explicit and invalid transitions are rejected
- policy checks exist before authority-sensitive actions
- durable facts are persisted with constraints where practical
- workflows own long-running, retryable, or externally dependent work
- side effects are controlled, idempotent where possible, and auditable
- model service outputs are typed, validated, and treated as untrusted data
- tool capabilities are narrow and registered in `docs/contracts/tool-registry.md`
- telemetry or audit events can reconstruct important behavior

## Documentation Done

Update docs when a change modifies:

- architecture or stack choices
- implementation language or toolchain choices
- state machines
- policy inputs or authorization behavior
- model service schemas
- tool capabilities
- workflow events
- telemetry events
- database invariants
- threat model assumptions
- deployment or operational risk

Use ADRs for decisions future agents might reasonably question.

## Test Done

Tests should prove the important behavior, not only the happy path.

For high-risk and critical-risk changes, include failure or denial tests. For
critical-risk changes, include a rollback, mitigation, approval, or compensation
story before calling the work done.

## Substantive Correctness

Verification should prove that the result satisfies the actual goal, not only
that the implementation is internally consistent.

A change can pass tests and still be wrong if:

- the tests encode the wrong requirement
- the output is plausible but not grounded in the input
- the implementation preserves an outdated abstraction
- authorization is checked in the wrong layer
- a side effect happens in the wrong order
- edge cases are ignored because the common case works

Review the full path from input to durable consequence when the risk justifies
it.
