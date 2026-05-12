import { ArrowRight, Github, Loader2, Play, Radar, RotateCcw, ScanSearch } from "lucide-react";

export function IntroScreen({
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
      <div className="intro-hero" aria-labelledby="intro-title">
        <div className="intro-copy">
          <p className="small-label intro-kicker">
            <a
              href="https://github.com/saulrichardson/pitch-prediction-app-serverless"
              target="_blank"
              rel="noreferrer"
            >
              <Github size={13} />
              GitHub Repository
            </a>
          </p>
          <h1 id="intro-title" className="display">Predict the next pitch. Reveal the result.</h1>
          <div className="intro-actions">
            <button className="btn btn-primary intro-enter" disabled={isLoading || !isHydrated} onClick={onEnter}>
              {isLoading ? <Loader2 className="animate-spin" size={16} /> : <Play size={16} />}
              {isLoading ? loadingMessage ?? "Loading game" : isHydrated ? "Start Mets Replay" : "Preparing Replay"}
            </button>
            <a href="https://huggingface.co/baseball-analytica/pitchpredict-xlstm" target="_blank" rel="noreferrer">
              Model card <ArrowRight size={15} />
            </a>
          </div>
          {error ? <p className="intro-error">{error}</p> : null}
          <dl className="intro-facts" aria-label="Replay inputs and outputs">
            <div>
              <dt>Reads</dt>
              <dd>Pitcher, batter, count, bases, inning, score, sequence</dd>
            </div>
            <div>
              <dt>Shows</dt>
              <dd>Pitch mix, target location, result odds, next-count pressure</dd>
            </div>
            <div>
              <dt>Scores</dt>
              <dd>Actual pitch type, miss distance, result fit, state change</dd>
            </div>
          </dl>
        </div>

        <div className="intro-preview" aria-label="Replay walkthrough preview">
          <div className="preview-scoreboard">
            <span>NYM @ ARI</span>
            <strong>Pitch 1</strong>
            <span>Top 1 · 0-0 · 0 outs</span>
          </div>
          <div className="preview-main">
            <div className="preview-readout">
              <span className="small-label">Model Read</span>
              <strong className="display">Sinker</strong>
              <dl>
                <div><dt>Pitch</dt><dd>34%</dd></div>
                <div><dt>Zone</dt><dd>Low arm-side</dd></div>
                <div><dt>Result</dt><dd>Ground ball</dd></div>
              </dl>
            </div>
            <div className="preview-zone" aria-hidden="true">
              <span className="preview-zone-frame" />
              <svg className="preview-zone-line" viewBox="0 0 100 100" preserveAspectRatio="none" focusable="false">
                <line x1="55" y1="44" x2="63" y2="54" />
              </svg>
              <span className="preview-zone-dot forecast" />
              <span className="preview-zone-dot actual" />
            </div>
          </div>
          <ol className="preview-loop">
            <li>
              <ScanSearch size={18} />
              <div>
                <strong>Read</strong>
                <span>Forecast is locked before reveal.</span>
              </div>
            </li>
            <li>
              <Radar size={18} />
              <div>
                <strong>Reveal</strong>
                <span>Actual pitch is compared to the read.</span>
              </div>
            </li>
            <li>
              <RotateCcw size={18} />
              <div>
                <strong>Advance</strong>
                <span>Game context updates for the next pitch.</span>
              </div>
            </li>
          </ol>
        </div>
      </div>
    </section>
  );
}
