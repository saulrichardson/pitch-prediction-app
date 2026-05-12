import type {
  GameSummary,
  PitchEvaluation,
  PitchEvent,
  PitchMoment,
  PredictionResponse,
  StrikeZoneBounds
} from "@pitch/domain";
import { resultLabel } from "@pitch/domain";
import {
  expectedVelocityFor,
  pct,
  pitchTypeName,
  sortedProbabilities,
  stateSnapshot,
  topProbability
} from "./formatters";
import { LastPitchStrip } from "./state-summary";
import { StrikeZoneFrame, ZoneDot, ZoneMissLine, strikeZoneSourceLabel } from "./strike-zone";

export function ReadPanel({
  prediction,
  actualPitch,
  nextPitch,
  previousReveal,
  evaluation,
  game,
  strikeZone
}: {
  prediction: PredictionResponse;
  actualPitch?: PitchEvent;
  nextPitch?: PitchMoment | null;
  previousReveal?: { pitch: PitchEvent; evaluation: PitchEvaluation };
  evaluation?: PitchEvaluation;
  game: GameSummary | null;
  strikeZone: StrikeZoneBounds | null;
}) {
  const sortedPitchMix = sortedProbabilities(prediction.pitchMix);
  const mostLikelyPitch = sortedPitchMix[0];
  const likelyResult = topProbability(prediction.resultMix);
  const countImpact = topProbability(prediction.countImpact);
  const expectedVelocity = expectedVelocityFor(prediction, mostLikelyPitch?.label);
  const topTwo = sortedPitchMix.slice(0, 2).reduce((total, item) => total + item.probability, 0);

  return (
    <section className="panel read-panel p-4">
      <div className="read-grid">
        <div className="read-comparison" aria-label="Forecast and actual pitch comparison">
          <div className="read-card expected-column">
            <p className="small-label">Expected Pitch</p>
            <div className="read-main-row">
              <span className="display read-pitch-type">{pitchTypeName(mostLikelyPitch?.label)}</span>
              <span className="read-value">{mostLikelyPitch ? pct(mostLikelyPitch.probability) : "--"}</span>
            </div>
            <dl className="read-facts">
              <div><dt>Top 2 share</dt><dd>{pct(topTwo)}</dd></div>
              <div><dt>Location</dt><dd>{prediction.location.expected.label}</dd></div>
              <div><dt>Expected velo</dt><dd>{expectedVelocity !== null ? `${expectedVelocity.toFixed(1)} mph` : "--"}</dd></div>
              <div><dt>Expected result</dt><dd>{likelyResult ? `${likelyResult.label} ${pct(likelyResult.probability)}` : "--"}</dd></div>
              <div><dt>Next count</dt><dd>{countImpact ? `${countImpact.label} ${pct(countImpact.probability)}` : "--"}</dd></div>
            </dl>
          </div>

          <div className={`read-card ${actualPitch ? "actual-column" : "pending-column"}`}>
            <p className="small-label">Actual Pitch</p>
            {actualPitch ? (
              <>
                <div className="read-main-row">
                  <span className="display read-pitch-type">{pitchTypeName(actualPitch.pitchType)}</span>
                  <span className="read-value actual">{actualPitch.shape.velocity?.toFixed(1) ?? "--"} mph</span>
                </div>
                <dl className="read-facts">
                  <div><dt>Pitch rank</dt><dd>#{evaluation?.pitchTypeRank ?? "--"} · {pct(evaluation?.pitchTypeProbability ?? 0)}</dd></div>
                  <div><dt>Location</dt><dd>{actualPitch.location.label}</dd></div>
                  <div><dt>Result</dt><dd>{resultLabel(actualPitch.result)} · {pct(evaluation?.resultProbability ?? 0)}</dd></div>
                  <div><dt>After pitch</dt><dd>{stateSnapshot(game, nextPitch?.preState ?? actualPitch.postState)}</dd></div>
                  <div><dt>Loc miss</dt><dd>{evaluation?.locationErrorFeet !== null && evaluation?.locationErrorFeet !== undefined ? `${evaluation.locationErrorFeet.toFixed(2)} ft` : "--"}</dd></div>
                </dl>
              </>
            ) : (
              <div className="actual-pending-copy">
                <span>Ready to reveal</span>
                <p>Review the forecast, then click Reveal Actual to compare it with the pitch that was thrown.</p>
              </div>
            )}
          </div>
        </div>

        <div className="zone read-zone">
          <div className="zone-overlay-legend">
            <span className="zone-legend"><span className="legend-dot expected" />Forecast</span>
            {actualPitch ? <span className="zone-legend"><span className="legend-dot actual" />Actual</span> : null}
            {strikeZone ? <span className="zone-legend zone-source-label"><span className="legend-frame" />{strikeZoneSourceLabel(strikeZone.source)}</span> : null}
          </div>
          {strikeZone ? <StrikeZoneFrame strikeZone={strikeZone} /> : null}
          {Array.from({ length: 9 }).map((_, index) => <div className="zone-cell" key={index} />)}
          {actualPitch ? <ZoneMissLine from={prediction.location.expected} to={actualPitch.location} /> : null}
          <ZoneDot location={prediction.location.expected} label="Expected pitch location" />
          {actualPitch ? <ZoneDot location={actualPitch.location} actual label="Actual pitch location" /> : null}
        </div>
      </div>

      <div className="read-footer">
        {actualPitch && evaluation?.velocityErrorMph !== null && evaluation?.velocityErrorMph !== undefined ? (
          <span className="read-badge">Velo miss {evaluation.velocityErrorMph.toFixed(1)} mph</span>
        ) : null}
      </div>

      {!actualPitch && previousReveal ? <LastPitchStrip pitch={previousReveal.pitch} evaluation={previousReveal.evaluation} /> : null}
    </section>
  );
}
