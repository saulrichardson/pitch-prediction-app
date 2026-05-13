# Pitch Sequence Model API

This service is the real-model boundary for Pitch Sequence Lab.

It intentionally exposes a product-shaped API rather than the raw `pitchpredict`
package API:

```text
GET  /health
GET  /ready
POST /v1/pitch/predict
```

The web app sends a pitch moment and receives a normalized prediction view model.
The browser never talks to this service directly.

`/health` is a public liveness check. `/ready` uses the same bearer-token
boundary as `/v1/pitch/predict` when model API authentication is enabled, so the
web app can prove authenticated predictions are possible before accepting
traffic.

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
`PITCHPREDICT_XLSTM_PATH` points to a local checkpoint directory.

For deployed product traffic, set `PITCHPREDICT_WARM_ON_STARTUP=true` and route
web invokes through a published Lambda alias with provisioned concurrency. With
warmup disabled, `/ready` reports `loading` until at least one real prediction
has completed.
