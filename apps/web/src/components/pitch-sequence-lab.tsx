"use client";

import {
  Activity,
  Loader2,
  Play,
  Undo2
} from "lucide-react";
import { useEffect, useState } from "react";
import type {
  ClientTimeline,
  GameSummary,
  PitchEvaluation,
  PitchEvent
} from "@pitch/domain";
import { strikeZoneForPitchDisplay } from "@pitch/domain";
import { getJson, postJson } from "./pitch-sequence-lab/api";
import { cap, formatGameDate, scoreLine } from "./pitch-sequence-lab/formatters";
import { IntroScreen } from "./pitch-sequence-lab/intro-screen";
import { MatchupBanner } from "./pitch-sequence-lab/matchup-banner";
import { PredictionPanel } from "./pitch-sequence-lab/prediction-panel";
import { ReadPanel } from "./pitch-sequence-lab/read-panel";
import { MiniBases, StatePill, lastCompletedReveal } from "./pitch-sequence-lab/state-summary";

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
    if (state.status !== "ready") return;
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
  const canStepGame = !isBusy && (!timeline.actualRevealed || !finalPitchCommitted);
  const canStepBack = !isBusy && (timeline.actualRevealed || timeline.currentPitchIndex > 0);
  const stepLabel = timeline.actualRevealed
    ? isLastPitch ? finalPitchCommitted ? "Game Complete" : "Finish Game" : "Next Pitch"
    : "Reveal Actual";
  const stepTitle = timeline.actualRevealed
    ? isLastPitch ? finalPitchCommitted ? "The replay has reached the final pitch." : "Commit the final pitch result to the replay history." : "Advance actual history and compute the next prediction."
    : "Reveal the actual pitch and compare it with the pre-pitch read.";
  const backTitle = timeline.actualRevealed
    ? "Return to the pre-pitch forecast."
    : "Return to the previous pitch result.";
  const StepIcon = timeline.actualRevealed ? Play : Activity;

  return (
    <main className="app-shell min-h-screen p-4 text-[var(--text)]">
      <header className="panel top-board mb-4">
        <div className="top-board-title">
          <p className="small-label">Pitch Prediction App</p>
          <h1 className="display text-4xl font-bold text-[var(--text-strong)]">{timeline.game.label}</h1>
          <p className="game-date" data-testid="game-date">
            Game date {formatGameDate(timeline.game.officialDate)} · {timeline.game.status}
          </p>
        </div>
        {currentPitch ? <MatchupBanner pitch={currentPitch} /> : null}
        <div className="state-strip">
          <StatePill testId="state-inning" label="Inning" value={activeState ? `${cap(activeState.half)} ${activeState.inning}` : "Not loaded"} />
          <StatePill testId="state-count" label="Count" value={activeState ? `${activeState.count.balls}-${activeState.count.strikes}` : "--"} emphasis />
          <StatePill testId="state-outs" label="Outs" value={activeState ? "●".repeat(activeState.outs).padEnd(3, "○") : "○○○"} />
          <StatePill testId="state-score" label="Score" value={activeState ? scoreLine(timeline.game, activeState) : "--"} />
          <div className="state-pill state-pill-bases" data-testid="state-bases">
            <span>Bases</span>
            {activeState ? <MiniBases bases={activeState.bases} /> : <MiniBases bases={{ first: false, second: false, third: false }} />}
          </div>
          <StatePill testId="state-pitch" label="Pitch" value={`P${timeline.currentPitchIndex + 1}`} />
        </div>
        <div className="top-actions">
          <button className="btn btn-primary" onClick={stepGame} disabled={!canStepGame} title={stepTitle}><StepIcon size={16} />{stepLabel}</button>
          <button className="btn" onClick={stepBack} disabled={!canStepBack} title={backTitle}><Undo2 size={16} />Back</button>
        </div>
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
              game={timeline.game}
              strikeZone={displayStrikeZone}
            />
          </section>
          <PredictionPanel prediction={activePrediction} />
        </>
      ) : null}
    </main>
  );
}
