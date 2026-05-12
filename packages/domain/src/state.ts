import type {
  BaseState,
  CountState,
  ForcedPitchInput,
  GameState,
  LocationBucket,
  PitchEvaluation,
  PitchEvent,
  PitchLocation,
  PitchResult,
  PitchShape,
  PitchType,
  PredictionResponse,
  RevealLabel,
  StrikeZoneBounds,
  StrikeZoneSource,
  TerminalState
} from "./types";

export const emptyBases: BaseState = { first: false, second: false, third: false };
export const DEFAULT_STRIKE_ZONE: StrikeZoneBounds = {
  top: 3.5,
  bottom: 1.5,
  width: 17,
  depth: null,
  source: "default"
};

export function applyPitchResult(
  preState: GameState,
  result: PitchResult
): { postState: GameState; terminalState: TerminalState | null } {
  const next: GameState = {
    ...preState,
    count: { ...preState.count },
    bases: { ...preState.bases }
  };

  if (result === "ball_in_play") {
    return { postState: next, terminalState: "ball_in_play" };
  }

  if (result === "hit_by_pitch") {
    next.bases = advanceForcedRunner(next.bases);
    return { postState: next, terminalState: "hit_by_pitch" };
  }

  if (result === "ball") {
    if (preState.count.balls === 3) {
      next.bases = advanceForcedRunner(next.bases);
      return { postState: next, terminalState: "walk" };
    }
    next.count.balls = clampBalls(preState.count.balls + 1);
    return { postState: next, terminalState: null };
  }

  if (result === "foul" && preState.count.strikes === 2) {
    return { postState: next, terminalState: null };
  }

  if (result === "called_strike" || result === "whiff" || result === "foul") {
    if (preState.count.strikes === 2) {
      next.outs = clampOuts(preState.outs + 1);
      return { postState: next, terminalState: "strikeout" };
    }
    next.count.strikes = clampStrikes(preState.count.strikes + 1);
    return { postState: next, terminalState: null };
  }

  return { postState: next, terminalState: null };
}

export function buildForcedPitch(
  input: ForcedPitchInput,
  base: {
    paId: string;
    pitchNumber: number;
    gamePitchIndex: number;
    preState: GameState;
    matchup: PitchEvent["matchup"];
    source: PitchEvent["source"];
    prediction?: PredictionResponse;
  }
): { pitch: PitchEvent; terminalState: TerminalState | null } {
  const { postState, terminalState } = applyPitchResult(base.preState, input.result);
  const location = locationFromBucket(input.location);
  const shape = completePitchShape(input.pitchType, base.prediction);

  return {
    terminalState,
    pitch: {
      id: `${base.source}-${base.gamePitchIndex}-${base.pitchNumber}-${Date.now()}`,
      paId: base.paId,
      pitchNumber: base.pitchNumber,
      gamePitchIndex: base.gamePitchIndex,
      source: base.source,
      pitchType: input.pitchType,
      result: input.result,
      location,
      shape,
      preState: base.preState,
      postState,
      matchup: base.matchup,
      description: `${input.pitchType} ${input.location.toLowerCase()}, ${resultLabel(input.result)}`
    }
  };
}

export function evaluatePitch(
  prediction: PredictionResponse,
  actual: PitchEvent
): PitchEvaluation {
  const pitchMix = sortedProbabilities(prediction.pitchMix);
  const pitchRank = pitchMix.findIndex((p) => p.label === actual.pitchType);
  const pitchTypeProbability = probabilityFor(pitchMix, actual.pitchType);
  const resultProbability = probabilityFor(prediction.resultMix, resultSummary(actual.result));
  const top = pitchMix[0] ?? null;
  const locationErrorFeet = distance(
    prediction.location.expected.px,
    prediction.location.expected.pz,
    actual.location.px,
    actual.location.pz
  );
  const velocityRead = prediction.possiblePitches.find((pitch) => pitch.pitchType === actual.pitchType)?.velocity
    ?? prediction.possiblePitches[0]?.velocity
    ?? null;
  const velocityErrorMph = velocityRead !== null
    ? Math.abs(velocityRead - (actual.shape.velocity ?? velocityRead))
    : null;

  return {
    pitchTypeRank: pitchRank >= 0 ? pitchRank + 1 : null,
    pitchTypeProbability,
    resultProbability,
    topPitchType: top?.label ?? null,
    topPitchProbability: top?.probability ?? 0,
    locationErrorFeet,
    velocityErrorMph,
    label: revealLabel(pitchTypeProbability, pitchRank + 1)
  };
}

export function compareProbabilities(
  branch: { label: string; probability: number }[],
  actual: { label: string; probability: number }[]
): { label: string; probability: number }[] {
  const labels = new Set([...branch.map((p) => p.label), ...actual.map((p) => p.label)]);
  return [...labels]
    .map((label) => ({
      label,
      probability: probabilityFor(branch, label) - probabilityFor(actual, label)
    }))
    .sort((a, b) => Math.abs(b.probability) - Math.abs(a.probability));
}

export function locationFromBucket(label: LocationBucket): PitchLocation {
  const map: Record<LocationBucket, { px: number; pz: number; zone: number | null }> = {
    "Up In": { px: -0.55, pz: 3.2, zone: 1 },
    "Up Middle": { px: 0, pz: 3.2, zone: 2 },
    "Up Away": { px: 0.55, pz: 3.2, zone: 3 },
    "Middle In": { px: -0.55, pz: 2.45, zone: 4 },
    Middle: { px: 0, pz: 2.45, zone: 5 },
    "Middle Away": { px: 0.55, pz: 2.45, zone: 6 },
    "Low In": { px: -0.55, pz: 1.7, zone: 7 },
    "Low Middle": { px: 0, pz: 1.7, zone: 8 },
    "Low Away": { px: 0.55, pz: 1.7, zone: 9 },
    "Chase Low": { px: 0, pz: 1.05, zone: 13 },
    "Chase Away": { px: 1.2, pz: 2.3, zone: 14 },
    Waste: { px: 1.55, pz: 3.65, zone: null }
  };
  return { ...map[label], label };
}

export function normalizeStrikeZoneBounds(input: {
  top: number | null;
  bottom: number | null;
  width?: number | null;
  depth?: number | null;
  source: StrikeZoneSource;
}): StrikeZoneBounds | null {
  if (!isFiniteNumber(input.top) || !isFiniteNumber(input.bottom)) return null;
  if (input.top <= input.bottom) return null;
  return {
    top: round(input.top, 2),
    bottom: round(input.bottom, 2),
    width: isFiniteNumber(input.width) && input.width > 0 ? round(input.width, 2) : null,
    depth: isFiniteNumber(input.depth) && input.depth > 0 ? round(input.depth, 2) : null,
    source: input.source
  };
}

export function estimateStrikeZoneForPitch(currentPitch: Pick<PitchEvent, "matchup">, history: PitchEvent[]): StrikeZoneBounds {
  const sameBatterZones = history
    .filter((pitch) => pitch.matchup.batterId === currentPitch.matchup.batterId)
    .map((pitch) => pitch.location.strikeZone)
    .filter((zone): zone is StrikeZoneBounds => Boolean(zone));

  if (!sameBatterZones.length) return DEFAULT_STRIKE_ZONE;

  return normalizeStrikeZoneBounds({
    top: average(sameBatterZones.map((zone) => zone.top)),
    bottom: average(sameBatterZones.map((zone) => zone.bottom)),
    width: averageNullable(sameBatterZones.map((zone) => zone.width)),
    depth: averageNullable(sameBatterZones.map((zone) => zone.depth)),
    source: "estimated"
  }) ?? DEFAULT_STRIKE_ZONE;
}

export function strikeZoneForPitchDisplay(
  currentPitch: Pick<PitchEvent, "id" | "matchup">,
  history: PitchEvent[],
  revealedPitch?: PitchEvent | null
): StrikeZoneBounds {
  const revealedZone = revealedPitch?.id === currentPitch.id ? revealedPitch.location.strikeZone : null;
  if (revealedZone) return revealedZone;
  return estimateStrikeZoneForPitch(currentPitch, history);
}

export function bucketFromZone(zone: number | null, px: number | null, pz: number | null): LocationBucket {
  if (zone === 1) return "Up In";
  if (zone === 2) return "Up Middle";
  if (zone === 3) return "Up Away";
  if (zone === 4) return "Middle In";
  if (zone === 5) return "Middle";
  if (zone === 6) return "Middle Away";
  if (zone === 7) return "Low In";
  if (zone === 8) return "Low Middle";
  if (zone === 9) return "Low Away";
  if (pz !== null && pz < 1.4) return "Chase Low";
  if (px !== null && Math.abs(px) > 0.95) return "Chase Away";
  return "Waste";
}

export function resultSummary(result: PitchResult): string {
  if (result === "ball") return "Ball";
  if (result === "hit_by_pitch") return "HBP / Other";
  if (result === "ball_in_play") return "Ball In Play";
  return "Strike/Foul";
}

export function resultLabel(result: PitchResult): string {
  const labels: Record<PitchResult, string> = {
    ball: "ball",
    called_strike: "called strike",
    whiff: "whiff",
    foul: "foul",
    ball_in_play: "ball in play",
    hit_by_pitch: "hit by pitch"
  };
  return labels[result];
}

export function pitchTypeLabel(type: PitchType): string {
  return type === "Other" ? "Other" : type;
}

function completePitchShape(pitchType: PitchType, prediction?: PredictionResponse): PitchShape {
  const possible = prediction?.possiblePitches.find((pitch) => pitch.pitchType === pitchType);
  const defaultVelocity: Record<PitchType, number> = {
    FF: 96,
    SI: 94,
    SL: 86,
    CH: 88,
    CU: 80,
    FC: 91,
    FS: 88,
    Other: 84
  };

  return {
    velocity: possible?.velocity ?? defaultVelocity[pitchType],
    spin: null,
    release: {},
    movement: {}
  };
}

function advanceForcedRunner(bases: BaseState): BaseState {
  return {
    first: true,
    second: bases.first || bases.second,
    third: bases.second || bases.third
  };
}

function probabilityFor(items: { label: string; probability: number }[], label: string): number {
  return items
    .filter((item) => item.label === label)
    .reduce((total, item) => total + item.probability, 0);
}

function sortedProbabilities(items: { label: string; probability: number }[]): { label: string; probability: number }[] {
  const byLabel = new Map<string, number>();
  for (const item of items) {
    byLabel.set(item.label, (byLabel.get(item.label) ?? 0) + item.probability);
  }
  return [...byLabel.entries()]
    .map(([label, probability]) => ({ label, probability }))
    .sort((first, second) => second.probability - first.probability);
}

function revealLabel(probability: number, rank: number): RevealLabel {
  if (probability >= 0.3 || rank === 1) return "Expected";
  if (probability >= 0.15 || rank <= 3) return "Plausible";
  if (probability >= 0.06 || rank <= 5) return "Surprising";
  return "Very Surprising";
}

function distance(aX: number | null, aZ: number | null, bX: number | null, bZ: number | null): number | null {
  if (aX === null || aZ === null || bX === null || bZ === null) return null;
  return Number(Math.hypot(aX - bX, aZ - bZ).toFixed(2));
}

function average(values: number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function averageNullable(values: Array<number | null>): number | null {
  const finite = values.filter((value): value is number => isFiniteNumber(value));
  return finite.length ? average(finite) : null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function round(value: number, decimals: number): number {
  const scale = 10 ** decimals;
  return Math.round(value * scale) / scale;
}

function clampBalls(value: number): CountState["balls"] {
  return Math.max(0, Math.min(3, value)) as CountState["balls"];
}

function clampStrikes(value: number): CountState["strikes"] {
  return Math.max(0, Math.min(2, value)) as CountState["strikes"];
}

function clampOuts(value: number): GameState["outs"] {
  return Math.max(0, Math.min(3, value)) as GameState["outs"];
}
