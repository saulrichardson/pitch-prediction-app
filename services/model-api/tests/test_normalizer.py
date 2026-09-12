from __future__ import annotations

import pytest

from pitch_model_api.models import PredictionRequest
from pitch_model_api.normalizer import normalize_prediction, to_pitchpredict_request


def request_payload(history=None):
    pitch = {
        "id": "p-1",
        "paId": "game-42-pa-1",
        "pitchNumber": 1,
        "gamePitchIndex": 0,
        "source": "actual",
        "pitchType": "FF",
        "result": "called_strike",
        "location": {"px": 0.1, "pz": 2.6, "zone": 5, "label": "Middle"},
        "shape": {
            "velocity": 96.2,
            "spin": 2310,
            "release": {"x0": -1.7, "z0": 5.8, "extension": 6.4},
            "movement": {"vx0": -6.0, "vy0": -138.0, "vz0": -4.0, "ax": -9.0, "ay": 26.0, "az": -18.0, "spinAxis": 205.0},
        },
        "preState": {
            "inning": 1,
            "half": "top",
            "count": {"balls": 0, "strikes": 0},
            "outs": 0,
            "bases": {"first": False, "second": False, "third": False},
            "awayScore": 0,
            "homeScore": 0,
        },
        "postState": {
            "inning": 1,
            "half": "top",
            "count": {"balls": 0, "strikes": 1},
            "outs": 0,
            "bases": {"first": False, "second": False, "third": False},
            "awayScore": 0,
            "homeScore": 0,
        },
        "matchup": {
            "pitcherId": "518876",
            "pitcherName": "Merrill Kelly",
            "pitcherHand": "R",
            "batterId": "665742",
            "batterName": "Juan Soto",
            "batterSide": "L",
        },
        "description": "Called Strike",
    }
    return {
        "pitcherId": "518876",
        "batterId": "665742",
        "pitcherHand": "R",
        "batterSide": "L",
        "gameDate": "2026-05-08",
        "count": {"balls": 0, "strikes": 0},
        "outs": 0,
        "bases": {"first": False, "second": False, "third": False},
        "score": {"away": 0, "home": 0},
        "inning": 1,
        "half": "top",
        "pitchNumber": 1,
        "timesThroughOrder": 1,
        "strikeZone": {"top": 3.5, "bottom": 1.5},
        "pitcherSessionHistory": history if history is not None else [pitch],
        "currentPaHistory": history if history is not None else [pitch],
    }


def raw_model_response():
    return {
        "basic_pitch_data": {
            "pitch_type_probs": {"FF": 0.42, "SL": 0.24, "ST": 0.12, "CH": 0.10},
            "pitch_speed_mean": 92.1,
            "pitch_x_mean": 0.2,
            "pitch_z_mean": 2.4,
        },
        "basic_outcome_data": {"outcome_probs": {"strike": 0.5, "ball": 0.3, "contact": 0.2}},
        "pitches": [
            {"pitch_type": "FF", "speed": 96.1, "plate_pos_x": 0.1, "plate_pos_z": 2.5, "result": "called_strike"},
            {"pitch_type": "SL", "speed": 86.4, "plate_pos_x": 0.8, "plate_pos_z": 1.4, "result": "swinging_strike"},
            {"pitch_type": "CH", "speed": 88.8, "plate_pos_x": -0.4, "plate_pos_z": 1.2, "result": "ball"},
            {"pitch_type": "ST", "speed": 82.0, "plate_pos_x": 1.1, "plate_pos_z": 2.1, "result": "hit_into_play"},
        ],
    }


def test_converts_pitch_moment_to_pitchpredict_request_with_history():
    request = PredictionRequest.model_validate(request_payload())
    converted = to_pitchpredict_request(request, algorithm="xlstm", sample_size=12)

    assert converted["pitcher_id"] == 518876
    assert converted["batter_id"] == 665742
    assert converted["algorithm"] == "xlstm"
    assert converted["sample_size"] == 12
    assert converted["prev_pitches"][0]["pa_id"] > 0
    assert converted["prev_pitches"][0]["pitch_type"] == "FF"
    assert converted["prev_pitches"][0]["result"] == "called_strike"


