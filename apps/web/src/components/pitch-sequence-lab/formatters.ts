import type { GameSummary, PitchEvent, PredictionResponse, Probability } from "@pitch/domain";

export function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function sortedProbabilities(items: Probability[]): Probability[] {
  const byLabel = new Map<string, Probability>();
  for (const item of items) {
    const existing = byLabel.get(item.label);
    byLabel.set(item.label, {
      label: item.label,
      probability: (existing?.probability ?? 0) + item.probability
    });
  }
  return [...byLabel.values()].sort((first, second) => second.probability - first.probability);
}

export function topProbability(items: Probability[]): Probability | undefined {
  return sortedProbabilities(items)[0];
}

export function expectedVelocityFor(prediction: PredictionResponse, pitchType?: string): number | null {
  const matchingPitch = pitchType ? prediction.possiblePitches.find((pitch) => pitch.pitchType === pitchType) : null;
  return matchingPitch?.velocity ?? prediction.possiblePitches[0]?.velocity ?? null;
}

export function probabilityForLabel(items: Probability[], label: string): number {
  return items.find((item) => item.label === label)?.probability ?? 0;
}

export function formatFeet(value: number | null): string {
  return value === null ? "--" : `${value.toFixed(2)} ft`;
}

export function formatZone(zone: number | null): string {
  return zone === null ? "--" : `Zone ${zone}`;
}

export function pitchTypeName(pitchType?: string): string {
  switch (normalizePitchTypeLabel(pitchType)) {
    case "FF":
      return "Four-Seam Fastball";
    case "SI":
      return "Sinker";
    case "SL":
      return "Slider";
    case "CH":
      return "Changeup";
    case "CU":
      return "Curveball";
    case "FC":
      return "Cutter";
    case "FS":
      return "Splitter";
    case "Other":
      return "Other";
    default:
      return pitchType ?? "--";
  }
}

function normalizePitchTypeLabel(pitchType?: string): string | undefined {
  if (!pitchType) return undefined;
  const normalized = pitchType.trim().toUpperCase();
  if (normalized === "FOUR-SEAM FASTBALL" || normalized === "4-SEAM" || normalized === "FOUR-SEAM") return "FF";
  if (normalized === "SINKER") return "SI";
  if (normalized === "SLIDER") return "SL";
  if (normalized === "CHANGEUP") return "CH";
  if (normalized === "CURVEBALL" || normalized === "CURVE") return "CU";
  if (normalized === "CUTTER") return "FC";
  if (normalized === "SPLITTER") return "FS";
  if (normalized === "OTHER") return "Other";
  return pitchType;
}

export function cap(value: string): string {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

export function scoreLine(game: GameSummary | null, state: PitchEvent["preState"]): string {
  const [away, home] = teamCodes(game);
  return `${away} ${state.awayScore} - ${state.homeScore} ${home}`;
}

export function formatGameDate(officialDate: string): string {
  const [year, month, day] = officialDate.split("-").map(Number);
  const date = year && month && day ? new Date(Date.UTC(year, month - 1, day)) : new Date(officialDate);
  if (Number.isNaN(date.getTime())) return officialDate;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  }).format(date);
}

export function stateSnapshot(game: GameSummary | null, state: PitchEvent["preState"]): string {
  return `${state.count.balls}-${state.count.strikes}, ${outsLabel(state.outs)}, ${basesLabel(state.bases)}, ${scoreLine(game, state)}`;
}

function outsLabel(outs: PitchEvent["preState"]["outs"]): string {
  return `${outs} out${outs === 1 ? "" : "s"}`;
}

export function basesLabel(bases: PitchEvent["preState"]["bases"]): string {
  const occupied = [
    bases.first ? "1B" : null,
    bases.second ? "2B" : null,
    bases.third ? "3B" : null
  ].filter(Boolean);
  return occupied.length ? occupied.join("/") : "bases empty";
}

function teamCodes(game: GameSummary | null): [string, string] {
  if (!game) return ["Away", "Home"];
  const [away, home] = game.label.split(" @ ");
  return [away || game.awayTeam || "Away", home || game.homeTeam || "Home"];
}

export function handLabel(hand: PitchEvent["matchup"]["pitcherHand"]): string {
  if (hand === "L") return "LHP";
  if (hand === "R") return "RHP";
  return "Pitcher";
}

export function batSideText(side: PitchEvent["matchup"]["batterSide"]): string {
  if (side === "L") return "left";
  if (side === "R") return "right";
  if (side === "S") return "switch";
  return "unknown";
}

export function mlbHeadshotUrl(playerId: string): string | null {
  return /^\d+$/.test(playerId)
    ? `https://img.mlbstatic.com/mlb-photos/image/upload/w_120,q_auto:best/v1/people/${playerId}/headshot/67/current`
    : null;
}

export function playerInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.slice(0, 1).toUpperCase())
    .join("") || "--";
}
