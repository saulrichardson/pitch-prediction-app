from __future__ import annotations

from datetime import datetime, timezone
from math import isfinite
from typing import Any
from uuid import uuid4

from .models import (
    BaseState,
    LocationBucket,
    PitchEvent,
    PitchLocation,
    PitchResult,
    PitchType,
    PredictionRequest,
    PredictionResponse,
    Probability,
    PossiblePitch,
)


PRODUCT_PITCH_TYPES: tuple[PitchType, ...] = ("FF", "SI", "SL", "CH", "CU", "FC", "FS", "Other")
MODEL_OTHER_PITCH = "UN"

LOCATION_BUCKETS: tuple[LocationBucket, ...] = (
    "Up In",
    "Up Middle",
    "Up Away",
    "Middle In",
    "Middle",
    "Middle Away",
    "Low In",
    "Low Middle",
    "Low Away",
    "Chase Low",
    "Chase Away",
    "Waste",
)

DEFAULT_PITCH_SHAPES: dict[str, dict[str, float]] = {
    "FF": {"speed": 95.0, "spin_rate": 2300.0, "spin_axis": 205.0, "release_pos_x": -1.8, "release_pos_z": 5.8, "release_extension": 6.2, "vx0": -6.0, "vy0": -138.0, "vz0": -4.0, "ax": -9.0, "ay": 26.0, "az": -18.0},
    "SI": {"speed": 94.0, "spin_rate": 2200.0, "spin_axis": 220.0, "release_pos_x": -1.8, "release_pos_z": 5.7, "release_extension": 6.2, "vx0": -7.0, "vy0": -136.0, "vz0": -4.5, "ax": -14.0, "ay": 25.0, "az": -20.0},
    "SL": {"speed": 86.0, "spin_rate": 2450.0, "spin_axis": 90.0, "release_pos_x": -1.7, "release_pos_z": 5.6, "release_extension": 6.0, "vx0": -3.0, "vy0": -125.0, "vz0": -3.0, "ax": 2.0, "ay": 22.0, "az": -30.0},
    "CH": {"speed": 87.0, "spin_rate": 1750.0, "spin_axis": 235.0, "release_pos_x": -1.8, "release_pos_z": 5.7, "release_extension": 6.3, "vx0": -7.0, "vy0": -126.0, "vz0": -4.0, "ax": -12.0, "ay": 24.0, "az": -24.0},
    "CU": {"speed": 79.0, "spin_rate": 2550.0, "spin_axis": 45.0, "release_pos_x": -1.6, "release_pos_z": 5.8, "release_extension": 5.9, "vx0": -2.0, "vy0": -115.0, "vz0": 0.0, "ax": 1.0, "ay": 20.0, "az": -40.0},
    "FC": {"speed": 90.0, "spin_rate": 2350.0, "spin_axis": 180.0, "release_pos_x": -1.7, "release_pos_z": 5.7, "release_extension": 6.1, "vx0": -5.0, "vy0": -131.0, "vz0": -3.5, "ax": -4.0, "ay": 24.0, "az": -22.0},
    "FS": {"speed": 88.0, "spin_rate": 1500.0, "spin_axis": 230.0, "release_pos_x": -1.8, "release_pos_z": 5.7, "release_extension": 6.2, "vx0": -6.0, "vy0": -128.0, "vz0": -4.5, "ax": -8.0, "ay": 23.0, "az": -27.0},
    "UN": {"speed": 86.0, "spin_rate": 2100.0, "spin_axis": 180.0, "release_pos_x": -1.7, "release_pos_z": 5.7, "release_extension": 6.0, "vx0": -4.0, "vy0": -125.0, "vz0": -3.0, "ax": -4.0, "ay": 22.0, "az": -25.0},
}


