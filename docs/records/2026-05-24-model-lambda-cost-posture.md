# Model Lambda Cost Posture

- date: 2026-05-24

## Context

After the serverless cutover, the largest application-specific ongoing cost was
provisioned concurrency for the model Lambda. Keeping one 4 GB model execution
environment warm during idle periods cost about 43 USD per month. Timeline
creation had already moved to async start jobs, so the product could tolerate a
visible first-request cold start.

## Record

Default the serverless model stack to on-demand Lambda:

- `MODEL_LAMBDA_PROVISIONED_CONCURRENCY=0` unless a deploy intentionally
  overrides it
- stable model invoke target remains the `live` alias
- `PITCHPREDICT_WARM_ON_STARTUP=true`
- default architecture and memory: `x86_64`, `1024 MB`
- `MODEL_LAMBDA_SNAPSTART=1`; the snapshot preloads the model when a version is
  published and costs about 4.03 USD for a continuously active 31-day month at
  1024 MB, plus low per-restore charges
- reserved concurrency: `1`
- async timeline start jobs and polling are the product-facing waiting boundary

For scheduled demos or review windows, provisioned concurrency may be enabled
intentionally:

```bash
MODEL_LAMBDA_SNAPSTART=0 MODEL_LAMBDA_PROVISIONED_CONCURRENCY=1 scripts/deploy-serverless-model.sh
```

Redeploy without the override after the demo to return to low-idle-cost mode.

## Evidence

- `scripts/deploy-serverless-model.sh` owns model-stack deployment.
- `infra/` owns model Lambda configuration.
- The UI exposes model-start progress rather than hiding cold start behind a
  generic loading state.
- Product verification must pass against the custom domain after model and web
  stack changes deploy.

## Future Guidance

Do not reintroduce standing model capacity by default without recording the cost
tradeoff and the user-facing reason. Delete superseded SnapStart versions so
their snapshots stop accruing cache charges. Keep readiness tied to real model
capability, not only to process startup.

The cold-start implementation details were updated on 2026-09-03; see
`2026-09-03-model-cold-start-path.md`.
