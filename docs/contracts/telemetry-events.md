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
| `timeline.stepped_back` | audit | workspace id, timeline id, pitch index, revealed state | secrets | record replay back-step |
| `prediction_runs` row | persistence trace | prediction id, timeline id, pitch moment, model version, request, response | model API key, database URL | reconstruct model request/response used by a timeline |

## Rules

- log structured facts, not raw secrets
- never log secrets
- redact sensitive content intentionally
- audit state changes and side effects that affect replay trust
- traces should connect user intent, model calls, policy, side effects, and persistence