def to_pitchpredict_request(request: PredictionRequest, algorithm: str, sample_size: int) -> dict[str, Any]:
    return {
        "pitcher_id": parse_mlbam_id(request.pitcherId, "pitcherId"),
        "batter_id": parse_mlbam_id(request.batterId, "batterId"),
        "prev_pitches": [to_pitchpredict_pitch(pitch) for pitch in request.pitcherSessionHistory],
        "algorithm": algorithm,
        "sample_size": sample_size,
        "pitcher_throws": hand_or_none(request.pitcherHand),
        "batter_hits": hand_or_none(request.batterSide),
        "count_balls": request.count.balls,
        "count_strikes": request.count.strikes,
        "outs": request.outs,
        "bases_state": bases_state(request.bases),
        "score_bat": request.score.away if request.half == "top" else request.score.home,
        "score_fld": request.score.home if request.half == "top" else request.score.away,
        "inning": request.inning,
        "pitch_number": max(1, request.pitchNumber),
        "number_through_order": max(1, request.timesThroughOrder),
        "game_date": request.gameDate[:10],
        "strike_zone_top": request.strikeZone.top,
        "strike_zone_bottom": request.strikeZone.bottom,
    }


def to_pitchpredict_pitch(pitch: PitchEvent) -> dict[str, Any]:
    model_pitch = model_pitch_type(pitch.pitchType)
    defaults = DEFAULT_PITCH_SHAPES[model_pitch]
    movement = pitch.shape.movement or {}
    release = pitch.shape.release or {}
    state = pitch.preState
    return {
        "pitch_type": model_pitch,
        "speed": finite_or(pitch.shape.velocity, defaults["speed"]),
        "spin_rate": finite_or(pitch.shape.spin, defaults["spin_rate"]),
        "spin_axis": finite_or(value_at(movement, "spinAxis", "spinDirection"), defaults["spin_axis"]),
        "release_pos_x": finite_or(value_at(release, "x0", "releasePosX"), defaults["release_pos_x"]),
        "release_pos_z": finite_or(value_at(release, "z0", "releasePosZ"), defaults["release_pos_z"]),
        "release_extension": finite_or(value_at(release, "extension", "releaseExtension"), defaults["release_extension"]),
        "vx0": finite_or(value_at(movement, "vx0", "vX0"), defaults["vx0"]),
        "vy0": finite_or(value_at(movement, "vy0", "vY0"), defaults["vy0"]),
        "vz0": finite_or(value_at(movement, "vz0", "vZ0"), defaults["vz0"]),
        "ax": finite_or(value_at(movement, "ax", "aX"), defaults["ax"]),
        "ay": finite_or(value_at(movement, "ay", "aY"), defaults["ay"]),
        "az": finite_or(value_at(movement, "az", "aZ"), defaults["az"]),
        "plate_pos_x": finite_or(pitch.location.px, 0.0),
        "plate_pos_z": finite_or(pitch.location.pz, 2.5),
        "result": model_result(pitch.result),
        "pa_id": stable_positive_id(pitch.paId),
        "batter_id": int(pitch.matchup.batterId) if pitch.matchup.batterId.isdigit() else None,
        "batter_hits": hand_or_none(pitch.matchup.batterSide),
        "count_balls": state.count.balls,
        "count_strikes": state.count.strikes,
        "outs": state.outs,
        "bases_state": bases_state(state.bases),
        "score_bat": state.awayScore if state.half == "top" else state.homeScore,
        "score_fld": state.homeScore if state.half == "top" else state.awayScore,
        "inning": state.inning,
        "pitch_number": max(1, pitch.pitchNumber),
        "number_through_order": max(1, pitch.gamePitchIndex // 18 + 1),
    }


def normalize_prediction(request: PredictionRequest, raw: Any, model_version: str) -> PredictionResponse:
    raw_dict = raw.model_dump() if hasattr(raw, "model_dump") else dict(raw)
    pitches = [pitch.model_dump() if hasattr(pitch, "model_dump") else dict(pitch) for pitch in raw_dict.get("pitches", [])]
    if not pitches:
        raise ValueError("Real model returned no concrete possible pitches.")

    basic_pitch_data = raw_dict.get("basic_pitch_data") or {}
    basic_outcome_data = raw_dict.get("basic_outcome_data") or {}
    pitch_mix = pitch_mix_from_probs(basic_pitch_data.get("pitch_type_probs") or {}) or pitch_mix_from_pitches(pitches)
    result_mix = result_mix_from_pitches(pitches) or result_mix_from_outcomes(basic_outcome_data.get("outcome_probs") or {})
    density = location_density(pitches)
    expected = expected_location(
        basic_pitch_data.get("pitch_x_mean"),
        basic_pitch_data.get("pitch_z_mean"),
        pitches,
    )
    possible_pitches = possible_pitch_events(pitches)
    if not possible_pitches:
        raise ValueError("Real model returned no product-usable possible pitch events.")

    return PredictionResponse(
        id=f"real-{uuid4()}",
        modelVersion=model_version,
        pitchMix=pitch_mix,
        resultMix=result_mix,
        location={"density": density, "expected": expected},
        countImpact=count_impact(request, result_mix),
        paForecast=pa_forecast(request, result_mix),
        expectedPitchesRemaining=expected_pitches_remaining(request, result_mix),
        possiblePitches=possible_pitches[:4],
        createdAt=datetime.now(timezone.utc).isoformat(),
    )


def pitch_mix_from_probs(probs: dict[str, Any]) -> list[Probability]:
    merged: dict[str, float] = {label: 0.0 for label in PRODUCT_PITCH_TYPES}
    for label, probability in probs.items():
        merged[product_pitch_type(str(label))] += finite_or(probability, 0.0)
    items = [Probability(label=label, probability=prob) for label, prob in merged.items() if prob > 0]
    return normalize_probabilities(items) if items else []


def pitch_mix_from_pitches(pitches: list[dict[str, Any]]) -> list[Probability]:
    counts: dict[str, float] = {label: 0.0 for label in PRODUCT_PITCH_TYPES}
    for pitch in pitches:
        counts[product_pitch_type(str(pitch.get("pitch_type", MODEL_OTHER_PITCH)))] += 1.0
    return normalize_probability_map(counts)


def result_mix_from_pitches(pitches: list[dict[str, Any]]) -> list[Probability]:
    counts = {"Ball": 0.0, "Strike/Foul": 0.0, "Ball In Play": 0.0, "HBP / Other": 0.0}
    for pitch in pitches:
        counts[result_summary(product_result(str(pitch.get("result", "called_strike"))))] += 1.0
    return normalize_probability_map_preserving_labels(counts)


def result_mix_from_outcomes(outcomes: dict[str, Any]) -> list[Probability]:
    items = [
        Probability(label="Ball", probability=finite_or(outcomes.get("ball"), 0.0)),
        Probability(label="Strike/Foul", probability=finite_or(outcomes.get("strike"), 0.0)),
        Probability(label="Ball In Play", probability=finite_or(outcomes.get("contact"), 0.0)),
        Probability(label="HBP / Other", probability=finite_or(outcomes.get("hit_by_pitch"), 0.0)),
    ]
    return normalize_probabilities_preserving_labels(items)


def location_density(pitches: list[dict[str, Any]]) -> list[Probability]:
    counts: dict[str, float] = {label: 0.0 for label in LOCATION_BUCKETS}
    for pitch in pitches:
        location = location_from_coordinates(pitch.get("plate_pos_x"), pitch.get("plate_pos_z"))
        counts[location.label] += 1.0
    return normalize_probability_map(counts)


def expected_location(px: Any, pz: Any, pitches: list[dict[str, Any]]) -> PitchLocation:
    x = finite_or(px, None)
    z = finite_or(pz, None)
    if x is None and pitches:
        x = sum(finite_or(pitch.get("plate_pos_x"), 0.0) for pitch in pitches) / len(pitches)
    if z is None and pitches:
        z = sum(finite_or(pitch.get("plate_pos_z"), 2.5) for pitch in pitches) / len(pitches)
    return location_from_coordinates(x, z)


def possible_pitch_events(pitches: list[dict[str, Any]]) -> list[PossiblePitch]:
    result: list[PossiblePitch] = []
    seen: set[tuple[str, str, str]] = set()
    for pitch in pitches:
        pitch_type = product_pitch_type(str(pitch.get("pitch_type", "UN")))
        location = location_from_coordinates(pitch.get("plate_pos_x"), pitch.get("plate_pos_z"))
        pitch_result = product_result(str(pitch.get("result", "called_strike")))
        key = (pitch_type, location.label, pitch_result)
        if key in seen:
            continue
        seen.add(key)
        velocity = finite_or(pitch.get("speed"), DEFAULT_PITCH_SHAPES[model_pitch_type(pitch_type)]["speed"])
        result.append(PossiblePitch(
            pitchType=pitch_type,
            velocity=round(velocity, 1),
            location=location,
            result=pitch_result,
            description=f"{pitch_type} {round(velocity, 1)} {location.label.lower()}, {result_description(pitch_result)}",
        ))
    return result


def count_impact(request: PredictionRequest, result_mix: list[Probability]) -> list[Probability]:
    balls = request.count.balls
    strikes = request.count.strikes
    ball = probability_for(result_mix, "Ball")
    strike = probability_for(result_mix, "Strike/Foul")
    contact = probability_for(result_mix, "Ball In Play")
    hbp = probability_for(result_mix, "HBP / Other")
    return normalize_probabilities_preserving_labels([
        Probability(label="Walk" if balls == 3 else f"{min(3, balls + 1)}-{strikes}", probability=ball),
        Probability(label="Strikeout" if strikes == 2 else f"{balls}-{min(2, strikes + 1)}", probability=strike),
        Probability(label="Ball in play", probability=contact),
        Probability(label="Hit by pitch", probability=hbp),
    ])


def pa_forecast(request: PredictionRequest, result_mix: list[Probability]) -> list[Probability]:
    balls = request.count.balls
    strikes = request.count.strikes
    ball = probability_for(result_mix, "Ball")
    strike = probability_for(result_mix, "Strike/Foul")
    contact = probability_for(result_mix, "Ball In Play")
    hbp = probability_for(result_mix, "HBP / Other")
    walk = ball if balls == 3 else ball * (0.1 + balls * 0.18)
    strikeout = strike if strikes == 2 else strike * (0.12 + strikes * 0.22)
    alive = max(0.0, 1.0 - contact - hbp - walk - strikeout)
    return normalize_probabilities_preserving_labels([
        Probability(label="Strikeout", probability=strikeout),
        Probability(label="Walk", probability=walk),
        Probability(label="Ball in play", probability=contact),
        Probability(label="Hit by pitch", probability=hbp),
        Probability(label="Still alive after 8 pitches", probability=alive * 0.45),
    ])


def expected_pitches_remaining(request: PredictionRequest, result_mix: list[Probability]) -> float:
    terminal = probability_for(result_mix, "Ball In Play") + probability_for(result_mix, "HBP / Other")
    if request.count.balls == 3:
        terminal += probability_for(result_mix, "Ball")
    if request.count.strikes == 2:
        terminal += probability_for(result_mix, "Strike/Foul") * 0.65
    return round(max(1.0, min(8.0, 1.0 + (1.0 - terminal) * 3.5)), 1)


def normalize_probabilities(items: list[Probability]) -> list[Probability]:
    positive = [Probability(label=item.label, probability=max(0.0, float(item.probability))) for item in items]
    total = sum(item.probability for item in positive)
    if total <= 0:
        raise ValueError("Prediction probability distribution is empty.")
    normalized = [Probability(label=item.label, probability=round(item.probability / total, 3)) for item in positive if item.probability > 0]
    return sorted(normalized, key=lambda item: item.probability, reverse=True)


def normalize_probabilities_preserving_labels(items: list[Probability]) -> list[Probability]:
    positive = [Probability(label=item.label, probability=max(0.0, float(item.probability))) for item in items]
    total = sum(item.probability for item in positive)
    if total <= 0:
        raise ValueError("Prediction probability distribution is empty.")
    normalized = [
        Probability(label=item.label, probability=round(item.probability / total, 3))
        for item in positive
    ]
    return sorted(normalized, key=lambda item: item.probability, reverse=True)


def normalize_probability_map(values: dict[str, float]) -> list[Probability]:
    total = sum(max(0.0, float(value)) for value in values.values())
    if total <= 0:
        raise ValueError("Prediction probability distribution is empty.")
    return sorted(
        [
            Probability(label=label, probability=round(max(0.0, float(value)) / total, 3))
            for label, value in values.items()
            if value > 0
        ],
        key=lambda item: item.probability,
        reverse=True,
    )


def normalize_probability_map_preserving_labels(values: dict[str, float]) -> list[Probability]:
    total = sum(max(0.0, float(value)) for value in values.values())
    if total <= 0:
        raise ValueError("Prediction probability distribution is empty.")
    return sorted(
        [
            Probability(label=label, probability=round(max(0.0, float(value)) / total, 3))
            for label, value in values.items()
        ],
        key=lambda item: item.probability,
        reverse=True,
    )


def location_from_coordinates(px: Any, pz: Any) -> PitchLocation:
    x = finite_or(px, None)
    z = finite_or(pz, None)
    if x is None or z is None:
        return PitchLocation(px=x, pz=z, zone=None, label="Waste")
    if z >= 2.85:
        label = "Up In" if x < -0.35 else "Up Away" if x > 0.35 else "Up Middle"
    elif z >= 2.0:
        label = "Middle In" if x < -0.35 else "Middle Away" if x > 0.35 else "Middle"
    elif z >= 1.35:
        label = "Low In" if x < -0.35 else "Low Away" if x > 0.35 else "Low Middle"
    elif abs(x) > 0.95:
        label = "Chase Away"
    else:
        label = "Chase Low"
    zone_map = {
        "Up In": 1,
        "Up Middle": 2,
        "Up Away": 3,
        "Middle In": 4,
        "Middle": 5,
        "Middle Away": 6,
        "Low In": 7,
        "Low Middle": 8,
        "Low Away": 9,
        "Chase Low": 13,
        "Chase Away": 14,
        "Waste": None,
    }
    return PitchLocation(px=round(x, 3), pz=round(z, 3), zone=zone_map[label], label=label)  # type: ignore[arg-type]


def product_pitch_type(value: str) -> PitchType:
    upper = value.upper()
    return upper if upper in PRODUCT_PITCH_TYPES and upper != "OTHER" else "Other"  # type: ignore[return-value]


def model_pitch_type(value: str) -> str:
    upper = value.upper()
    return upper if upper in DEFAULT_PITCH_SHAPES and upper != "OTHER" else MODEL_OTHER_PITCH


def model_result(result: PitchResult) -> str:
    return {
        "ball": "ball",
        "called_strike": "called_strike",
        "whiff": "swinging_strike",
        "foul": "foul",
        "ball_in_play": "hit_into_play",
        "hit_by_pitch": "hit_by_pitch",
    }[result]


def product_result(result: str) -> PitchResult:
    normalized = result.lower()
    if normalized in {"ball", "ball_in_dirt", "blocked_ball", "automatic_ball", "intentional_ball", "pitchout"}:
        return "ball"
    if normalized in {"swinging_strike", "swinging_strike_blocked", "missed_bunt", "swinging_pitchout"}:
        return "whiff"
    if normalized in {"foul", "foul_bunt", "foul_tip", "bunt_foul_tip", "foul_pitchout"}:
        return "foul"
    if normalized in {"hit_into_play", "in_play"}:
        return "ball_in_play"
    if normalized == "hit_by_pitch":
        return "hit_by_pitch"
    return "called_strike"


def result_summary(result: PitchResult) -> str:
    if result == "ball":
        return "Ball"
    if result == "ball_in_play":
        return "Ball In Play"
    if result == "hit_by_pitch":
        return "HBP / Other"
    return "Strike/Foul"


def result_description(result: PitchResult) -> str:
    return {
        "ball": "ball",
        "called_strike": "called strike",
        "whiff": "whiff",
        "foul": "foul",
        "ball_in_play": "ball in play",
        "hit_by_pitch": "hit by pitch",
    }[result]


def hand_or_none(value: str) -> str | None:
    return value if value in {"L", "R"} else None


def bases_state(bases: BaseState) -> int:
    return (1 if bases.first else 0) + (2 if bases.second else 0) + (4 if bases.third else 0)


def parse_mlbam_id(value: str, field: str) -> int:
    if value.isdigit():
        return int(value)
    raise ValueError(f"{field} must be a numeric MLBAM id for real model inference.")


def stable_positive_id(value: str) -> int:
    total = 0
    for char in value:
        total = (total * 31 + ord(char)) % 2_147_483_647
    return max(1, total)


def finite_or(value: Any, fallback: float | None) -> float | None:
    if isinstance(value, (int, float)) and isfinite(float(value)):
        return float(value)
    return fallback


def value_at(values: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        if key in values:
            return values[key]
    return None


def probability_for(items: list[Probability], label: str) -> float:
    return next((item.probability for item in items if item.label == label), 0.0)
