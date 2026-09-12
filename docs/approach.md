# Approach

## Selected Stack

- TypeScript, React 19, Next.js App Router and route handlers.
- Python/FastAPI, Pydantic, and the real pitchpredict xLSTM model.
- DynamoDB for deployed state; PostgreSQL when explicitly selected; memory for
  local development only.
- CloudFront with origin access control, a Lambda Web Adapter web container,
  and a separate model Lambda container managed by AWS CDK.
- Signed anonymous workspace cookies; no user-account service.
- Vitest, pytest, HTTP smoke checks, Playwright, type checks, ESLint, and builds.

## Architecture

```text
operator + completed MLB game
  -> normalize and select a complete 3–8-pitch at-bat
  -> build each pre-pitch model request
  -> acquire preparation lease + consume atomic model-attempt budget
  -> invoke real model; validate and save each response
  -> validate and save an immutable edition
  -> conditionally publish the featured-edition pointer

browser
  -> CloudFront / web route
  -> signed workspace session
  -> authoritative session read + immutable edition read
  -> pure cursor transition
  -> conditional revision write
  -> browser-safe replay view
```

The game browser adds an explicit preparation boundary: a validated completed
game request creates one shared `game-job` record. DynamoDB Streams delivers
queued records to a separate worker, which pins the current model alias to an
immutable version, checkpoints each forecast, and indexes the complete edition.
Duplicate requests and stream deliveries share one job and model lease. The
web role has no model invocation permission. The retired timeline-start
jobs, self-invoking worker, per-click inference, and mutable
process-cache persistence are absent from the active path.

## Ownership And Placement

- `packages/domain/src/replay.ts` owns edition selection and validation, replay
  commands, cursor transitions, redaction, and completion summaries.
- `packages/domain/src/state.ts` owns count rules, location labels, strike-zone
  estimates, and comparisons.
- `packages/domain/src/model.ts` and `validation.ts` own model boundary schemas.
- `packages/workflows/src/preparation.ts` owns inference leases, resumability, attempt
  budgets, immutable editions, and atomic publication.
- `apps/web/src/lib/replay-service.ts` owns workspace-scoped session operations.
- `packages/domain/src/catalog.ts` owns the seven-day window and spoiler-free
  schedule projection. `packages/workflows/src/catalog.ts` owns discovery and
  durable requests; `game-preparation.ts` owns worker state transitions.
- `infra/functions/prepare-game.ts` binds the stream and immutable model client.
- `packages/db/src/storage/` implements the same read/conditional-write contract
  for memory, DynamoDB, and PostgreSQL.
- `apps/web/src/components/replay/` owns interaction, recovery, formatting, and
  plotting; `pitch-sequence-lab.tsx` composes the experience.
- Model normalization stays in `services/model-api/`; MLB ingestion stays in
  `packages/workflows/src/mlb.ts` and the domain normalizer.

## Invariants

1. An edition contains one complete contiguous at-bat. A forecast never changes
   when a user revisits it. Edition IDs hash the game, selected facts, requests,
   contract, and operator-supplied model artifact identity. That identity must
   change when the checkpoint, normalizer, or sampling configuration changes.
2. The cursor is a step from zero through `2 * pitchCount - 1`. Even steps hide
   the actual; odd steps reveal it. The final reveal completes the replay.
3. Every command has a UUID and expected revision. The last acknowledged UUID
   is idempotent. Older requests conflict rather than overwrite a newer cursor.
4. DynamoDB reads are strongly consistent. All durable updates use conditional
   writes. Process memory never stands in for a failed durable write.
5. Sessions are scoped to the signed workspace and expire after 14 days. The
   URL identifies the edition; ownership always comes from the cookie.
6. Replay responses expose only the current forecast and already revealed
   actuals. Final scores, requests, and future actual pitches stay server-side.
7. POST origin checks use the viewer host set by the CloudFront viewer-request
   function. It replaces any supplied `x-forwarded-host` before origin forwarding.
