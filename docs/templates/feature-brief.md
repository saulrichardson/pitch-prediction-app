# Feature Brief: <feature name>

- status: draft
- owner: <name or role>
- date: YYYY-MM-DD

## User Intent

As a <user or actor>, I want to <intent>, so that <outcome>.

The system must not allow:

- <unsafe or invalid behavior>

## Domain Concepts

- <domain object>
- <domain object>

## First-Class Change

Does this feature introduce a new durable concept, authority boundary, state,
event, data flow, or side effect?

If yes:

- where is it represented first-class?
- what old abstraction no longer matches?
- what contracts must change?
- what tests prove the new model?
- is any compatibility path required, or is a breaking change acceptable?

## State And Events

States:

- <state>

Events:

- <event>

Invalid transitions:

- <transition that must be rejected>

## Authority

- authenticated actor:
- user permissions:
- service delegation:
- side-effect capabilities:
- approval required:

## Persistence

Durable facts:

- <fact>

Constraints:

- <constraint>

Audit records:

- <audit event>

## Model Or External Data Boundary

- input type:
- output type:
- validation:
- failure behavior:

## Tools And Side Effects

- side effect:
- policy check:
- idempotency:
- retry behavior:
- failure state:

## Observability

Correlation IDs:

- <id>

Logs/traces/audit events:

- <event>

## Tests

- <invariant or behavior to prove>

## Deployment Notes

- config:
- migrations:
- rollout:
- rollback or mitigation:
