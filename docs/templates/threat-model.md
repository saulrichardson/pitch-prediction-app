# Threat Model: <scope>

- status: draft
- owner:
- date: YYYY-MM-DD

## Scope

- feature or system:
- users:
- tenant boundary:
- sensitive data:
- external systems:
- side effects:

## Development-Time Agent Exposure

- what can coding agents read?
- what can coding agents write?
- what credentials, commands, or automations can they access?
- what change types require human review?
- what deployment or data paths are off limits?

## Model Or External Data Exposure

- what external data or model output can influence behavior?
- what schema is expected?
- what is never sent to the external system?
- what malformed or unavailable behavior is expected?

## Data Access

- data sources:
- authorization rule:
- sensitive labels:
- source traceability:

## Tools

| Tool | Capability | Side effect | Approval | Policy rule | Audit event |
| --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |

## Threats

| Threat | Impact | Likelihood | Control | Detection | Residual risk |
| --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |

## Worst Unauthorized Action

Describe the worst plausible unauthorized action and how the system prevents,
detects, and mitigates it.

## Required Tests

- denial path:
- malformed model or external API output:
- unauthorized data access:
- approval required:
- idempotency or compensation:
