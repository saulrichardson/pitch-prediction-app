"use client";
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  LoaderCircle,
  RotateCcw,
  CircleAlert,
} from "lucide-react";
import { useEffect, useRef } from "react";
import {
  resultLabel,
  type BaseState,
  type EditionSummary,
  type ReplayView,
} from "@pitch/domain";
import { useReplay } from "./replay/use-replay";
import { PitchPlot } from "./replay/pitch-plot";
import { gameDate, percent, pitchName, ranked } from "./replay/format";
import { GameBrowser } from "./replay/game-browser";

export default function PitchPredictionApp() {
  const app = useReplay();
  const replay = app.screen.kind === "ready" ? app.screen.replay : null;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        !replay ||
        app.busy ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        (event.target instanceof Element &&
          event.target.closest(
            "a,input,select,summary,textarea,[contenteditable=true]",
          ))
      )
        return;
      if (event.key === "ArrowLeft" && replay.step > 0 && !app.needsRetry) {
        event.preventDefault();
        void app.send("back");
      }
      if (event.key === "ArrowRight" && replay.phase !== "complete") {
        event.preventDefault();
        void app.send(replay.phase === "forecast" ? "reveal" : "next");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [replay, app]);

  return (
    <main className={`app-shell${replay ? " has-replay" : ""}`}>
      <nav className="masthead" aria-label="App">
        <div className="wordmark">
          <svg className="brand-mark" viewBox="0 0 28 28" aria-hidden="true">
            <path d="M6 4h16v14l-8 6-8-6Z" />
            <circle cx="14" cy="12" r="3" />
          </svg>
          Pitch<span className="wordmark-sub">Replay</span>
        </div>
        <div className="masthead-actions">
          <button
            className="text-button games-nav"
            onClick={() => app.browse()}
            disabled={app.busy}
            aria-current={app.screen.kind === "browse" ? "page" : undefined}
          >
            Games
          </button>
          <About />
        </div>
      </nav>
      {app.screen.kind === "loading" ? (
        <section className="loading-screen" role="status">
          <LoaderCircle className="spinner" size={24} />
          <p>Opening your replay</p>
        </section>
      ) : null}
      {app.screen.kind === "unavailable" ? (
        <section className="empty-screen">
          <CircleAlert size={28} />
          <h1>Replay unavailable.</h1>
          <p>{app.screen.message}</p>
          <button
            className="button primary"
            onClick={app.restore}
            disabled={app.busy}
          >
            {app.busy ? "Opening replay" : "Try again"} <ArrowRight size={16} />
          </button>
        </section>
      ) : null}
      {app.screen.kind === "intro" ? (
        <Intro
          edition={app.screen.edition}
          busy={app.busy}
          onStart={app.start}
          notice={app.notice}
          onBrowse={() => app.browse()}
        />
      ) : null}
      {app.screen.kind === "browse" ? (
        <GameBrowser
          date={app.screen.date}
          gamePk={app.screen.gamePk}
          busy={app.busy}
          notice={app.notice}
          onBrowse={app.browse}
          onOpen={app.openEdition}
          onReturn={app.returnToReplay}
        />
      ) : null}
      {replay ? (
        <>
          <Scoreboard replay={replay} />
          <div className="replay-heading">
            <div>
              <p className="eyebrow">At the plate</p>
              <h1>
                <span>{replay.current.matchup.pitcherName}</span>
                <span className="versus">to</span>
                <span>{replay.current.matchup.batterName}</span>
              </h1>
            </div>
            <div className="pitch-progress">
              <span>
                Pitch <strong>{replay.index + 1}</strong> /{" "}
                {replay.edition.pitchCount}
              </span>
              <div className="pitch-steps" aria-hidden="true">
                {Array.from(
                  { length: replay.edition.pitchCount },
                  (_, index) => (
                    <i
                      key={index}
                      className={
                        index === replay.index
                          ? "current"
                          : index < replay.index
                            ? "past"
                            : ""
                      }
                    />
                  ),
                )}
              </div>
            </div>
          </div>
          <section
            className="replay-stage"
            aria-label="Pitch prediction and actual comparison"
            aria-busy={app.busy}
          >
            <Forecast replay={replay} />
            <PitchPlot
              forecast={replay.prediction.location.expected}
              actual={replay.actual?.location ?? null}
              zone={replay.strikeZone}
            />
            <Actual replay={replay} />
          </section>
          <div className="action-dock">
            <div
              className="action-context"
              aria-live="polite"
              aria-atomic="true"
            >
              {app.notice ? (
                <span className="connection-notice">{app.notice}</span>
              ) : replay.phase === "complete" ? (
                <span className="sr-only">At-bat complete</span>
              ) : (
                <span className="sr-only">
                  {replay.phase === "forecast"
                    ? "Ready to reveal"
                    : "Ready for the next pitch"}
                </span>
              )}
            </div>
            <div className="action-buttons">
              <button
                className="button secondary back-button"
                onClick={() => app.send("back")}
                disabled={app.busy || replay.step === 0 || app.needsRetry}
                aria-label="Back one replay step"
              >
                <ArrowLeft size={17} />
                <span>Back</span>
              </button>
              <button
                className="button primary"
                onClick={() =>
                  app.send(
                    replay.phase === "complete"
                      ? "restart"
                      : replay.phase === "forecast"
                        ? "reveal"
                        : "next",
                  )
                }
                disabled={app.busy}
              >
                {app.busy ? (
                  <LoaderCircle className="spinner" size={17} />
                ) : null}
                {app.needsRetry && !app.busy
                  ? "Try again"
                  : replay.phase === "complete"
                    ? "Replay again"
                    : replay.phase === "forecast"
                      ? "Reveal pitch"
                      : "Next pitch"}
                {!app.busy ? (
                  replay.phase === "complete" ? (
                    <RotateCcw size={16} />
                  ) : (
                    <ArrowRight size={17} />
                  )
                ) : null}
              </button>
            </div>
          </div>
          {replay.summary ? (
            <section className="replay-summary" aria-label="At-bat summary">
              <div>
                <p className="eyebrow">At-bat complete</p>
                <h2>{replay.summary.outcome}</h2>
              </div>
              <p>
                <strong>
                  {replay.summary.topPicks} of {replay.summary.pitches}
                </strong>{" "}
                top picks matched
              </p>
              <p>
                <strong>
                  {replay.summary.topTwo} of {replay.summary.pitches}
                </strong>{" "}
                in the top two
              </p>
            </section>
          ) : null}
          <Details replay={replay} />
          <footer className="replay-footer">
            <span>
              {gameDate(replay.edition.game.officialDate)} · MLB replay
            </span>
            <span className="keyboard-hint">
              ← Back <span>·</span> → Continue
            </span>
          </footer>
        </>
      ) : null}
    </main>
  );
}

