from __future__ import annotations

from typing import Any, Protocol


class PitcherPredictionAlgorithm(Protocol):
    async def predict_pitcher(self, request: Any, **kwargs: Any) -> Any: ...


class XlstmPredictionClient:
    """Narrow adapter that avoids importing PitchPredict's Statcast stack."""

    def __init__(self, algorithm: PitcherPredictionAlgorithm) -> None:
        self._algorithm = algorithm

    async def predict_pitcher(self, **request_fields: Any) -> Any:
        from pitchpredict.types.api import PredictPitcherRequest

        request = PredictPitcherRequest(**request_fields)
        return await self._algorithm.predict_pitcher(request=request)


def build_xlstm_client() -> XlstmPredictionClient:
    from .incremental_xlstm import IncrementalXlstmAlgorithm

    return XlstmPredictionClient(IncrementalXlstmAlgorithm(name="xlstm"))
