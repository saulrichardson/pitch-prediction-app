from __future__ import annotations

import asyncio
import os
from typing import Any

from fastapi import HTTPException
from pydantic import ValidationError

from .config import settings_from_env
from .models import PredictionRequest
from .runtime import PitchPredictRuntime

_runtime: PitchPredictRuntime | None = None
_runtime_init_error: str | None = None


def configure_writable_runtime_dirs() -> None:
    """Keep third-party model/data caches out of Lambda's read-only home dir."""
    defaults = {
        "HOME": "/tmp",
        "XDG_CACHE_HOME": "/tmp/.cache",
        "HF_HOME": "/tmp/huggingface",
        "HUGGINGFACE_HUB_CACHE": "/tmp/huggingface/hub",
        "MPLCONFIGDIR": "/tmp/matplotlib",
        "TORCH_HOME": "/tmp/torch",
        "PYBASEBALL_CACHE": "/tmp/pybaseball-cache",
        "PITCHPREDICT_MODEL_DIR": "/tmp/pitchpredict-model",
        "PITCHPREDICT_CACHE_DIR": "/tmp/pitchpredict-cache",
        "PITCHPREDICT_LOG_DIR": "/tmp/pitchpredict-logs",
    }
    for name, value in defaults.items():
        if name == "HOME" or not os.environ.get(name):
            os.environ[name] = value
    for name in defaults:
        os.makedirs(os.environ[name], exist_ok=True)


async def _initialize_runtime() -> PitchPredictRuntime:
    configure_writable_runtime_dirs()
    runtime = PitchPredictRuntime(settings_from_env())
    await runtime.start()
    return runtime


def warm_on_startup_enabled() -> bool:
    return os.getenv("PITCHPREDICT_WARM_ON_STARTUP", "").lower() in {"1", "true", "yes", "on"}


if warm_on_startup_enabled():
    try:
        _runtime = asyncio.run(_initialize_runtime())
    except Exception as exc:
        _runtime_init_error = str(exc)


def handler(event: dict[str, Any], _context: Any) -> dict[str, Any]:
    """AWS Lambda direct-invoke adapter.

    The web app invokes this function through IAM, so the payload stays small
    and product-shaped: action + pitch moment in, validated prediction out.
    """
    return asyncio.run(_handle(event))


async def _handle(event: dict[str, Any]) -> dict[str, Any]:
    action = event.get("action")
    try:
        if action == "health":
            runtime = await _get_runtime()
            return {"ok": True, "health": runtime.health().model_dump(mode="json")}

        if action == "predict":
            runtime = await _get_runtime()
            request = PredictionRequest.model_validate(event.get("request"))
            prediction = await runtime.predict(request)
            return {"ok": True, "prediction": prediction.model_dump(mode="json")}

        return {
            "ok": False,
            "status": 400,
            "code": "invalid_model_action",
            "error": "Model Lambda action must be health or predict.",
        }
    except ValidationError as exc:
        return {
            "ok": False,
            "status": 400,
            "code": "invalid_prediction_request",
            "error": str(exc),
        }
    except HTTPException as exc:
        return {
            "ok": False,
            "status": exc.status_code,
            "code": "model_unavailable" if exc.status_code >= 500 else "model_request_failed",
            "error": str(exc.detail),
        }
    except Exception as exc:
        return {
            "ok": False,
            "status": 503,
            "code": "model_unavailable",
            "error": f"Model Lambda failed: {exc}",
        }


async def _get_runtime() -> PitchPredictRuntime:
    global _runtime, _runtime_init_error
    if _runtime is None:
        try:
            _runtime = await _initialize_runtime()
            _runtime_init_error = None
        except Exception as exc:
            _runtime_init_error = str(exc)
            raise HTTPException(status_code=503, detail=f"Model service failed to initialize: {_runtime_init_error}") from exc
    return _runtime