function About() {
  const details = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const dismissOutside = (event: PointerEvent) => {
      if (
        details.current?.open &&
        event.target instanceof Node &&
        !details.current.contains(event.target)
      )
        details.current.open = false;
    };
    const dismissEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && details.current?.open) {
        details.current.open = false;
        details.current.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("keydown", dismissEscape);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("keydown", dismissEscape);
    };
  }, []);
  return (
    <details className="about" ref={details}>
      <summary>
        About <ChevronDown size={13} />
      </summary>
      <div>
        <strong>Pitch Prediction</strong>
        <p>
          Real MLB at-bats, read pitch by pitch. Forecasts are generated with
          the xLSTM model and saved as a complete replay.
        </p>
        <a
          href="https://huggingface.co/baseball-analytica/pitchpredict-xlstm"
          target="_blank"
          rel="noreferrer"
        >
          Model card ↗
        </a>
        <a
          href="https://github.com/saulrichardson/pitch-prediction-app"
          target="_blank"
          rel="noreferrer"
        >
          Source code ↗
        </a>
      </div>
    </details>
  );
}
function Intro({
  edition,
  busy,
  onStart,
  notice,
  onBrowse,
}: {
  edition: EditionSummary;
  busy: boolean;
  onStart: () => void;
  notice: string | null;
  onBrowse: () => void;
}) {
  return (
    <section className="intro">
      <div className="intro-copy">
        <p className="eyebrow">Baseball, one pitch ahead</p>
        <h1>
          One pitch
          <br />
          <span>at a time.</span>
        </h1>
        <p className="intro-description">
          Read the forecast. Reveal the pitch.
        </p>
      </div>
      <div className="featured-replay">
        <div className="featured-meta">
          <span className="eyebrow">Featured replay</span>
          <span>{gameDate(edition.game.officialDate)}</span>
        </div>
        <div className="featured-teams">
          {edition.game.label.split(" @ ").map((team, index) => (
            <span key={team}>
              {index > 0 ? <small>at</small> : null}
              {team}
            </span>
          ))}
        </div>
        <div className="featured-matchup">
          <span>{edition.matchup.pitcherName}</span>
          <small>pitching to</small>
          <span>{edition.matchup.batterName}</span>
        </div>
        <div className="featured-bottom">
          <span>
            {edition.half === "top" ? "Top" : "Bottom"} {edition.inning}
          </span>
          <span>{edition.pitchCount} pitches</span>
        </div>
        <button
          className="button primary intro-start"
          onClick={onStart}
          disabled={busy}
        >
          {busy ? <LoaderCircle className="spinner" size={17} /> : null}
          {busy ? "Opening replay" : "Start replay"}
          <ArrowRight size={17} />
        </button>
        <button
          className="text-button intro-browse"
          onClick={onBrowse}
          disabled={busy}
        >
          Choose another game <ArrowRight size={15} />
        </button>
        {notice ? (
          <p className="connection-notice" role="status">
            {notice}
          </p>
        ) : null}
      </div>
    </section>
  );
}
function Bases({ bases }: { bases: BaseState }) {
  return (
    <svg
      className="bases"
      viewBox="0 0 44 36"
      role="img"
      aria-label={`Bases: ${[bases.first && "first", bases.second && "second", bases.third && "third"].filter(Boolean).join(", ") || "empty"}`}
    >
      <path
        className={bases.second ? "occupied" : ""}
        d="M22 1 L30 9 L22 17 L14 9 Z"
      />
      <path
        className={bases.third ? "occupied" : ""}
        d="M10 13 L18 21 L10 29 L2 21 Z"
      />
      <path
        className={bases.first ? "occupied" : ""}
        d="M34 13 L42 21 L34 29 L26 21 Z"
      />
    </svg>
  );
}
function Scoreboard({ replay }: { replay: ReplayView }) {
  const state = replay.current.preState;
  const teams = replay.edition.game.label.split(" @ ");
  return (
    <header className="scoreboard">
      <div className="score-teams">
        <span>
          {teams[0]} <b>{state.awayScore}</b>
        </span>
        <span className="score-separator">—</span>
        <span>
          {teams[1]} <b>{state.homeScore}</b>
        </span>
        <time>{gameDate(replay.edition.game.officialDate)}</time>
      </div>
      <div className="game-context">
        <span>
          {state.half === "top" ? "↑" : "↓"} {state.inning}
          <span className="sr-only"> {state.half}</span>
        </span>
        <span
          className="count"
          data-testid="count"
          aria-label={`${state.count.balls} balls, ${state.count.strikes} strikes`}
        >
          {state.count.balls}–{state.count.strikes}
        </span>
        <span className="outs" aria-label={`${state.outs} outs`}>
          {[0, 1, 2].map((i) => (
            <i className={i < state.outs ? "filled" : ""} key={i} />
          ))}
        </span>
        <Bases bases={state.bases} />
      </div>
    </header>
  );
}
function Forecast({ replay }: { replay: ReplayView }) {
  const mix = ranked(replay.prediction.pitchMix);
  const top = mix[0];
  const velocity = replay.prediction.velocity.find(
    (v) => v.pitchType === top.label,
  );
  return (
    <div className="forecast">
      <p className="eyebrow">
        <span className="status-dot" />
        Model forecast
      </p>
      <h2>{pitchName(top.label)}</h2>
      <div className="forecast-probability">
        {percent(top.probability)}
        <span>probability</span>
      </div>
      <div className="forecast-location">
        <strong>{replay.prediction.location.expected.label}</strong>
        <span>
          {velocity ? `${velocity.mean.toFixed(1)} mph` : "Location estimate"}
        </span>
      </div>
      <div className="alternatives" aria-label="Other likely pitches">
        {mix.slice(1, 3).map((item) => (
          <div key={item.label}>
            <span>{pitchName(item.label)}</span>
            <span>{percent(item.probability)}</span>
            <i style={{ width: `${item.probability * 100}%` }} />
          </div>
        ))}
      </div>
    </div>
  );
}
function Actual({ replay }: { replay: ReplayView }) {
  const last = replay.history.at(-1);
  return (
    <div
      className={`actual-card ${replay.actual ? "is-revealed" : ""}`}
      aria-live="polite"
      aria-atomic="true"
    >
      <p className="eyebrow">
        <span className="status-dot actual-dot" />
        Actual pitch
      </p>
      {replay.actual ? (
        <>
          <div className="actual-main">
            <h2>{pitchName(replay.actual.pitchType)}</h2>
            <strong>
              {replay.actual.shape.velocity?.toFixed(1) ?? "—"}
              <small> mph</small>
            </strong>
          </div>
          <div className="actual-result">
            <span>{replay.actual.location.label}</span>
            <strong>{resultLabel(replay.actual.result)}</strong>
          </div>
          <div className="actual-evaluation">
            <span>
              {replay.evaluation?.pitchTypeRank === 1
                ? "Top pick matched"
                : `Forecast rank ${replay.evaluation?.pitchTypeRank ? `#${replay.evaluation.pitchTypeRank}` : "—"}`}
            </span>
            <span>
              {percent(replay.evaluation?.pitchTypeProbability ?? 0)} model
              probability
            </span>
          </div>
        </>
      ) : (
        <div className="actual-hidden">
          <span className="hidden-mark" aria-hidden="true">
            —
          </span>
          <p className="reveal-prompt">Reveal to compare</p>
          {last ? (
            <p>
              Last pitch: <strong>{pitchName(last.actual.pitchType)}</strong> ·{" "}
              {resultLabel(last.actual.result)}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
function Details({ replay }: { replay: ReplayView }) {
  return (
    <details className="forecast-details">
      <summary>
        Explore the forecast <ChevronDown size={17} />
      </summary>
      <div className="details-content">
        <div className="distribution-grid">
          {[
            { title: "Pitch probabilities", items: replay.prediction.pitchMix },
            {
              title: "Sampled locations",
              items: replay.prediction.location.density,
            },
            { title: "Sampled results", items: replay.prediction.resultMix },
            { title: "Next count", items: replay.prediction.countImpact },
          ].map((group) => (
            <section key={group.title}>
              <h3>{group.title}</h3>
              {ranked(group.items)
                .filter((item) => item.probability > 0)
                .map((item) => (
                  <div className="distribution" key={item.label}>
                    <span>
                      {group.title === "Pitch probabilities"
                        ? pitchName(item.label)
                        : item.label}
                    </span>
                    <meter
                      value={item.probability}
                      min="0"
                      max="1"
                      aria-label={
                        group.title === "Pitch probabilities"
                          ? pitchName(item.label)
                          : item.label
                      }
                      aria-valuetext={percent(item.probability)}
                    />
                    <strong>{percent(item.probability)}</strong>
                  </div>
                ))}
            </section>
          ))}
        </div>
        <p className="methodology">
          Pitch probabilities come from{" "}
          {replay.prediction.pitchMixSource === "model"
            ? "the model distribution"
            : "the model samples"}
          . Location, result, and next-count estimates use{" "}
          {replay.prediction.sampleSize} model samples. Velocity averages the
          matching pitch type. The zone uses information available before this
          pitch. Model: {replay.prediction.modelVersion}.
        </p>
      </div>
    </details>
  );
}
