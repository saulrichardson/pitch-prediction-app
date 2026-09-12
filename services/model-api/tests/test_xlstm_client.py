import pytest

from pitch_model_api.xlstm_client import XlstmPredictionClient


class CapturingAlgorithm:
    def __init__(self) -> None:
        self.request = None

    async def predict_pitcher(self, request, **_kwargs):
        self.request = request
        return {"source": "xlstm"}


@pytest.mark.asyncio
async def test_xlstm_client_builds_the_upstream_request_without_full_api() -> None:
    algorithm = CapturingAlgorithm()
    client = XlstmPredictionClient(algorithm)

    result = await client.predict_pitcher(
        pitcher_id=477132,
        batter_id=592450,
        prev_pitches=[],
        algorithm="xlstm",
        sample_size=2,
    )

    assert result == {"source": "xlstm"}
    assert algorithm.request.pitcher_id == 477132
    assert algorithm.request.batter_id == 592450
    assert algorithm.request.prev_pitches == []
    assert algorithm.request.algorithm == "xlstm"
    assert algorithm.request.sample_size == 2
