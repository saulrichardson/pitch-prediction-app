# Pitch Prediction App

[Public app](https://baseball.saulrichardson.io) · [xLSTM model](https://huggingface.co/baseball-analytica/pitchpredict-xlstm)

Read a real MLB at-bat, one pitch at a time. See the model’s forecast, reveal the
actual pitch, and move to the next read. The entire at-bat is prepared before it
is published, so navigation never needs to generate a prediction.

The interface has one primary action, a shared forecast/actual strike zone, a
compact scoreboard, and optional forecast detail. Back, refresh, retry, and
replay preserve the same predictions. An anonymous signed cookie owns your place;
no account is needed.

## Run a real replay locally

Requires Node 24+, npm 11+, Python, and `uv`.

```bash
npm ci
# In one terminal, start the real model service:
PITCHPREDICT_ALGORITHM=xlstm PITCHPREDICT_SAMPLE_SIZE=8 \
  uv run --directory services/model-api uvicorn pitch_model_api.main:app \
  --app-dir src --host 127.0.0.1 --port 8000
```

In another terminal, prepare and save a complete edition:

```bash
MODEL_BACKEND=http MODEL_BASE_URL=http://127.0.0.1:8000 \
  npm run prepare:replay -- \
  --model-artifact '<immutable checkpoint + normalizer revision + sample settings>' \
  --output .cache/replay.json

REPLAY_EDITION_PATH="$PWD/.cache/replay.json" \
  SESSION_SECRET=local-development-secret npm run dev
```

The publisher selects the first complete at-bat of 3–8 pitches from the latest
completed Mets game in the past 21 days. `--game <MLB gamePk>` selects a specific
completed game. Selection never uses prediction accuracy or a desirable outcome.
Local preparation saves each successful forecast in `.cache/replay-preparation`;
retrying resumes partial work. Keep the same artifact identifier when retrying.
A new model, normalizer, or sampling configuration requires a new identifier.

The artifact identifier records operator provenance. It is not a cryptographic
attestation of the remote runtime; use an immutable Lambda version or pinned
checkpoint and retain the saved requests and responses for review.

## Verify

```bash
npm run typecheck
npm test
npm run test:model
npm run lint
npm run build
npm run infra:synth
npm run verify:local
npm run test:e2e
```

`verify:local` starts an isolated local web server with a clearly marked test
edition, exercises the HTTP workflow, and shuts it down. `test:e2e` covers
laptop and phone layouts, navigation, completion, refresh, offline retry, and a
lost response. It uses the same deterministic fixture; it does not call a model.
Install its browser once with `npx playwright install chromium`.

For real-model verification, start the web app with a prepared real edition and
run `BASE_URL=http://localhost:3000 npm run verify:product`. This checks ownership,
redaction, idempotency, concurrency, completion, and command latency without
invoking the model. The default maximum command latency is 2 seconds; override
`VERIFY_MAX_COMMAND_MS` only for an explicit environment requirement.

PostgreSQL integration checks run when `TEST_POSTGRES_URL` points to a disposable,
already migrated database. CI provisions one. Run migrations explicitly with
`DATABASE_URL=... npm run db:migrate`; web requests never apply migrations.

## Publish and deliver

Review the saved edition before moving the featured pointer:

```bash
STORAGE_MODE=dynamodb DYNAMODB_TABLE_NAME=pitch-sequence-serverless-state \
  npm run publish:replay -- --input .cache/replay.json

STORAGE_MODE=dynamodb DYNAMODB_TABLE_NAME=pitch-sequence-serverless-state \
  npm run publish:replay -- --check
```

A known edition can be restored with `--edition <saved-id>`. Publication is a
conditional pointer update; existing sessions stay attached to their edition.
Test fixtures are rejected by the publication CLI. The operator can also use
`prepare:replay --publish` with durable storage when review is handled by the
operator’s workflow.

Follow [the delivery runbook](docs/records/2026-09-12-prepared-replay-delivery.md)
for the first production cutover. Deploy the model contract, prepare and publish
a valid edition, then deploy the web application. Existing production timelines
use the old contract and will start a new replay after cutover; their historical
records are retained. The repository refactor does not itself update production.

## Architecture

- `apps/web/src/components/pitch-sequence-lab.tsx`: the comparison interface.
- `apps/web/src/components/replay/`: interaction, recovery, formatting, and plot.
- `packages/domain/src/replay.ts`: immutable editions, cursor transitions,
  publication validation, and browser response shaping.
- `apps/web/src/lib/replay-service.ts`: workspace ownership and conditional writes.
- `packages/db/src/storage/`: authoritative DynamoDB, PostgreSQL, and local memory adapters.
- `scripts/lib/preparation.ts`: resumable inference, lease, budget, and publication.
- `services/model-api/`: real xLSTM inference and normalization.
- `infra/`: CloudFront, web Lambda, DynamoDB, and separate model Lambda stacks.

Public routes are `/api/replays` and `/api/replays/[id]`. The web Lambda has no
model invocation permission. Every prediction is saved with its pre-pitch input;
future actuals remain on the server until reveal. The default operator budget is
20 model attempts per UTC day and 400 per UTC month, enforced atomically by the
chosen storage. Public replay navigation consumes no model budget.

The deployment retains on-demand model concurrency 1, provisioned concurrency 0,
web concurrency 10, bounded DynamoDB throughput, one-day logs, CloudFront origin
access control, and the configured geography. Those controls constrain usage;
they are not a billing guarantee.

See [product intent](docs/product-intent.md), [approach](docs/approach.md), and
[project records](docs/records/) for the current operating model and rationale.
