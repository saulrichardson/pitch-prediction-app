import { bucketFromZone, emptyBases, normalizeStrikeZoneBounds } from "./state";
import type {
  GameReplay,
  GameState,
  Matchup,
  PitchEvent,
  PitchResult,
  PitchType,
} from "./types";

type MlbGame = Record<string, unknown>;

export function normalizeMlbLiveFeed(feed: MlbGame): GameReplay {
  const gameData = objectAt(feed, "gameData");
  const liveData = objectAt(feed, "liveData");
  const teams = objectAt(gameData, "teams");
  const away = objectAt(teams, "away");
  const home = objectAt(teams, "home");
  const plays = arrayAt(valueAt(objectAt(liveData, "plays"), "allPlays"));
  const gamePk = String(
    valueAt(feed, "gamePk") ?? valueAt(gameData, "gamePk") ?? "unknown",
  );
  const pitches: PitchEvent[] = [];
  let currentState: GameState = {
    inning: 1,
    half: "top",
    count: zeroCount(),
    outs: 0,
    bases: { ...emptyBases },
    awayScore: 0,
    homeScore: 0,
  };

  for (const play of plays) {
    const about = objectAt(play, "about");
    const matchup = normalizeMatchup(objectAt(play, "matchup"));
    const playEvents = arrayAt(valueAt(play, "playEvents"));
    const pitchEvents = playEvents.filter((event) =>
      booleanAt(event, "isPitch", false),
    );
    let pitchNumberInPlay = 0;
    const frame = {
      inning: numberAt(about, "inning", currentState.inning),
      half:
        stringAt(about, "halfInning", currentState.half) === "bottom"
          ? ("bottom" as const)
          : ("top" as const),
    };
    currentState = {
      ...currentState,
      inning: frame.inning,
      half: frame.half,
      count: zeroCount(),
      outs: sameFrame(currentState, frame) ? currentState.outs : 0,
      bases: sameFrame(currentState, frame)
        ? currentState.bases
        : { ...emptyBases },
    };

    for (const event of playEvents) {
      const eventIndex = nullableNumberAt(event, "index");
      const runners =
        eventIndex === null
          ? arrayAt(valueAt(event, "runners"))
          : arrayAt(valueAt(play, "runners")).filter(
              (runner) =>
                nullableNumberAt(objectAt(runner, "details"), "playIndex") ===
                eventIndex,
            );
      const eventWithRunners = { ...event, runners };
      if (!booleanAt(event, "isPitch", false)) {
        if (pitchNumberInPlay < pitchEvents.length) {
          currentState = nonPitchEventState(currentState, eventWithRunners);
        }
        continue;
      }

      pitchNumberInPlay += 1;
      const details = objectAt(event, "details");
      const pitchData = objectAt(event, "pitchData");
      const coordinates = objectAt(pitchData, "coordinates");
      const breaks = objectAt(pitchData, "breaks");
      const result = normalizeResult(details);
      const type = normalizePitchType(objectAt(details, "type"));
      const zone = nullableNumberAt(pitchData, "zone");
      const px = nullableNumberAt(coordinates, "pX");
      const pz = nullableNumberAt(coordinates, "pZ");
      const strikeZone = normalizeStrikeZoneBounds({
        top: nullableNumberAt(pitchData, "strikeZoneTop"),
        bottom: nullableNumberAt(pitchData, "strikeZoneBottom"),
        width: nullableNumberAt(pitchData, "strikeZoneWidth"),
        depth: nullableNumberAt(pitchData, "strikeZoneDepth"),
        source: "measured",
      });
      const eventCount = objectAt(event, "count");
      const preState: GameState = {
        ...currentState,
        outs: currentState.outs,
        count: { ...currentState.count },
        bases: { ...currentState.bases },
      };
      const isFinalPitchOfPlay = pitchNumberInPlay === pitchEvents.length;
      const postState = isFinalPitchOfPlay
        ? finalStateForPlay(play, preState, eventIndex)
        : nonPitchEventState(
            nonTerminalPostState(preState, eventCount),
            eventWithRunners,
          );

      const pitch: PitchEvent = {
        id: `${gamePk}-${pitches.length}`,
        paId: `${gamePk}-${numberAt(about, "atBatIndex", 0)}`,
        pitchNumber: pitchNumberInPlay,
        gamePitchIndex: pitches.length,
        source: "actual",
        pitchType: type,
        result,
        location: {
          px,
          pz,
          zone,
          label: bucketFromZone(zone, px, pz),
          strikeZone,
        },
        shape: {
          velocity: nullableNumberAt(pitchData, "startSpeed"),
          spin:
            nullableNumberAt(breaks, "spinRate") ??
            nullableNumberAt(pitchData, "spinRate"),
          release: {
            x0: nullableNumberAt(coordinates, "x0"),
            y0: nullableNumberAt(coordinates, "y0"),
            z0: nullableNumberAt(coordinates, "z0"),
            extension: nullableNumberAt(pitchData, "extension"),
          },
          movement: {
            vx0: nullableNumberAt(coordinates, "vX0"),
            vy0: nullableNumberAt(coordinates, "vY0"),
            vz0: nullableNumberAt(coordinates, "vZ0"),
            ax: nullableNumberAt(coordinates, "aX"),
            ay: nullableNumberAt(coordinates, "aY"),
            az: nullableNumberAt(coordinates, "aZ"),
            pfxX: nullableNumberAt(coordinates, "pfxX"),
            pfxZ: nullableNumberAt(coordinates, "pfxZ"),
            spinAxis: nullableNumberAt(breaks, "spinDirection"),
            breakAngle: nullableNumberAt(breaks, "breakAngle"),
            breakLength: nullableNumberAt(breaks, "breakLength"),
            breakHorizontal: nullableNumberAt(breaks, "breakHorizontal"),
            breakVertical: nullableNumberAt(breaks, "breakVertical"),
          },
        },
        preState,
        postState,
        matchup,
        description: stringAt(details, "description", ""),
      };

      pitches.push(pitch);
      currentState = postState;
    }

    if (pitchEvents.length === 0) {
      currentState = finalStateForPlay(play, currentState);
    }
  }

  return {
    game: {
      gamePk: String(
        valueAt(feed, "gamePk") ?? valueAt(gameData, "gamePk") ?? "unknown",
      ),
      label: `${teamLabel(away, "Away")} @ ${teamLabel(home, "Home")}`,
      officialDate: stringAt(
        objectAt(gameData, "datetime"),
        "officialDate",
        new Date().toISOString().slice(0, 10),
      ),
      awayTeam: stringAt(away, "name", "Away"),
      homeTeam: stringAt(home, "name", "Home"),
      awayScore: numberAt(
        objectAt(objectAt(objectAt(liveData, "linescore"), "teams"), "away"),
        "runs",
        0,
      ),
      homeScore: numberAt(
        objectAt(objectAt(objectAt(liveData, "linescore"), "teams"), "home"),
        "runs",
        0,
      ),
      status: stringAt(
        objectAt(objectAt(gameData, "status"), "detailedState"),
        "description",
        stringAt(objectAt(gameData, "status"), "detailedState", "Unknown"),
      ),
    },
    pitches,
  };
}

