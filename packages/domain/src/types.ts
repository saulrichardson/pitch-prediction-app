export type PitchType =
  "FF" | "SI" | "SL" | "CH" | "CU" | "FC" | "FS" | "Other";

export type PitchResult =
  | "ball"
  | "called_strike"
  | "whiff"
  | "foul"
  | "foul_tip"
  | "foul_bunt"
  | "ball_in_play"
  | "hit_by_pitch";

export type TimelinePitchSource = "actual";

export type TerminalState =
  "strikeout" | "walk" | "hit_by_pitch" | "ball_in_play";

export type RevealLabel =
  "Expected" | "Plausible" | "Surprising" | "Very Surprising";

export type BaseState = {
  first: boolean;
  second: boolean;
  third: boolean;
};

export type CountState = {
  balls: 0 | 1 | 2 | 3;
  strikes: 0 | 1 | 2;
};

export type LiveOutCount = 0 | 1 | 2;
export type OutCount = LiveOutCount | 3;

export type GameState = {
  inning: number;
  half: "top" | "bottom";
  count: CountState;
  outs: OutCount;
  bases: BaseState;
  awayScore: number;
  homeScore: number;
};

export type Matchup = {
  pitcherId: string;
  pitcherName: string;
  pitcherHand: "L" | "R" | "S" | "Unknown";
  batterId: string;
  batterName: string;
  batterSide: "L" | "R" | "S" | "Unknown";
};

export type StrikeZoneSource = "measured" | "estimated" | "default";

export type StrikeZoneBounds = {
  top: number;
  bottom: number;
  width: number | null;
  depth: number | null;
  source: StrikeZoneSource;
};

export type PitchLocation = {
  px: number | null;
  pz: number | null;
  zone: number | null;
  label: LocationBucket;
  strikeZone?: StrikeZoneBounds | null;
};

export type LocationBucket =
  | "High left"
  | "High middle"
  | "High right"
  | "Middle left"
  | "Middle"
  | "Middle right"
  | "Low left"
  | "Low middle"
  | "Low right"
  | "Below zone"
  | "Low wide"
  | "Untracked";

export type PitchShape = {
  velocity: number | null;
  spin: number | null;
  release: Record<string, number | null>;
  movement: Record<string, number | null>;
};

export type PitchEvent = {
  id: string;
  paId: string;
  pitchNumber: number;
  gamePitchIndex: number;
  source: TimelinePitchSource;
  pitchType: PitchType;
  result: PitchResult;
  location: PitchLocation;
  shape: PitchShape;
  preState: GameState;
  postState: GameState;
  matchup: Matchup;
  description: string;
};

export type PitchMoment = Pick<
  PitchEvent,
  | "id"
  | "paId"
  | "pitchNumber"
  | "gamePitchIndex"
  | "source"
  | "preState"
  | "matchup"
>;

export type GameSummary = {
  gamePk: string;
  label: string;
  officialDate: string;
  awayTeam: string;
  homeTeam: string;
  awayScore: number;
  homeScore: number;
  status: string;
};

export type GameReplay = {
  game: GameSummary;
  pitches: PitchEvent[];
};

export type Probability = {
  label: string;
  probability: number;
};

export type PossiblePitch = {
  pitchType: PitchType;
  velocity: number | null;
  location: PitchLocation;
  result: PitchResult;
  description: string;
};

export type PredictionRequest = {
  pitcherId: string;
  batterId: string;
  pitcherHand: Matchup["pitcherHand"];
  batterSide: Matchup["batterSide"];
  gameDate: string;
  count: CountState;
  outs: LiveOutCount;
  bases: BaseState;
  score: { away: number; home: number };
  inning: number;
  half: GameState["half"];
  pitchNumber: number;
  timesThroughOrder: number;
  strikeZone: { top: number; bottom: number };
  pitcherSessionHistory: PitchEvent[];
  currentPaHistory: PitchEvent[];
};

export type PredictionResponse = {
  id: string;
  modelVersion: string;
  pitchMix: Probability[];
  pitchMixSource: "model" | "samples";
  resultMix: Probability[];
  location: {
    density: Probability[];
    expected: PitchLocation;
  };
  countImpact: Probability[];
  sampleSize: number;
  velocity: Array<{ pitchType: PitchType; mean: number; sampleCount: number }>;
  possiblePitches: PossiblePitch[];
  createdAt: string;
};

export type PitchEvaluation = {
  pitchTypeRank: number | null;
  pitchTypeProbability: number;
  resultProbability: number;
  topPitchType: string | null;
  topPitchProbability: number;
  locationErrorFeet: number | null;
  velocityErrorMph: number | null;
  label: RevealLabel;
};
