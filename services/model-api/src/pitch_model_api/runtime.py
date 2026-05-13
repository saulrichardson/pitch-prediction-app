from __future__ import annotations

from importlib.metadata import PackageNotFoundError, version
from typing import Any

from fastapi import HTTPException

from .config import Settings
from .models import HealthResponse, PredictionRequest, PredictionResponse
from .normalizer import normalize_prediction, to_pitchpredict_request


class PitchPredictRuntime:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._client: Any | None = None
        self._loaded = False
        self._error: str | None = None

    @property
    def model_version(self) -> str:
        try:
            package_version = version("pitchpredict")
        except PackageNotFoundError:
            package_version = "unknown"
        return f"pitchpredict-{self.settings.algorithm}-v{package_version}"

    async def start(self) -> None:
        self._client = self._build_client()
        if self.settings.warm_on_startup:
            await self._warm()

    async def predict(self, request: PredictionRequest) -> PredictionResponse:
        if self._error:
            raise HTTPException(status_code=503, detail=f"Model service is unavailable: {self._error}")
        if not self._client:
            raise HTTPException(status_code=503, detail="Model service has not initialized.")
        if self.settings.warm_on_startup and not self._loaded:
            raise HTTPException(status_code=503, detail="Model service is still loading.")

        try:
            raw_request = to_pitchpredict_request(request, self.settings.algorithm, self.settings.sample_size)
            raw = await self._client.predict_pitcher(**raw_request)
            self._loaded = True
            return normalize_prediction(request, raw, self.model_version)
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"Model prediction failed: {exc}") from exc

    def health(self) -> HealthResponse:
        status = "error" if self._error else "ok" if self._loaded else "loading"
        return HealthResponse(
            status=status,  # type: ignore[arg-type]
            modelVersion=self.model_version,
            algorithm=self.settings.algorithm,
            loaded=self._loaded,
            error=self._error,
        )

    def _build_client(self) -> Any:
        from pitchpredict.api import PitchPredict, get_algorithm_by_name

        return PitchPredict(
            enable_cache=True,
            cache_dir=self.settings.cache_dir,
            enable_logging=True,
            log_dir=self.settings.log_dir,
            log_level_console="INFO",
            log_level_file="INFO",
            fuzzy_player_lookup=True,
            algorithms={self.settings.algorithm: get_algorithm_by_name(self.settings.algorithm)},
        )

    async def _warm(self) -> None:
        if not self._client:
            return
        try:
            await self._client.predict_pitcher(
                pitcher_id=477132,
                batter_id=592450,
                prev_pitches=[],
                algorithm=self.settings.algorithm,
                sample_size=max(1, min(2, self.settings.sample_size)),
                count_balls=0,
                count_strikes=0,
                outs=0,
                bases_state=0,
                score_bat=0,
                score_fld=0,
                inning=1,
                pitch_number=1,
                number_through_order=1,
                game_date="2024-06-15",
                strike_zone_top=3.5,
                strike_zone_bottom=1.5,
            )
            self._loaded = True
        except Exception as exc:
            self._error = str(exc)