function zeroCount(): GameState["count"] {
  return { balls: 0, strikes: 0 };
}

function sameFrame(
  state: GameState,
  frame: Pick<GameState, "inning" | "half">,
): boolean {
  return state.inning === frame.inning && state.half === frame.half;
}

function nonTerminalPostState(
  preState: GameState,
  eventCount: Record<string, unknown>,
): GameState {
  return {
    ...preState,
    count: {
      balls: clampBalls(numberAt(eventCount, "balls", preState.count.balls)),
      strikes: clampStrikes(
        numberAt(eventCount, "strikes", preState.count.strikes),
      ),
    },
  };
}

function nonPitchEventState(
  state: GameState,
  event: Record<string, unknown>,
): GameState {
  const eventCount = objectAt(event, "count");
  const eventOuts = nullableNumberAt(eventCount, "outs");
  const runners = arrayAt(valueAt(event, "runners"));
  const details = objectAt(event, "details");
  const placedBase =
    stringAt(details, "eventType", "") === "runner_placed"
      ? ({ 1: "first", 2: "second", 3: "third" } as const)[
          numberAt(event, "base", 0) as 1 | 2 | 3
        ]
      : undefined;
  const bases = placedBase
    ? { ...state.bases, [placedBase]: true }
    : state.bases;
  const runs = runners.filter(
    (runner) =>
      stringAt(objectAt(runner, "movement"), "end", "") === "score" &&
      !booleanAt(objectAt(runner, "movement"), "isOut", false),
  ).length;
  return {
    ...state,
    outs: eventOuts === null ? state.outs : clampOuts(eventOuts),
    count: {
      balls: clampBalls(numberAt(eventCount, "balls", state.count.balls)),
      strikes: clampStrikes(
        numberAt(eventCount, "strikes", state.count.strikes),
      ),
    },
    awayScore: numberAt(
      details,
      "awayScore",
      state.awayScore + (state.half === "top" ? runs : 0),
    ),
    homeScore: numberAt(
      details,
      "homeScore",
      state.homeScore + (state.half === "bottom" ? runs : 0),
    ),
    bases:
      runners.length > 0 ? basesAfterRunnerMovements(bases, runners) : bases,
  };
}

