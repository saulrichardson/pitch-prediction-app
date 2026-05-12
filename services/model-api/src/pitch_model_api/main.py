from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Header, HTTPException, Request, status
from fastapi.responses import JSONResponse

from .config import Settings, settings_from_env
from .models import HealthResponse, PredictionRequest, PredictionResponse
from .runtime import PitchPredictRuntime


settings = settings_from_env()
runtime = PitchPredictRuntime(settings)


@asynccontextmanager
async def lifespan(_: FastAPI):
    await runtime.start()
    yield


app = FastAPI(
    title="Pitch Sequence Model API",
    version="0.1.0",
    lifespan=lifespan,
)


@app.exception_handler(HTTPException)
async def http_error_handler(_: Request, exc: HTTPException) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"error": exc.detail})


@app.get("/")
async def live() -> dict[str, str]:
    return {"status": "running", "service": "pitch-sequence-model-api"}


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return runtime.health()


def require_prediction_auth(authorization: str | None = Header(default=None)) -> None:
    require_service_auth(authorization, settings)


def require_service_auth(authorization: str | None, current_settings: Settings) -> None:
    if not current_settings.api_key:
        if current_settings.api_auth_required:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Model service authentication is not configured.")
        return
    expected = f"Bearer {current_settings.api_key}"
    if authorization != expected:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid model service credentials.")


@app.get("/ready")
async def ready(_: None = Depends(require_prediction_auth)) -> JSONResponse:
    health_status = runtime.health()
    status_code = status.HTTP_200_OK if health_status.status == "ok" else status.HTTP_503_SERVICE_UNAVAILABLE
    return JSONResponse(status_code=status_code, content=health_status.model_dump())


@app.post("/v1/pitch/predict", response_model=PredictionResponse)
async def predict_pitch(
    request: PredictionRequest,
    _: None = Depends(require_prediction_auth),
) -> PredictionResponse:
    return await runtime.predict(request)
