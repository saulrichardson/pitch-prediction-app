# Pitch Prediction App

Pitch Prediction App is a replay cockpit for next-pitch prediction. It loads a
real MLB game and uses the public
[pitchpredict-xlstm model](https://huggingface.co/baseball-analytica/pitchpredict-xlstm)
to produce a pre-pitch read before each actual result is shown. The user reveals
what actually happened, scores the model's read, and then advances to the next
pitch.

The current demo is intentionally focused on one repeatable loop:

```text
load latest Mets game
  -> show pre-pitch model read
  -> reveal the actual pitch
  -> compare model vs actual
  -> advance to the next pre-pitch read
```

Counterfactual branch/scenario analysis and manual situation entry may still
exist in older backend code, but they are not the main product surface for this
demo.

## What The App Does

The app answers a baseball question:

> Given the pitcher, batter, count, base state, score, inning, and recent pitch
> sequence, what is most likely on the next pitch?

On the first screen, the user starts a Mets replay. The app fetches public MLB
game data, builds a pitch-by-pitch timeline, and lands on the first pitch with
the actual result hidden.

For each pitch, the cockpit shows:

- the current game situation: inning, count, outs, score, bases, pitcher, batter
- the model's most likely pitch type and probability
- likely location, likely result, expected velocity, count impact, and plate
  appearance outlook
- a compact current-at-bat pitch log
- recent pitcher-pattern context when enough history exists

When the user clicks **Reveal Actual**, the app shows the real pitch that was
thrown and scores it against the model's pre-pitch read. The comparison includes
pitch-type rank, pitch-type probability, result probability, location miss, and
velocity miss when velocity data is available.

When the user clicks **Next Pitch**, the revealed pitch becomes part of the
known history. The app then recomputes the next model read from the updated game
state and sequence.

## The Model

The prediction service uses the public
[pitchpredict-xlstm model](https://huggingface.co/baseball-analytica/pitchpredict-xlstm).

The model is treated as a prediction source, not as the authority for game state.
The app asks the model for a product-shaped prediction, validates the response,
and then applies deterministic replay rules for reveal, advance, history, and
scoring.

The browser never calls the model service directly and never receives model
credentials. The web server owns the model-service call, validates the response,
and returns only the prediction and reveal data needed by the UI.

In the current AWS demo, CloudFront routes to the Next.js web/API app running
as a Lambda container through AWS Lambda Web Adapter. DynamoDB stores
replay/timeline state, and the web Lambda invokes the real model through an
IAM-scoped model Lambda. The deployed path avoids standing web compute,
database, VPC, and NAT gateway cost while keeping state durable enough for
shareable demo sessions.

## How It Works

The app has three important boundaries:

1. **Replay boundary**
   Public MLB game data is fetched and normalized into a pitch timeline. Future
   actual pitches stay hidden from the browser until the user reveals them.

2. **Model boundary**
   Before each reveal, the server sends the current pitch context and known pitch
   history to the model service. The response is validated before the UI sees it.

3. **Timeline boundary**
   The user moves through explicit states: forecast visible, actual hidden;
   actual revealed and scored; actual committed to history; next forecast ready.

That structure is deliberate. The product only works if the user can trust that
the model read was made before the actual pitch was exposed.

## Where To Look

Use this map when you want to understand or change a specific part of the app:

- `apps/web/src/components/pitch-sequence-lab.tsx`: the replay cockpit UI.
- `apps/web/src/app/api/`: the server routes used by the browser.
- `apps/web/src/lib/mlb-service.ts`: fetching MLB schedule and replay data.
- `apps/web/src/lib/model-service.ts`: the web app's model-service adapter.
- `apps/web/src/lib/timeline-service.ts`: application-level timeline commands.
- `apps/web/src/lib/timeline-dto.ts`: browser-safe timeline shaping and
  redaction.
- `packages/domain/src/mlb.ts`: MLB feed normalization.
- `packages/domain/src/timeline.ts`: replay timeline creation, reveal, advance,
  and branch-era domain logic.
- `packages/domain/src/state.ts`: baseball state helpers, scoring, and strike
  zone helpers.
- `services/model-api/`: the FastAPI service that wraps the pitch prediction
  model, plus the Lambda handler used by the AWS demo.
- `packages/db/`: DynamoDB storage for the deployed app, local memory storage,
  and legacy PostgreSQL storage adapters.
- `infra/`: CloudFront, Lambda Web Adapter, model Lambda integration, DynamoDB,
  Secrets Manager, ECR, and CDK deployment definitions.
- `scripts/verify-product-flows.mjs`: product-flow verification against a
  running app.
- `tests/e2e/`: browser-level smoke tests for the primary replay flow.

## Documentation Guide

The documentation set was used to keep the app focused while much of the code
was produced with coding-agent help. The docs are meant to make product intent,
engineering boundaries, and review expectations explicit.

Start here:

- `docs/product-intent.md`: the clearest product narrative. Read this first to
  understand what the app is supposed to do.
- `docs/project-profile.md`: project facts, selected stack, users, constraints,
  sensitive data, and non-goals.
- `docs/adr/0005-refocus-primary-ui-on-next-pitch-prediction.md`: why the
  primary UI became a simple next-pitch replay cockpit instead of a scenario
  simulator.
- `docs/architecture/system-map.md`: how user intent moves through UI, API,
  domain rules, model calls, persistence, and side effects.
- `docs/contracts/model-service.md`: what the model service may return, how
  failures should behave, and what the browser must never see.
- `docs/contracts/state-machines.md`: lifecycle expectations for reveal,
  advance, and timeline state.
- `docs/security/threat-model.md`: security assumptions and risks.

For engineering practice:

- `docs/engineering/doctrine.md`: the engineering philosophy behind the repo.
- `docs/engineering/agent-execution-protocol.md`: how coding agents should
  classify work, inspect context, make changes, verify, and report.
- `docs/engineering/definition-of-done.md`: what counts as finished for docs,
  UI, model boundaries, persistence, deployment, and security-sensitive changes.
- `docs/engineering/feature-development.md`: the checklist for turning product
  intent into a bounded feature.
- `docs/engineering/deployment-readiness.md`: the deployment gate for secrets,
  migrations, readiness, rollback, and operations.

## Engineering Philosophy

The app follows a high-integrity engineering style: behavior should be explicit,
bounded, testable, observable, and reviewable.

The main principles are:

- user input is useful but not automatically valid
- external data and model output are untrusted until validated
- frontend checks improve experience but do not provide security
- state changes should move through explicit transitions
- side effects should be controlled and auditable
- secrets should stay server-side
- production behavior should be reconstructable from durable records, logs,
  checks, or tests

Those principles matter here because the app combines public sports data, a real
model service, hidden future outcomes, and a UI designed to build trust in a
prediction loop. The code and docs should make it clear where each boundary is
enforced.

## Current Product Focus

The current product focus is the latest-Mets-game replay demo:

```text
start replay
  -> read model forecast
  -> reveal actual
  -> score the read
  -> advance
  -> repeat
```

Work that does not improve that loop should usually wait until the core demo is
stable, verified with the real model, and easy to explain.
