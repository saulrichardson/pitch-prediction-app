import { resultLabel, resultSummary } from "@pitch/domain";
import type { PredictionResponse, Probability } from "@pitch/domain";
import {
  expectedVelocityFor,
  formatFeet,
  formatZone,
  pct,
  pitchTypeName,
  probabilityForLabel,
  sortedProbabilities,
  topProbability
} from "./formatters";

export function PredictionPanel({
  prediction
}: {
  prediction: PredictionResponse;
}) {
  const sortedPitchMix = sortedProbabilities(prediction.pitchMix);
  const mostLikelyPitch = sortedPitchMix[0];
  const topTwo = sortedPitchMix.slice(0, 2).reduce((total, item) => total + item.probability, 0);
  const likelyResult = topProbability(prediction.resultMix);
  const likelyCount = topProbability(prediction.countImpact);
  const expectedVelocity = expectedVelocityFor(prediction, mostLikelyPitch?.label);

  return (
    <aside className="panel prediction-panel model-detail-panel p-4">
      <div className="model-detail-header">
        <div>
          <p className="small-label">Model Detail</p>
          <h2 className="display text-3xl font-bold text-[var(--text-strong)]">Full forecast from this game state</h2>
        </div>
        <p>
          Scroll here for the full distribution behind the main read: pitch mix, location density, result forecast,
          next-count pressure, and plate-appearance outlook.
        </p>
      </div>

      <section className="forecast-primary" aria-label="Most likely next pitch detail">
        <p className="small-label">Most Likely Next Pitch</p>
        <div className="forecast-primary-main">
          <strong className="display">{pitchTypeName(mostLikelyPitch?.label)}</strong>
          <span>{mostLikelyPitch ? pct(mostLikelyPitch.probability) : "--"}</span>
        </div>
        <dl className="forecast-detail-grid">
          <div><dt>Location</dt><dd>{prediction.location.expected.label}</dd></div>
          <div><dt>Zone</dt><dd>{formatZone(prediction.location.expected.zone)}</dd></div>
          <div><dt>Horizontal</dt><dd>{formatFeet(prediction.location.expected.px)}</dd></div>
          <div><dt>Height</dt><dd>{formatFeet(prediction.location.expected.pz)}</dd></div>
          <div><dt>Velo read</dt><dd>{expectedVelocity !== null ? `${expectedVelocity.toFixed(1)} mph` : "--"}</dd></div>
          <div><dt>Likely result</dt><dd>{likelyResult ? `${likelyResult.label} ${pct(likelyResult.probability)}` : "--"}</dd></div>
          <div><dt>Next count</dt><dd>{likelyCount ? `${likelyCount.label} ${pct(likelyCount.probability)}` : "--"}</dd></div>
          <div><dt>Top 2 share</dt><dd>{pct(topTwo)}</dd></div>
        </dl>
      </section>

      <div className="model-detail-grid">
        <PossiblePitchList prediction={prediction} />
        <ProbabilityList title="Pitch Mix" items={prediction.pitchMix} labelFormatter={pitchTypeName} maxItems={prediction.pitchMix.length} />
        <ProbabilityList title="Location Density" items={prediction.location.density} maxItems={6} compact />
        <ProbabilityList title="Result Forecast" items={prediction.resultMix} maxItems={prediction.resultMix.length} compact />
        <ProbabilityList title="Next Count Forecast" items={prediction.countImpact} maxItems={prediction.countImpact.length} compact />
        <ProbabilityList title="PA Forecast" items={prediction.paForecast} maxItems={prediction.paForecast.length} compact />
      </div>
      <div className="forecast-meta">
        <span>Expected pitches remaining</span>
        <strong>{prediction.expectedPitchesRemaining.toFixed(1)}</strong>
      </div>
    </aside>
  );
}

function PossiblePitchList({ prediction }: { prediction: PredictionResponse }) {
  const candidates = rankPossiblePitches(prediction);
  const repeatedPitchFamilies = new Set(
    candidates
      .map((candidate) => candidate.pitch.pitchType)
      .filter((pitchType, index, pitchTypes) => pitchTypes.indexOf(pitchType) !== index)
  );

  if (!candidates.length) return null;
  return (
    <section className="possible-pitch-list">
      <div className="possible-pitch-header">
        <p className="small-label">Possible Next Pitches</p>
        <span>Ordered by forecast support</span>
      </div>
      <p className="possible-pitch-note">
        These are complete pitch events that fit the model read. Repeated pitch types are different executions,
        not extra votes for that pitch.
      </p>
      <div className="possible-pitch-rows">
        {candidates.map((candidate, index) => (
          <div
            className="possible-pitch-row"
            key={`${candidate.pitch.pitchType}-${candidate.pitch.velocity}-${candidate.pitch.location.label}-${candidate.pitch.result}-${index}`}
          >
            <span className="pitch-candidate-rank">{index + 1}</span>
            <div className="pitch-candidate-main">
              <strong>{pitchTypeName(candidate.pitch.pitchType)}</strong>
              <span>{candidate.pitch.velocity.toFixed(1)} mph · {candidate.pitch.location.label} · {resultLabel(candidate.pitch.result)}</span>
              {repeatedPitchFamilies.has(candidate.pitch.pitchType) ? (
                <small>Same pitch family, different location/result path</small>
              ) : null}
            </div>
            <dl className="pitch-candidate-support">
              <div><dt>Pitch</dt><dd>{pct(candidate.pitchProbability)}</dd></div>
              <div><dt>Location</dt><dd>{pct(candidate.locationProbability)}</dd></div>
              <div><dt>Result</dt><dd>{pct(candidate.resultProbability)}</dd></div>
            </dl>
          </div>
        ))}
      </div>
    </section>
  );
}

function rankPossiblePitches(prediction: PredictionResponse) {
  return prediction.possiblePitches
    .map((pitch, index) => {
      const pitchProbability = probabilityForLabel(prediction.pitchMix, pitch.pitchType);
      const locationProbability = probabilityForLabel(prediction.location.density, pitch.location.label);
      const resultProbability = probabilityForLabel(prediction.resultMix, resultSummary(pitch.result));
      return {
        pitch,
        pitchProbability,
        locationProbability,
        resultProbability,
        score: pitchProbability * 0.6 + locationProbability * 0.25 + resultProbability * 0.15,
        index
      };
    })
    .sort((first, second) => second.score - first.score || first.index - second.index);
}

function ProbabilityList({
  title,
  items,
  compact,
  labelFormatter,
  maxItems
}: {
  title?: string;
  items: Probability[];
  compact?: boolean;
  labelFormatter?: (label: string) => string;
  maxItems?: number;
}) {
  const visibleItems = sortedProbabilities(items).slice(0, maxItems ?? (compact ? 5 : 6));
  return (
    <div className={compact ? "mt-2" : "mt-4"}>
      {title ? <p className="small-label mb-2">{title}</p> : null}
      <div className="grid gap-2">
        {visibleItems.map((item) => (
          <div className="prob-row" key={item.label}>
            <span>{labelFormatter ? labelFormatter(item.label) : item.label}</span>
            <span className="prob-track"><span className="prob-fill block" style={{ width: `${item.probability * 100}%` }} /></span>
            <span className="text-right">{pct(item.probability)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
