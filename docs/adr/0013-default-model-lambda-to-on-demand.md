# ADR: Default Model Lambda To On Demand

- status: accepted
- date: 2026-05-24
- owners: project maintainers

## Context

After the serverless cutover, the largest application-specific ongoing cost was
the model Lambda's provisioned concurrency:

```text
pitch-sequence-serverless-model-lambda:live
4096 MB
provisioned concurrency 1
```

That kept one 4 GB model execution environment warm even during idle periods.
Cost Explorer showed the provisioned concurrency line item at about `$1.44/day`,
or about `$43/month`.

Timeline creation is now asynchronous through durable start jobs, so the app no
longer has to finish the first model prediction inside the CloudFront origin
timeout. The UI can show model-start progress while the first cold request
initializes the model.

## Decision

Default the serverless model stack to on-demand Lambda by setting
`MODEL_LAMBDA_PROVISIONED_CONCURRENCY=0` unless a deploy explicitly overrides
it.

Keep:

- the `live` alias as the stable model invoke target
- `PITCHPREDICT_WARM_ON_STARTUP=true` so readiness and health still reflect the
  real model when an environment initializes
- reserved concurrency at `2` to cap expensive model fan-out
- async timeline start jobs and polling as the product-facing waiting boundary

For scheduled demos or review windows, provisioned concurrency can still be
enabled intentionally:

```bash
MODEL_LAMBDA_PROVISIONED_CONCURRENCY=1 scripts/deploy-serverless-model.sh
```

## Rationale

The app is low traffic and cost-sensitive. Paying continuously for one warm
model environment is not justified when the product can tolerate a first-request
cold start and explain it clearly. On-demand Lambda preserves the serverless
operating model and removes the main idle cost.

## Consequences

The first replay after a long idle period can wait while the model container
loads. The intro UI must make that state visible so users understand that the
real model is starting rather than the app being stuck.

Hot-path performance after the first request remains normal for as long as
Lambda keeps the execution environment warm. Later same-replay predictions can
still cold start if AWS recycles the environment, but the reserved concurrency
cap limits how many expensive model starts can occur at once.

## Verification

- unit tests cover cold-start preparation messaging
- deployed `/ready` must continue to report `model=ok`
- product verification must pass against the custom domain after the web and
  model stack changes deploy
