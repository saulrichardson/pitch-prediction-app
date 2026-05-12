# Model Service Contract

The pitch model service is a server-side prediction dependency. It is not a
product agent, and it does not own product state transitions.

## Owner Modules

- Web adapter: `apps/web/src/lib/model-service.ts`
- Model API service: `services/model-api/src/pitch_model_api/`
- Domain request/response types: `packages/domain/src/model.ts`
- Timeline caller: `apps/web/src/lib/timeline-service.ts`

## Boundary

```text
Pitch moment request
  -> server-side model service call
  -> validated prediction response
  -> deterministic timeline transition or visible failure
```

The browser must never call the model service directly and must never receive
`MODEL_API_KEY` or direct Lambda invocation authority.

## Inputs

The web app sends a typed pitch-moment request built by
`buildPredictionRequest`. The request represents:

- current game date and pitch number
- current pitcher, batter, count, inning, score, runners, and handedness
- pitch history known before the current reveal
- product-level fields needed to return a next-pitch prediction

Model requests must not include AWS secrets, database credentials, session
secrets, or raw infrastructure configuration.

## Outputs

The service returns a product-ready prediction response:

- stable prediction id
- model version
- pitch mix probabilities
- result mix probabilities
- count impact probabilities
- plate appearance forecast probabilities
- possible pitch summaries with pitch type, result, location, and probability

The web app treats this response as prediction data, not authority. Domain code
still decides whether a timeline can reveal, advance, branch, or terminate.

## Failure Behavior

Prediction-producing flows fail visibly when:

- the configured model backend is missing (`MODEL_BASE_URL` for HTTP mode or
  `MODEL_LAMBDA_FUNCTION_NAME` for Lambda mode)
- `/ready` cannot validate the same server-side model credentials used for
  prediction
- the model service is unhealthy or unavailable
- the model service times out
- authentication fails
- the response is malformed
- required prediction fields are missing or invalid

The app must not invent substitute predictions or silently fall back to mock
output.

## Side Effects

The model call itself is read/predict only. The web app may persist the
validated request/response pair as a `prediction_runs` row after a successful
response when durable storage mode is enabled.

## Observability

Important model events should be reconstructable from:

- model service health checks and authenticated readiness checks
- prediction request outcome logs
- `prediction_runs` records
- timeline audit events that explain what user-visible action requested the
  prediction

Logs must not include model API keys, database URLs, session secrets, or AWS
secret values.

## Verification

Changes to this boundary should verify:

- valid requests return a typed prediction response
- missing model configuration fails visibly
- unhealthy or timed-out model calls fail visibly
- malformed responses are rejected
- no mock prediction path is used by production flows
- browser-visible code cannot access model service credentials
