# ADR: Adopt High-Integrity Agentic Engineering Doctrine

- status: accepted; stack profile superseded by ADR 0002
- date: 2026-05-09
- owners: project maintainers

## Context

`Pitch Prediction App` is starting from a reusable doctrine for high-integrity
software developed with autonomous coding agents.

The project needs a durable operating model before implementation choices start
to spread across frontend code, backend handlers, workflows, policy, database
schema, and infrastructure.

## Decision

Adopt the reusable engineering doctrine in `AGENTS.md`,
`docs/engineering/doctrine.md`, `docs/architecture/system-map.md`, and
`docs/architecture/stack-profile.md`.

The generated template included an initial purity-oriented stack profile. ADR
0002 supersedes that implementation profile with a job-aligned mainstream
full-stack profile while preserving this doctrine.

## Rationale

The doctrine preserves the core development boundary:

```text
Autonomous agents may propose code, plans, and actions.
The system may accept them only through explicit boundaries:
typed inputs, domain rules, policy checks, review gates, state transitions,
tests, durable persistence, controlled side effects, and observable execution.
```

This keeps autonomous development work and nondeterministic model behavior
inside explicit software boundaries: typed inputs, domain rules, policy checks,
review gates, state machines, durable persistence, recoverable workflows,
constrained side effects, tests, and observable execution.

## Alternatives Considered

### Submodule

Rejected as the default. A submodule keeps doctrine centrally pinned, but makes
project-local customization and future updates more awkward. This project should
own its generated docs and update deliberately with Copier.

### Ad Hoc Project Docs

Rejected. Starting from ad hoc docs makes each project rediscover the same
authority, workflow, side-effect, and observability boundaries.

## Consequences

Future architecture decisions should either preserve this doctrine or explicitly
record the reason for a deviation.

Template updates can be pulled with `copier update`, but project-specific
decisions remain local and should be protected through ADRs.

## Verification

- `scripts/doctor.sh` verifies the expected documentation structure exists.
- Feature work should use `docs/templates/feature-brief.md`.
- Meaningful architecture changes should use `docs/templates/adr.md`.
