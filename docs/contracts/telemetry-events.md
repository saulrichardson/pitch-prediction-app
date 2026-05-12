# Telemetry And Audit Event Contracts

Telemetry should make important behavior reconstructable without leaking secrets
or private data.

## Correlation IDs

Carry these IDs when relevant:

- request id
- workspace id
- timeline id
- game id
- prediction run id
- state transition id
- audit event id

## Event Registry

| Event | Type | Required fields | Sensitive fields excluded | Purpose |
| --- | --- | --- | --- | --- |
| `timeline.created` | audit | workspace id, timeline id, gamePk | secrets, raw model key | record replay start |
| `timeline.revealed` | audit | workspace id, timeline id, pitch index, evaluation label | raw model key | record actual reveal |
| `timeline.advanced` | audit | workspace id, timeline id, next pitch index | secrets | record actual timeline advance |
| `branch.alternate_pitch` | audit | workspace id, timeline id, branch id, pitch intent | secrets | record manual branch event |
| `branch.generated_pitch` | audit | workspace id, timeline id, branch id | secrets | record model-generated branch event |
| `prediction_runs` row | persistence trace | prediction id, timeline id, pitch moment, model version, request, response | model API key, database URL | reconstruct model request/response used by a timeline |

## Rules

- log structured facts, not raw secrets
- never log secrets
- redact sensitive content intentionally
- audit high-risk state changes and side effects
- traces should connect user intent, model calls, policy, side effects, and persistence
