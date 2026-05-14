# ADR: Use Warmed Model Lambda Alias

- status: accepted
- date: 2026-05-13
- owners: project maintainers

## Context

The serverless web app creates timelines synchronously through CloudFront,
Lambda Web Adapter, and a server-side invoke of the model Lambda. CloudFront
gives the web origin a 60 second read timeout. A cold xLSTM model prediction can
take longer than that, so the web app can time out even though the model Lambda
eventually completes successfully.

The model Lambda also previously reported ready before a real prediction had
loaded the model when `PITCHPREDICT_WARM_ON_STARTUP=false`. That made readiness
look healthier than the next user action actually was.

## Decision

Production deploys publish the model Lambda to a `live` alias, configure
`PITCHPREDICT_WARM_ON_STARTUP=true`, and attach provisioned concurrency to that
alias. The model Lambda uses a longer timeout and larger memory allocation for
the warmup path so model download/load work happens during deployment instead
of during the user's first replay request. The web stack invokes the alias
target `pitch-sequence-model-lambda:live` rather than unqualified `$LATEST`.

The public deployment keeps two provisioned model environments and caps model
reserved concurrency at the same value. That favors predictable warmed service
for low public traffic and rejects excess overlap quickly instead of spilling
into cold model environments that can exceed the web timeout.

The model runtime reports `loading` until warmup or a successful prediction has
actually completed. It no longer marks itself ready immediately after building
the client.

## Rationale

This keeps the model boundary explicit and server-side while making readiness
match prediction capability. The browser still cannot invoke the model directly,
the web app still fails visibly when the model is unavailable, and deployment
now has a stable model target that can be warmed and rolled forward by version.

## Alternatives Considered

- Increase the web/model timeout. This does not solve CloudFront's 60 second
  origin limit and still leaves users waiting on cold model load.
- Return substitute predictions while the model warms. This violates the
  product contract that real predictions are required.
- Make timeline creation asynchronous with polling. That is a valid future
  architecture, but it is more product and API surface area than the current
  focused demo needs.

## Consequences

The app gets a more reliable first replay start and a readiness check that
reflects the real model. The tradeoff is a standing AWS cost for two
provisioned model execution environments with enough memory and timeout
headroom to load the xLSTM model. Users beyond that small warm pool may receive
a retryable model-busy response.

Future deploys must update the model alias before the web stack points traffic
at it. `scripts/deploy-model-lambda.sh` owns that operation in local deploys and
the GitHub deploy workflow.

## Verification

- model runtime tests prove readiness is not claimed before warmup
- deployed `/ready` returns `model=ok` against the warmed alias
- `npm run verify:product` passes against the deployed serverless URL
