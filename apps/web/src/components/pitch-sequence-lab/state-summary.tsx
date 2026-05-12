import { resultLabel } from "@pitch/domain";
import type { ClientTimeline, PitchEvaluation, PitchEvent } from "@pitch/domain";
import { basesLabel, pct, pitchTypeName } from "./formatters";

export function StatePill({ label, value, emphasis, testId }: { label: string; value: string; emphasis?: boolean; testId?: string }) {
  return (
    <div className={`state-pill ${emphasis ? "state-pill-emphasis" : ""}`} data-testid={testId}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function MiniBases({ bases }: { bases: PitchEvent["preState"]["bases"] }) {
  return (
    <div className="mini-bases" aria-label={`Bases: ${basesLabel(bases)}`}>
      <span className={`mini-base second ${bases.second ? "on" : ""}`} />
      <span className={`mini-base third ${bases.third ? "on" : ""}`} />
      <span className={`mini-base first ${bases.first ? "on" : ""}`} />
    </div>
  );
}

export function LastPitchStrip({ pitch, evaluation }: { pitch: PitchEvent; evaluation: PitchEvaluation }) {
  return (
    <div className="last-pitch-strip">
      <p className="small-label">Last Pitch</p>
      <strong>P{pitch.gamePitchIndex + 1} {pitchTypeName(pitch.pitchType)} {pitch.shape.velocity?.toFixed(1) ?? "--"} mph, {resultLabel(pitch.result)}</strong>
      <span>Forecast rank #{evaluation.pitchTypeRank ?? "--"} at {pct(evaluation.pitchTypeProbability)} · {evaluation.label}</span>
    </div>
  );
}

export function lastCompletedReveal(timeline: ClientTimeline): { pitch: PitchEvent; evaluation: PitchEvaluation } | undefined {
  const forecast = timeline.actualForecastHistory.at(-1);
  if (!forecast) return undefined;
  const pitch = timeline.actualHistory.at(-1);
  return pitch ? { pitch, evaluation: forecast.evaluation } : undefined;
}
