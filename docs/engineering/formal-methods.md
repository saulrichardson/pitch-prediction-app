# Formal Methods Guidance

Formal methods are not part of the default job-aligned stack. Start with
ordinary TypeScript domain code, SQL constraints, and tests. Use formal methods
only when a critical invariant is difficult to validate with ordinary tests.

When used, formal methods are not ceremony. They are a tool for making
high-risk invariants harder to misunderstand.

Use them where the cost of ambiguity is high:

- workspace ownership guarantees
- reveal/advance state-machine invariants
- model request/response validation invariants
- retry and idempotency behavior for future workflows
- AWS deployment changes with irreversible or costly consequences

## Default Use

Start with ordinary typed domain code and tests. Add stronger verification when
a rule is important enough that examples are not convincing.

Preferred order:

- unit and integration tests for domain behavior and API boundaries
- database constraint and migration tests for durable invariants
- API and end-to-end tests for important user workflows
- property tests for broad input spaces
- model-based tests or lightweight state-machine specs for complex lifecycles
- formal methods only when the invariant is critical and ordinary tests are not
  enough

If a formal-methods tool is introduced, choose it deliberately and record the
choice in an ADR.

## Good Candidate Questions

- Can a workspace ever read or mutate another workspace's timeline?
- Can actual pitch details appear before `RevealActual`?
- Can advancing before reveal mutate history?
- Can malformed model output reach timeline persistence?
- Can duplicate events create duplicate prediction or audit records?

## Documentation Rule

If formal methods are introduced, add an ADR that explains:

- the invariant being protected
- why ordinary tests are not enough
- why the selected tool fits the project
- where the spec lives
- how the spec is checked
- what implementation code is covered by the spec