8. Every replay response is `no-store`. Browser requests have a finite timeout;
   unacknowledged commands survive refresh and reuse the original UUID on retry.
9. Publication requires valid distributions, one model version, matching
   pre-pitch inputs, ordered historical context, and a 256 KB edition size limit.
   Failed or partial preparation never changes the featured pointer.
10. Preparation reserves one model attempt at a time in an atomic monthly
    counter: 20 per UTC day and 400 per UTC month. Failed invocations count.
    Saved successful forecasts are reused after interruption.

DynamoDB records use `REPLAY#<key>` / `RECORD`; PostgreSQL uses `replay_records`.
Legacy tables/records are retained and are not read by this runtime. SQL
migrations are an explicit deployment step, never work done by a web request.

## Display And Model Semantics

Forecast location is the mean of available model sample coordinates. Location
labels derive from coordinates in the catcher’s view; they do not assume the
batter’s inside/outside direction. The plot uses equal horizontal and vertical
units and a zone estimated only from earlier measurements. The current pitch’s
measured zone cannot reshape the pre-pitch forecast frame.

Pitch probabilities record model-distribution or sample provenance. Velocity is
an average of available matching-type samples, with its sample count. Sampled
zeros do not establish impossibility. Outcome and next-count distributions are
sample frequencies; ordinary two-strike fouls do not become strikeouts.

Historical model input still uses documented pitch-shape defaults when upstream
tracking fields are missing; that is input imputation, never an actual observed
measurement or a substitute model output. Model quality and probability
calibration require a separate evaluation across held-out games.

## Operations And Delivery

Featured publication is operator-driven. Game preparation is requested by the
user and delivered through the existing table's stream; there is no scheduler.
The preparation worker has concurrency 1, a 540-second timeout, and one-day
logs. It can invoke the model and access preparation/edition keys, but cannot
read or write workspace sessions or the featured pointer. A failed new edition leaves the last good edition available;
feature age is visible through the game date. Run the CLI with an immutable
model version/checkpoint and retain the review JSON.

The low-cost deployment keeps model reserved concurrency 1, provisioned
concurrency 0, web reserved concurrency 10, DynamoDB throughput limits, one-day
Lambda logs, and the configured CloudFront country allowlist. Web timeout is 30
seconds; the dedicated preparation worker runs separately. AWS budget alerts are
monitoring controls, not a hard billing cap. Model SnapStart/checkpoint packaging
remain the existing operating model and require actual AWS verification on
release.

The schedule cache lasts two minutes. Each date's small edition index lets the
picker avoid reading every prediction payload. The selected job is polled every
2.5 seconds while active. A ten-minute stale state exposes recovery; saved model
responses and the pinned version survive retries. Publication writes the full
validated edition before any ready index. Existing edition/session URLs continue
working when their game leaves the seven-day discovery window.

`/health` reports process liveness. `/ready` reads and validates the featured
edition in the configured storage; it returns 503 when the product cannot open
a replay. Model readiness is an operator concern and does not gate replay reads.

Expected checks:

```bash
npm run typecheck
npm test
npm run test:model
npm run lint
npm run build
npm run infra:synth
npm run verify:local
npm run verify:catalog
npm run test:e2e
```

CI provisions a disposable PostgreSQL instance for migration and storage
integration checks. The deterministic UI fixture is test-only and cannot be
loaded from the filesystem in a production web process. Test-file loading and
real-model generation are separate verification paths.

The [delivery runbook](records/2026-09-12-prepared-replay-delivery.md) defines the
model contract cutover, reviewed-edition bootstrap, publication checks, web
rollout, and rollback. The [September 12 production receipt](records/2026-09-12-production-release.md)
records the deployed images, real AWS edition, CI results, and live verification.
Older records describe prior architectures; the prepared-replay record supersedes
the async timeline job model for the active product.
