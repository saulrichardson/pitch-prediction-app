import { Loader2, Play } from "lucide-react";

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
