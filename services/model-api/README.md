# Pitch Sequence Model API

This service is the real-model boundary for Pitch Prediction App.

It intentionally exposes a product-shaped API rather than the raw `pitchpredict`
package API:

```text
GET  /health
GET  /ready
POST /v1/pitch/predict
```

The operator prepares each pitch moment and saves a normalized prediction in an
immutable replay edition. Neither browser navigation nor the web server invokes
this service.

`/health` is a public liveness check. `/ready` uses the same bearer-token
boundary as `/v1/pitch/predict` when model API authentication is enabled, so the
operator can verify authenticated inference before preparing an edition.

## Local Run

```bash
uv run uvicorn pitch_model_api.main:app --app-dir src --host 0.0.0.0 --port 8000
```

Useful environment:

```text
MODEL_API_KEY=optional-shared-service-token
PITCHPREDICT_ALGORITHM=xlstm
PITCHPREDICT_SAMPLE_SIZE=12
PITCHPREDICT_WARM_ON_STARTUP=false
```

`xlstm` downloads the public `baseball-analytica/pitchpredict-xlstm` checkpoint
through the `pitchpredict` package on first real prediction unless
`PITCHPREDICT_XLSTM_PATH` points to a local checkpoint directory. The Lambda
image pins and verifies that checkpoint at build time and exposes it through
`PITCHPREDICT_XLSTM_PATH`, so production requests never depend on a live
Hugging Face download. The Lambda image also installs only the xLSTM inference
dependencies and uses a narrow adapter instead of importing the package's
similarity/Statcast API. The general-purpose HTTP image retains the complete
`pitchpredict` dependency graph.

For deployed preparation, set `PITCHPREDICT_WARM_ON_STARTUP=true` and route
operator invokes through a published Lambda alias. The default serverless deployment
also enables Lambda SnapStart and sets
`PITCHPREDICT_INITIALIZE_FOR_SNAPSHOT=true`, so model loading and the warmup
prediction happen while the version snapshot is published rather than during a
user request. Outside Lambda's `snap-start` initialization phase, module import
still defers warmup to the first invocation.

The Lambda image uses Runtime Interface Client 4.x for the custom-image
SnapStart lifecycle and registers an after-restore hook that reseeds Python,
NumPy, and PyTorch randomness. The public low-cost deployment uses 1024 MB,
keeps provisioned concurrency at 0, and reserves concurrency at 1. SnapStart
and provisioned concurrency cannot be enabled together; a provisioned demo
deployment must explicitly set `MODEL_LAMBDA_SNAPSTART=0`. With warmup
disabled, `/ready` reports `loading` until at least one real prediction has
completed.

## Response Integrity

The contract includes `sampleSize`, `pitchMixSource` (`model` or `samples`), and
per-type velocity means with sample counts. Location is the mean of available
sample coordinates. Missing generated speeds stay null. Next-count probabilities
apply baseball rules per sample before grouping, including the difference between
a two-strike foul and a foul tip or bunt foul. Unknown pitch results fail explicitly.
No plate-appearance forecast is inferred from pitch-level outcome probabilities.

The normalizer retains full probability precision; the interface controls rounding.
Historical input imputation uses `DEFAULT_PITCH_SHAPES` for missing tracking fields;
those defaults are not observed actual measurements. Record the checkpoint,
normalizer revision, and sampling settings in the publication artifact identity.