function finalStateForPlay(
  play: Record<string, unknown>,
  preState: GameState,
  fromEvent: number | null = null,
): GameState {
  const playCount = objectAt(play, "count");
  const result = objectAt(play, "result");
  const outs = numberAt(playCount, "outs", preState.outs);
  return {
    ...preState,
    count: zeroCount(),
    outs: clampOuts(outs),
    bases:
      outs >= 3
        ? { ...emptyBases }
        : basesAfterPlay(
            preState.bases,
            arrayAt(valueAt(play, "runners")),
            fromEvent,
          ),
    awayScore: numberAt(result, "awayScore", preState.awayScore),
    homeScore: numberAt(result, "homeScore", preState.homeScore),
  };
}

function basesAfterPlay(
  start: GameState["bases"],
  runners: Record<string, unknown>[],
  fromEvent: number | null,
) {
  const groups = new Map<number, Record<string, unknown>[]>();
  for (const runner of runners) {
    const index = nullableNumberAt(objectAt(runner, "details"), "playIndex");
    if (fromEvent !== null && index !== null && index < fromEvent) continue;
    const key = index ?? 0;
    groups.set(key, [...(groups.get(key) ?? []), runner]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a - b)
    .reduce(
      (bases, [, group]) => basesAfterRunnerMovements(bases, group),
      start,
    );
}

function basesAfterRunnerMovements(
  startBases: GameState["bases"],
  runners: Record<string, unknown>[],
): GameState["bases"] {
  const bases = { ...startBases };
  const destinations: Array<keyof GameState["bases"]> = [];
  for (const runner of runners) {
    const movement = objectAt(runner, "movement");
    const start = nullableStringAt(movement, "start");
    const end = nullableStringAt(movement, "end");
    const isOut = booleanAt(movement, "isOut", false);
    const startKey = baseKey(start);
    const endKey = baseKey(end);
    if (startKey) bases[startKey] = false;
    if (!isOut && endKey) destinations.push(endKey);
  }
  for (const destination of destinations) {
    bases[destination] = true;
  }
  return bases;
}

function baseKey(base: string | null): keyof GameState["bases"] | null {
  if (base === "1B") return "first";
  if (base === "2B") return "second";
  if (base === "3B") return "third";
  return null;
}

function normalizeMatchup(matchup: Record<string, unknown>): Matchup {
  return {
    pitcherId: String(
      valueAt(objectAt(matchup, "pitcher"), "id") ?? "unknown-pitcher",
    ),
    pitcherName: stringAt(
      objectAt(matchup, "pitcher"),
      "fullName",
      "Unknown pitcher",
    ),
    pitcherHand: handCode(objectAt(matchup, "pitchHand")),
    batterId: String(
      valueAt(objectAt(matchup, "batter"), "id") ?? "unknown-batter",
    ),
    batterName: stringAt(
      objectAt(matchup, "batter"),
      "fullName",
      "Unknown batter",
    ),
    batterSide: handCode(objectAt(matchup, "batSide")),
  };
}

function normalizePitchType(type: Record<string, unknown>): PitchType {
  const code = stringAt(type, "code", "Other");
  if (["FF", "SI", "SL", "CH", "CU", "FC", "FS"].includes(code))
    return code as PitchType;
  return "Other";
}

function normalizeResult(details: Record<string, unknown>): PitchResult {
  const code = stringAt(details, "code", "");
  const description = stringAt(
    objectAt(details, "call"),
    "description",
    stringAt(details, "description", ""),
  ).toLowerCase();
  if (code === "H" || description.includes("hit by pitch"))
    return "hit_by_pitch";
  if (booleanAt(details, "isInPlay", false) || code === "X")
    return "ball_in_play";
  if (description.includes("foul tip")) return "foul_tip";
  if (description.includes("foul bunt")) return "foul_bunt";
  if (description.includes("foul")) return "foul";
  if (description.includes("swinging") || description.includes("miss"))
    return "whiff";
  if (booleanAt(details, "isBall", false) || code === "B") return "ball";
  if (booleanAt(details, "isStrike", false) || code === "C" || code === "S")
    return "called_strike";
  throw new Error(`Unsupported MLB pitch result: ${code} ${description}`);
}

function handCode(value: Record<string, unknown>): Matchup["pitcherHand"] {
  const code = stringAt(value, "code", "Unknown");
  return code === "L" || code === "R" || code === "S" ? code : "Unknown";
}

function objectAt(value: unknown, key: string): Record<string, unknown> {
  const nested = valueAt(value, key);
  return nested && typeof nested === "object" && !Array.isArray(nested)
    ? (nested as Record<string, unknown>)
    : {};
}

function arrayAt(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? (value.filter((item) => item && typeof item === "object") as Record<
        string,
        unknown
      >[])
    : [];
}

function valueAt(value: unknown, key: string): unknown {
  return value && typeof value === "object" && key in value
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

function stringAt(value: unknown, key: string, fallback: string): string {
  const item = valueAt(value, key);
  return typeof item === "string" ? item : fallback;
}

function teamLabel(team: Record<string, unknown>, fallback: string): string {
  return stringAt(
    team,
    "abbreviation",
    stringAt(
      team,
      "teamCode",
      stringAt(team, "clubName", stringAt(team, "name", fallback)),
    ),
  );
}

function numberAt(value: unknown, key: string, fallback: number): number {
  const item = valueAt(value, key);
  return typeof item === "number" && Number.isFinite(item) ? item : fallback;
}

function clampBalls(value: number): GameState["count"]["balls"] {
  return Math.max(0, Math.min(3, value)) as GameState["count"]["balls"];
}

function clampStrikes(value: number): GameState["count"]["strikes"] {
  return Math.max(0, Math.min(2, value)) as GameState["count"]["strikes"];
}

function clampOuts(value: number): GameState["outs"] {
  return Math.max(0, Math.min(3, value)) as GameState["outs"];
}

function nullableNumberAt(value: unknown, key: string): number | null {
  const item = valueAt(value, key);
  return typeof item === "number" && Number.isFinite(item) ? item : null;
}

function nullableStringAt(value: unknown, key: string): string | null {
  const item = valueAt(value, key);
  return typeof item === "string" ? item : null;
}

function booleanAt(value: unknown, key: string, fallback: boolean): boolean {
  const item = valueAt(value, key);
  return typeof item === "boolean" ? item : fallback;
}