def test_normalizes_real_model_response_to_product_prediction():
    request = PredictionRequest.model_validate(request_payload())
    response = normalize_prediction(request, raw_model_response(), "pitchpredict-xlstm-v0.5.0")

    assert response.modelVersion == "pitchpredict-xlstm-v0.5.0"
    assert response.pitchMix[0].label == "FF"
    assert any(item.label == "Other" for item in response.pitchMix)
    assert response.location.expected.label == "Low right"
    assert response.location.expected.px == 0.4
    assert response.location.expected.pz == 1.8
    assert response.pitchMixSource == "model"
    assert len(response.possiblePitches) == 4
    assert response.possiblePitches[0].description
    assert [item.label for item in response.resultMix] == [
        "Strike/Foul",
        "Ball",
        "Ball In Play",
        "HBP / Other",
    ]
    assert [item.label for item in response.countImpact] == [
        "0-1",
        "1-0",
        "Ball in play",
    ]
    assert response.sampleSize == 4
    assert sum(item.probability for item in response.resultMix) == pytest.approx(1.0, abs=0.002)
    assert sum(item.probability for item in response.countImpact) == pytest.approx(1.0, abs=0.002)


def test_derives_pitch_mix_from_sampled_pitches_when_probability_table_is_missing():
    request = PredictionRequest.model_validate(request_payload())
    raw = raw_model_response()
    raw["basic_pitch_data"]["pitch_type_probs"] = {}

    response = normalize_prediction(request, raw, "pitchpredict-xlstm-v0.5.0")

    assert {item.label for item in response.pitchMix} >= {"FF", "SL", "CH", "Other"}
    assert sum(item.probability for item in response.pitchMix) == pytest.approx(1.0, abs=0.002)


def test_rejects_raw_model_response_without_possible_pitches():
    request = PredictionRequest.model_validate(request_payload(history=[]))
    with pytest.raises(ValueError, match="no concrete possible pitches"):
        normalize_prediction(request, {"basic_pitch_data": {}, "pitches": []}, "pitchpredict-xlstm-v0.5.0")


@pytest.mark.parametrize("result, expected", [("foul", "1-2"), ("foul_tip", "Strikeout"), ("foul_bunt", "Strikeout"), ("swinging_strike", "Strikeout")])
def test_two_strike_count_forecasts_preserve_real_result_rules(result, expected):
    payload = request_payload([])
    payload["count"] = {"balls": 1, "strikes": 2}
    raw = {"pitches": [{"pitch_type": "FF", "speed": 95, "plate_pos_x": 0, "plate_pos_z": 2.5, "result": result}] * 8}
    response = normalize_prediction(PredictionRequest(**payload), raw, "test-model")
    assert [(p.label, p.probability) for p in response.countImpact] == [(expected, 1.0)]
    assert "paForecast" not in response.model_dump()


def test_velocity_uses_all_samples_of_the_same_pitch_type():
    raw = raw_model_response()
    raw["pitches"].append({**raw["pitches"][0], "speed": 93.9})
    response = normalize_prediction(PredictionRequest(**request_payload([])), raw, "test-model")
    estimate = next(v for v in response.velocity if v.pitchType == "FF")
    assert estimate.mean == 95.0
    assert estimate.sampleCount == 2


def test_unknown_result_fails_instead_of_becoming_a_called_strike():
    raw = raw_model_response()
    raw["pitches"][0]["result"] = "unknown_result"
    with pytest.raises(ValueError, match="Unsupported"):
        normalize_prediction(PredictionRequest(**request_payload([])), raw, "test-model")


def test_missing_generated_measurements_are_not_replaced_with_typical_values():
    request = PredictionRequest.model_validate(request_payload())
    raw = {"pitches": [{"pitch_type": "FF", "result": "ball"}]}
    response = normalize_prediction(request, raw, "test")
    assert response.pitchMixSource == "samples"
    assert response.velocity == []
    assert response.possiblePitches[0].velocity is None
    assert response.location.expected.px is None
    assert response.location.expected.pz is None
    assert response.location.expected.label == "Untracked"


def test_preserves_small_probabilities_without_rounding_them_to_zero():
    request = PredictionRequest.model_validate(request_payload())
    raw = raw_model_response()
    raw["basic_pitch_data"]["pitch_type_probs"] = {"FF": .9999, "SL": .0001}
    response = normalize_prediction(request, raw, "test")
    assert next(item.probability for item in response.pitchMix if item.label == "SL") == .0001
