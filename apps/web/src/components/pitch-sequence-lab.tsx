"use client";

import {
  Activity,
  Loader2,
  Play,
  Undo2
} from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";
import type {
  ClientTimeline,
  GameSummary,
  PitchEvaluation,
  PitchEvent,
  PitchMoment,
  PredictionResponse,
  Probability,
  StrikeZoneBounds,
} from "@pitch/domain";
import { resultLabel, resultSummary, strikeZoneForPitchDisplay } from "@pitch/domain";

type LoadState =
  | { status: "idle" }
  | { status: "loading"; message: string }
  | {
      status: "ready";
      timeline: ClientTimeline;
      game: GameSummary | null;
      evaluation?: PitchEvaluation;
      actualPitch?: PitchEvent;
      lastReveal?: { pitch: PitchEvent; evaluation: PitchEvaluation };
      notice?: { tone: "busy" | "error"; message: string };
    }
  | { status: "error"; message: string };

export default function PitchPredictionApp() {
  const [state, setState] = useState<LoadState>({ status: "idle" });
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    const hydrationReady = window.setTimeout(() => setIsHydrated(true), 0);
    return () => window.clearTimeout(hydrationReady);
  }, []);

  async function loadMetsGame() {
    await run("Loading latest Mets game", async () => {
      const latest = await getJson<{ game: GameSummary }>("/api/games/mets/latest");
      await getJson(`/api/games/${latest.game.gamePk}/replay`);
      const created = await postJson<{ timeline: ClientTimeline }>("/api/timelines", { gamePk: latest.game.gamePk });
      return { status: "ready", timeline: created.timeline, game: latest.game };
    });
  }

  async function revealActual() {
    if (state.status !== "ready") return;
    await run("Revealing actual pitch", async () => {
      const result = await postJson<{ timeline: ClientTimeline; pitch: PitchEvent; evaluation: PitchEvaluation }>(
        `/api/timelines/${state.timeline.id}/reveal`,
        {}
      );
      return {
        ...state,
        status: "ready",
        timeline: result.timeline,
        actualPitch: result.pitch,
        evaluation: result.evaluation,
        lastReveal: { pitch: result.pitch, evaluation: result.evaluation }
      };
    });
  }

  async function nextPitch() {
    if (state.status !== "ready") return;
    await run("Advancing along actual timeline", async () => {
      const result = await postJson<{ timeline: ClientTimeline }>(`/api/timelines/${state.timeline.id}/advance`, {});
      return { ...state, status: "ready", timeline: result.timeline, actualPitch: undefined, evaluation: undefined };
    });
  }

  async function stepBack() {
    if (state.status !== "ready") return;
    await run("Taking one replay step back", async () => {
      const result = await postJson<{ timeline: ClientTimeline; pitch?: PitchEvent; evaluation?: PitchEvaluation }>(
        `/api/timelines/${state.timeline.id}/back`,
        {}
      );
      const lastReveal = result.pitch && result.evaluation
        ? { pitch: result.pitch, evaluation: result.evaluation }
        : lastCompletedReveal(result.timeline);

      return {
        ...state,
        status: "ready",
        timeline: result.timeline,
        actualPitch: result.pitch,
        evaluation: result.evaluation,
        lastReveal
      };
    });
  }

  async function stepGame() {
    if (state.status !== "ready" || state.timeline.mode !== "real-game") return;
    if (state.timeline.actualRevealed) {
      await nextPitch();
    } else {
      await revealActual();
    }
  }

  async function run(message: string, fn: () => Promise<LoadState>) {
    const previous = state;
    if (previous.status === "ready") {
      setState({ ...previous, notice: { tone: "busy", message } });
    } else {
      setState({ status: "loading", message });
    }
    try {
      const next = await fn();
      setState(next.status === "ready" ? { ...next, notice: undefined } : next);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unexpected error";
      setState(previous.status === "ready" ? { ...previous, notice: { tone: "error", message: errorMessage } } : { status: "error", message: errorMessage });
    }
  }

  if (state.status !== "ready") {
    return (
      <main className="app-shell intro-page min-h-screen p-4 text-[var(--text)]">
        <IntroScreen
          error={state.status === "error" ? state.message : undefined}
          isHydrated={isHydrated}
          isLoading={state.status === "loading"}
          loadingMessage={state.status === "loading" ? state.message : undefined}
          onEnter={loadMetsGame}
        />
      </main>
    );
  }

  const timeline = state.timeline;
  const currentPitch = timeline.currentPitch;
  const nextActualPitch = timeline.nextPitchContext;
  const activePrediction = timeline.actualPrediction;
  const revealedPitch = state.actualPitch;
  const previousReveal = !revealedPitch ? state.lastReveal : undefined;
  const activeState = currentPitch?.preState ?? null;
  const history = timeline.actualHistory;
  const displayStrikeZone = currentPitch ? strikeZoneForPitchDisplay(currentPitch, history, revealedPitch) : null;
  const readEvaluation = state.evaluation ?? previousReveal?.evaluation;
  const isLastPitch = timeline.currentPitchIndex >= timeline.actualPitchCount - 1;
  const isBusy = state.notice?.tone === "busy";
  const finalPitchCommitted = isLastPitch &&
    timeline.actualRevealed &&
    Boolean(currentPitch && timeline.actualHistory.at(-1)?.id === currentPitch.id && timeline.actualForecastHistory.at(-1)?.pitchIndex === timeline.currentPitchIndex);
  const canStepGame = timeline.mode === "real-game" && !isBusy && (!timeline.actualRevealed || !finalPitchCommitted);
  const canStepBack = timeline.mode === "real-game" && !isBusy && (timeline.actualRevealed || timeline.currentPitchIndex > 0);
  const stepLabel = timeline?.mode !== "real-game"
    ? "Read Ready"
    : timeline.actualRevealed
      ? isLastPitch ? finalPitchCommitted ? "Game Complete" : "Finish Game" : "Next Pitch"
      : "Reveal Actual";
  const stepTitle = timeline?.mode !== "real-game"
    ? "This cockpit is focused on real-game replay."
    : timeline.actualRevealed
      ? isLastPitch ? finalPitchCommitted ? "The replay has reached the final pitch." : "Commit the final pitch result to the replay history." : "Advance actual history and compute the next prediction."
      : "Reveal the actual pitch and compare it with the pre-pitch read.";
  const backTitle = timeline.actualRevealed
    ? "Return to the pre-pitch forecast."
    : "Return to the previous pitch result.";
  const StepIcon = timeline?.actualRevealed ? Play : Activity;

  return (
    <main className="app-shell min-h-screen p-4 text-[var(--text)]">
      <header className="panel top-board mb-4">
        <div className="top-board-title">
          <p className="small-label">Pitch Prediction App</p>
          <h1 className="display text-4xl font-bold text-[var(--text-strong)]">{timeline?.game?.label ?? "Live next-pitch read"}</h1>
          {timeline?.game ? (
            <p className="game-date" data-testid="game-date">
              Game date {formatGameDate(timeline.game.officialDate)} · {timeline.game.status}
            </p>
          ) : null}
        </div>
        {currentPitch ? <MatchupBanner pitch={currentPitch} /> : null}
        <div className="state-strip">
          <StatePill testId="state-inning" label="Inning" value={activeState ? `${cap(activeState.half)} ${activeState.inning}` : "Not loaded"} />
          <StatePill testId="state-count" label="Count" value={activeState ? `${activeState.count.balls}-${activeState.count.strikes}` : "--"} emphasis />
          <StatePill testId="state-outs" label="Outs" value={activeState ? "●".repeat(activeState.outs).padEnd(3, "○") : "○○○"} />
          <StatePill testId="state-score" label="Score" value={activeState ? scoreLine(timeline?.game ?? null, activeState) : "--"} />
          <div className="state-pill state-pill-bases" data-testid="state-bases">
            <span>Bases</span>
            {activeState ? <MiniBases bases={activeState.bases} /> : <MiniBases bases={{ first: false, second: false, third: false }} />}
          </div>
          <StatePill testId="state-pitch" label="Pitch" value={`P${(timeline?.currentPitchIndex ?? 0) + 1}`} />
        </div>
        {timeline ? (
          <div className="top-actions">
            <button className="btn btn-primary" onClick={stepGame} disabled={!canStepGame} title={stepTitle}><StepIcon size={16} />{stepLabel}</button>
            <button className="btn" onClick={stepBack} disabled={!canStepBack} title={backTitle}><Undo2 size={16} />Back</button>
          </div>
        ) : null}
      </header>

      {state.notice ? (
        <section className={`panel mb-4 flex items-center gap-2 p-3 text-sm font-bold ${state.notice.tone === "error" ? "notice-error" : "notice-busy"}`} aria-live="polite">
          {state.notice.tone === "busy" ? <Loader2 className="animate-spin" size={16} /> : null}
          {state.notice.message}
        </section>
      ) : null}

      {currentPitch && activePrediction && activeState ? (
        <>
          <section className="cockpit-main-grid gap-4" aria-busy={isBusy}>
            <ReadPanel
              prediction={activePrediction}
              nextPitch={nextActualPitch}
              actualPitch={revealedPitch}
              previousReveal={previousReveal}
              evaluation={readEvaluation}
              game={timeline.game ?? null}
              strikeZone={displayStrikeZone}
            />
          </section>
          <PredictionPanel prediction={activePrediction} />
        </>
      ) : null}
    </main>
  );
}

