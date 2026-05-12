# Threat Model

This threat model covers the current Pitch Prediction App. The product has no
product agent in v1.

## Scope

- project: Pitch Prediction App
- primary users: analysts, coaches, decision makers, technical evaluators
- tenant model: signed anonymous workspace cookie
- sensitive data: session secret, model API key when HTTP mode is used,
  database credentials when durable mode is used, AWS secrets
- external systems: MLB Stats API, pitch model service, AWS CloudFront, AWS
  Lambda, DynamoDB, Secrets Manager, ECR, optional PostgreSQL durable mode
- irreversible or costly actions: production deploys, secret rotation,
  database replacement/deletion, AWS infrastructure changes with standing cost

## Required Controls

- browser code never receives database credentials, AWS secrets, session
  secrets, or model API keys
- timeline reads and writes are scoped to the signed workspace session
- actual pitch fields remain hidden until the timeline is in reveal state
- model service output is validated before it affects product behavior
- model failures are visible and never replaced by fake predictions
- storage writes go through storage boundaries and preserve workspace ownership
- important timeline actions produce audit events
- production deploys and secret changes require owner approval
- AWS cost-impacting infrastructure changes are reviewed before deployment

## Open Threats

| Threat | Impact | Likelihood | Control | Owner | Status |
| --- | --- | --- | --- | --- | --- |
| Cross-workspace timeline access | one anonymous workspace reads or mutates another workspace's timelines | medium | signed session cookie plus workspace check in timeline storage/API path | project maintainers | active |
| Model service malformed response | UI shows misleading prediction or domain code stores invalid response | medium | typed adapter validation; fail visibly on malformed output | project maintainers | active |
| Model API key or Lambda invocation exposure | unauthorized model service calls | low | server-side only env/secrets/IAM; never expose key or invocation authority to browser | project maintainers | active |
| Actual pitch revealed early | replay loses trust by showing actual outcome before user reveal | medium | domain/UI state tests for reveal/advance behavior | project maintainers | active |
| AWS resources left running | avoidable monthly cost | high | review CDK changes, tag resources, remove idle resources, monitor budgets | project owner | active |
| Deleting durable state tables or retained database snapshots | irreversible loss of demo data | low | explicit owner decision before deleting state resources | project owner | active |

## Review Triggers

Review this threat model when adding or changing:

- session or workspace ownership
- timeline read/write behavior
- model service request/response schema
- model service authentication
- database schema, migrations, or retention
- AWS infrastructure, especially CloudFront, Lambda, DynamoDB, Secrets Manager,
  ECR, retained database snapshots, or any reintroduced VPC/NAT/database
  resources
- production deploy automation
- any new external side effect
