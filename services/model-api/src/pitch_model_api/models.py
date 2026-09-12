from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


PitchType = Literal["FF", "SI", "SL", "CH", "CU", "FC", "FS", "Other"]
PitchResult = Literal["ball", "called_strike", "whiff", "foul", "foul_tip", "foul_bunt", "ball_in_play", "hit_by_pitch"]
LocationBucket = Literal[
    "High left",
    "High middle",
    "High right",
    "Middle left",
    "Middle",
    "Middle right",
    "Low left",
    "Low middle",
    "Low right",
    "Below zone",
    "Low wide",
    "Untracked",
]


class CountState(BaseModel):
    balls: int = Field(ge=0, le=3)
    strikes: int = Field(ge=0, le=2)


class BaseState(BaseModel):
    first: bool
    second: bool
    third: bool


class ScoreState(BaseModel):
    away: int
    home: int


class StrikeZone(BaseModel):
    top: float
    bottom: float


class GameState(BaseModel):
    inning: int = Field(ge=1)
    half: Literal["top", "bottom"]
    count: CountState
    outs: int = Field(ge=0, le=3)
    bases: BaseState
    awayScore: int
    homeScore: int


class Matchup(BaseModel):
    pitcherId: str
    pitcherName: str
    pitcherHand: Literal["L", "R", "S", "Unknown"]
    batterId: str
    batterName: str
    batterSide: Literal["L", "R", "S", "Unknown"]


class PitchLocation(BaseModel):
    px: float | None
    pz: float | None
    zone: int | None
    label: LocationBucket


class PitchShape(BaseModel):
    model_config = ConfigDict(extra="allow")

    velocity: float | None
    spin: float | None
    release: dict[str, float | None] = Field(default_factory=dict)
    movement: dict[str, float | None] = Field(default_factory=dict)


class PitchEvent(BaseModel):
    id: str
    paId: str
    pitchNumber: int
    gamePitchIndex: int
    source: Literal["actual"]
    pitchType: PitchType
    result: PitchResult
    location: PitchLocation
    shape: PitchShape
    preState: GameState
    postState: GameState
    matchup: Matchup
    description: str


class PredictionRequest(BaseModel):
    pitcherId: str
    batterId: str
    pitcherHand: Literal["L", "R", "S", "Unknown"]
    batterSide: Literal["L", "R", "S", "Unknown"]
    gameDate: str
    count: CountState
    outs: int = Field(ge=0, le=2)
    bases: BaseState
    score: ScoreState
    inning: int = Field(ge=1)
    half: Literal["top", "bottom"]
    pitchNumber: int = Field(ge=0)
    timesThroughOrder: int = Field(ge=0)
    strikeZone: StrikeZone
    pitcherSessionHistory: list[PitchEvent] = Field(default_factory=list)
    currentPaHistory: list[PitchEvent] = Field(default_factory=list)


class Probability(BaseModel):
    label: str
    probability: float = Field(ge=0, le=1)


class PossiblePitch(BaseModel):
    pitchType: PitchType
    velocity: float | None
    location: PitchLocation
    result: PitchResult
    description: str


class PredictionLocation(BaseModel):
    density: list[Probability]
    expected: PitchLocation


class VelocityEstimate(BaseModel):
    pitchType: PitchType
    mean: float
    sampleCount: int = Field(gt=0)


class PredictionResponse(BaseModel):
    id: str
    modelVersion: str
    pitchMix: list[Probability]
    pitchMixSource: Literal["model", "samples"]
    resultMix: list[Probability]
    location: PredictionLocation
    countImpact: list[Probability]
    sampleSize: int = Field(gt=0)
    velocity: list[VelocityEstimate]
    possiblePitches: list[PossiblePitch]
    createdAt: str


class HealthResponse(BaseModel):
    status: Literal["loading", "ok", "error"]
    modelVersion: str
    algorithm: str
    loaded: bool
    error: str | None = None