function IntroScreen({
  error,
  isHydrated,
  isLoading,
  loadingMessage,
  onEnter
}: {
  error?: string;
  isHydrated: boolean;
  isLoading: boolean;
  loadingMessage?: string;
  onEnter: () => void;
}) {
  return (
    <section className="intro-board">
      <div className="intro-hero">
        <div className="intro-copy">
          <p className="small-label">Pitch Prediction App</p>
          <h1 className="display">In-game next-pitch predictor.</h1>
          <p className="intro-lede">
            Replay a real MLB game one pitch at a time. Before each pitch is shown, the model reads the pitcher,
            batter, count, base state, score, inning, and previous pitch sequence.
          </p>
          <div className="intro-rail" aria-label="Replay flow">
            <span>Pre-pitch forecast</span>
            <span>Reveal actual</span>
            <span>Advance game state</span>
          </div>
        </div>
        <div className="intro-command">
          <p className="small-label">Start here</p>
          <strong>Latest Mets game</strong>
          <span>Loads the latest available Mets replay and lands on Pitch 1 with the model forecast already on screen.</span>
          <button className="btn btn-primary intro-enter" disabled={isLoading || !isHydrated} onClick={onEnter}>
            {isLoading ? <Loader2 className="animate-spin" size={16} /> : <Play size={16} />}
            {isLoading ? loadingMessage ?? "Loading game" : isHydrated ? "Start Mets Replay" : "Preparing Replay"}
          </button>
          {error ? <p className="intro-error">{error}</p> : null}
        </div>
      </div>
      <div className="intro-walkthrough panel">
        <div className="intro-walkthrough-copy">
          <p className="small-label">What we built</p>
          <h2 className="display">A live-feeling replay cockpit for model reads.</h2>
          <p>
            The app loads public MLB game data, records the model forecast before each pitch, then lets you reveal
            the actual pitch and advance the real game state. It is built around the question a manager cares about:
            what is most likely next from this pitcher, batter, count, and sequence?
          </p>
          <a href="https://huggingface.co/baseball-analytica/pitchpredict-xlstm" target="_blank" rel="noreferrer">
            View the pitchpredict-xlstm model
          </a>
        </div>
        <div className="intro-steps" aria-label="How to use the simulator">
          <div>
            <span>01</span>
            <strong>Read the forecast</strong>
            <p>Start with the likely pitch type, location, result, and next-count pressure before the actual pitch appears.</p>
          </div>
          <div>
            <span>02</span>
            <strong>Reveal the pitch</strong>
            <p>Compare the forecast against pitch type, velocity, location miss, result probability, and count change.</p>
          </div>
          <div>
            <span>03</span>
            <strong>Advance the game</strong>
            <p>The actual pitch becomes history, the count and matchup update, and the next model read is computed.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function MatchupBanner({ pitch }: { pitch: PitchMoment }) {
  return (
    <section className="matchup-banner" data-testid="top-matchup" aria-label={`${pitch.matchup.pitcherName} versus ${pitch.matchup.batterName}`}>
      <PlayerCard
        id={pitch.matchup.pitcherId}
        name={pitch.matchup.pitcherName}
        meta={handLabel(pitch.matchup.pitcherHand)}
        role="Pitcher"
      />
      <span className="matchup-vs">vs</span>
      <PlayerCard
        id={pitch.matchup.batterId}
        name={pitch.matchup.batterName}
        meta={`Bats ${batSideText(pitch.matchup.batterSide)}`}
        role="Batter"
      />
    </section>
  );
}

function PlayerCard({ id, name, meta, role }: { id: string; name: string; meta: string; role: string }) {
  const headshotUrl = mlbHeadshotUrl(id);
  return (
    <div className="matchup-player">
      <div className="player-photo" aria-hidden="true">
        <span>{playerInitials(name)}</span>
        {headshotUrl ? (
          <Image
            alt=""
            className="player-photo-img"
            fill
            sizes="58px"
            src={headshotUrl}
            unoptimized
            onError={(event) => {
              event.currentTarget.style.display = "none";
            }}
          />
        ) : null}
      </div>
      <div>
        <p className="small-label">{role}</p>
        <strong>{name}</strong>
        <span>{meta}</span>
      </div>
    </div>
  );
}

function ReadPanel({
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

function PredictionPanel({
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

function StatePill({ label, value, emphasis, testId }: { label: string; value: string; emphasis?: boolean; testId?: string }) {
  return (
    <div className={`state-pill ${emphasis ? "state-pill-emphasis" : ""}`} data-testid={testId}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function MiniBases({ bases }: { bases: PitchEvent["preState"]["bases"] }) {
  return (
    <div className="mini-bases" aria-label={`Bases: ${basesLabel(bases)}`}>
      <span className={`mini-base second ${bases.second ? "on" : ""}`} />
      <span className={`mini-base third ${bases.third ? "on" : ""}`} />
      <span className={`mini-base first ${bases.first ? "on" : ""}`} />
    </div>
  );
}

function LastPitchStrip({ pitch, evaluation }: { pitch: PitchEvent; evaluation: PitchEvaluation }) {
  return (
    <div className="last-pitch-strip">
      <p className="small-label">Last Pitch</p>
      <strong>P{pitch.gamePitchIndex + 1} {pitchTypeName(pitch.pitchType)} {pitch.shape.velocity?.toFixed(1) ?? "--"} mph, {resultLabel(pitch.result)}</strong>
      <span>Forecast rank #{evaluation.pitchTypeRank ?? "--"} at {pct(evaluation.pitchTypeProbability)} · {evaluation.label}</span>
    </div>
  );
}

function lastCompletedReveal(timeline: ClientTimeline): { pitch: PitchEvent; evaluation: PitchEvaluation } | undefined {
  const forecast = timeline.actualForecastHistory.at(-1);
  if (!forecast) return undefined;
  const pitch = timeline.actualHistory.at(-1);
  return pitch ? { pitch, evaluation: forecast.evaluation } : undefined;
}

function PossiblePitchList({ prediction }: { prediction: PredictionResponse }) {
  const scenarios = rankPossiblePitches(prediction);
  const repeatedPitchFamilies = new Set(
    scenarios
      .map((scenario) => scenario.pitch.pitchType)
      .filter((pitchType, index, pitchTypes) => pitchTypes.indexOf(pitchType) !== index)
  );

  if (!scenarios.length) return null;
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
        {scenarios.map((scenario, index) => (
          <div
            className="possible-pitch-row"
            key={`${scenario.pitch.pitchType}-${scenario.pitch.velocity}-${scenario.pitch.location.label}-${scenario.pitch.result}-${index}`}
          >
            <span className="scenario-rank">{index + 1}</span>
            <div className="scenario-main">
              <strong>{pitchTypeName(scenario.pitch.pitchType)}</strong>
              <span>{scenario.pitch.velocity.toFixed(1)} mph · {scenario.pitch.location.label} · {resultLabel(scenario.pitch.result)}</span>
              {repeatedPitchFamilies.has(scenario.pitch.pitchType) ? (
                <small>Same pitch family, different location/result path</small>
              ) : null}
            </div>
            <dl className="scenario-support">
              <div><dt>Pitch</dt><dd>{pct(scenario.pitchProbability)}</dd></div>
              <div><dt>Location</dt><dd>{pct(scenario.locationProbability)}</dd></div>
              <div><dt>Result</dt><dd>{pct(scenario.resultProbability)}</dd></div>
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

function probabilityForLabel(items: Probability[], label: string): number {
  return items.find((item) => item.label === label)?.probability ?? 0;
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

const PITCH_PLOT = {
  pxMin: -2,
  pxMax: 2,
  pzMin: 0.4,
  pzMax: 4.4
};

function StrikeZoneFrame({ strikeZone }: { strikeZone: StrikeZoneBounds }) {
  const halfWidth = strikeZoneHalfWidthFeet(strikeZone.width);
  const left = plotX(-halfWidth);
  const right = plotX(halfWidth);
  const top = plotY(strikeZone.top);
  const bottom = plotY(strikeZone.bottom);
  return (
    <div
      aria-hidden="true"
      className="strike-zone-frame"
      style={{
        left: `${left}%`,
        top: `${top}%`,
        width: `${right - left}%`,
        height: `${bottom - top}%`
      }}
    >
      <span />
      <span />
      <span />
      <span />
      <em>{strikeZoneSourceLabel(strikeZone.source)}</em>
    </div>
  );
}

function strikeZoneHalfWidthFeet(width: number | null): number {
  if (width === null || !Number.isFinite(width) || width <= 0) return 17 / 24;
  const widthFeet = width > 3 ? width / 12 : width;
  return clamp(widthFeet / 2, 0.55, 1.05);
}

function strikeZoneSourceLabel(source: StrikeZoneBounds["source"]): string {
  if (source === "measured") return "Measured zone";
  if (source === "estimated") return "Estimated zone";
  return "Standard zone";
}

function ZoneDot({
  location,
  actual,
  label
}: {
  location: { px: number | null; pz: number | null };
  actual?: boolean;
  label?: string;
}) {
  const position = locationPosition(location);
  return (
    <span
      aria-label={label ?? (actual ? "Actual pitch location" : "Expected pitch location")}
      className={`zone-dot ${actual ? "actual-dot" : ""}`}
      role="img"
      style={{ left: `${position.left}%`, top: `${position.top}%` }}
      title={label}
    />
  );
}

function ZoneMissLine({
  from,
  to
}: {
  from: { px: number | null; pz: number | null };
  to: { px: number | null; pz: number | null };
}) {
  if (from.px === null || from.pz === null || to.px === null || to.pz === null) return null;
  const start = locationPosition(from);
  const end = locationPosition(to);
  return (
    <svg
      aria-hidden="true"
      className="zone-miss-line"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
    >
      <line
        className="zone-miss-line-shadow"
        x1={start.left}
        y1={start.top}
        x2={end.left}
        y2={end.top}
        vectorEffect="non-scaling-stroke"
      />
      <line
        className="zone-miss-line-path"
        x1={start.left}
        y1={start.top}
        x2={end.left}
        y2={end.top}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function locationPosition(location: { px: number | null; pz: number | null }): { left: number; top: number } {
  return {
    left: location.px === null ? 50 : plotX(location.px),
    top: location.pz === null ? 50 : plotY(location.pz)
  };
}

function plotX(px: number): number {
  const raw = ((px - PITCH_PLOT.pxMin) / (PITCH_PLOT.pxMax - PITCH_PLOT.pxMin)) * 100;
  return clamp(raw, 4, 96);
}

function plotY(pz: number): number {
  const raw = ((PITCH_PLOT.pzMax - pz) / (PITCH_PLOT.pzMax - PITCH_PLOT.pzMin)) * 100;
  return clamp(raw, 4, 96);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.error ?? `Request failed: ${response.status}`);
  return response.json() as Promise<T>;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.error ?? `Request failed: ${response.status}`);
  return response.json() as Promise<T>;
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function sortedProbabilities(items: Probability[]): Probability[] {
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

function topProbability(items: Probability[]): Probability | undefined {
  return sortedProbabilities(items)[0];
}

function expectedVelocityFor(prediction: PredictionResponse, pitchType?: string): number | null {
  const matchingPitch = pitchType ? prediction.possiblePitches.find((pitch) => pitch.pitchType === pitchType) : null;
  return matchingPitch?.velocity ?? prediction.possiblePitches[0]?.velocity ?? null;
}

function formatFeet(value: number | null): string {
  return value === null ? "--" : `${value.toFixed(2)} ft`;
}

function formatZone(zone: number | null): string {
  return zone === null ? "--" : `Zone ${zone}`;
}

function pitchTypeName(pitchType?: string): string {
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

function cap(value: string): string {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

function scoreLine(game: GameSummary | null, state: PitchEvent["preState"]): string {
  const [away, home] = teamCodes(game);
  return `${away} ${state.awayScore} - ${state.homeScore} ${home}`;
}

function formatGameDate(officialDate: string): string {
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

function stateSnapshot(game: GameSummary | null, state: PitchEvent["preState"]): string {
  return `${state.count.balls}-${state.count.strikes}, ${outsLabel(state.outs)}, ${basesLabel(state.bases)}, ${scoreLine(game, state)}`;
}

function outsLabel(outs: PitchEvent["preState"]["outs"]): string {
  return `${outs} out${outs === 1 ? "" : "s"}`;
}

function basesLabel(bases: PitchEvent["preState"]["bases"]): string {
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

function handLabel(hand: PitchEvent["matchup"]["pitcherHand"]): string {
  if (hand === "L") return "LHP";
  if (hand === "R") return "RHP";
  return "Pitcher";
}

function batSideText(side: PitchEvent["matchup"]["batterSide"]): string {
  if (side === "L") return "left";
  if (side === "R") return "right";
  if (side === "S") return "switch";
  return "unknown";
}

function mlbHeadshotUrl(playerId: string): string | null {
  return /^\d+$/.test(playerId)
    ? `https://img.mlbstatic.com/mlb-photos/image/upload/w_120,q_auto:best/v1/people/${playerId}/headshot/67/current`
    : null;
}

function playerInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.slice(0, 1).toUpperCase())
    .join("") || "--";
}
