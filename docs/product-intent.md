# Product Intent

Pitch Prediction App makes a real MLB at-bat readable, one pitch ahead.
The user sees a forecast, reveals the actual pitch, and compares the two. The
experience should feel immediate, deliberate, and easy to understand without
instructions surrounding every action.

## Product Direction

The primary experience is a complete, prepared at-bat of 3–8 pitches from a
completed MLB game. Users can choose any team and any official game date in the
last seven days, including today. Dates follow America/New_York. The featured
replay remains a quick entry point; the Games browser offers the full schedule
without final scores. Live, postponed, and cancelled games show their status.
An edition is selected for a coherent sequence, never for a flattering model
result. A small complete experience is the unit of delivery.

A game is prepared once and shared across users. Its first opening queues
preparation with visible pitch progress; the user can keep browsing and return
after a refresh. Only a complete validated edition opens the replay. Later
openings use that edition immediately. Preparation uses the existing shared
limit of 20 model attempts per UTC day and 400 per month. A reached limit shows
the reset time and leaves saved games available.

A replay is ready before the first pitch. Opening it, revealing a pitch,
advancing, going back, refreshing, and restarting use the saved edition. Model
inference is publication work. It is never part of a replay command.

## Core Workflow

1. Open the feature or choose a date and game from Games.
2. Open the saved at-bat, or follow preparation progress, then read the leading
   forecast with two alternatives.
3. Reveal the actual pitch on the same comparison surface.
4. Advance to the next saved forecast.
5. Finish the at-bat, see the result and match count, and replay if desired.

Each game keeps its own cursor and pending action when the user switches games.
The main action changes from **Reveal pitch** to **Next pitch** to **Replay
again**. Back reverses one replay step. Refresh restores the same place. A failed
request has one retry action and preserves the last acknowledged view.

## Interface Principles

- The matchup and count provide context; the forecast and actual comparison are
  the focal point.
- One primary action stays in a stable location. Phone controls stay reachable.
- A shared strike zone makes differences visible. Forecast and actual keep
  distinct colors and the same coordinate frame.
- Secondary distributions and methodology are available on demand.
- Copy names the next action or the current problem. Routine infrastructure,
  caveats, repeated readiness assurances, and invented confidence labels do not
  occupy the main experience.
- Use the navy/orange baseball identity with restrained typography, spacing,
  contrast, and support for light, dark, and reduced-motion preferences.

## Prediction Integrity

Forecasts come from the real model. Each edition saves the request and response
for every pitch; history stops before the pitch being predicted. Hidden actual
pitch facts and final game scores stay on the server until reveal.

Pitch-type probabilities identify whether they came from the model distribution
or sample frequencies. Location, result, count, and velocity estimates use the
returned samples. Missing measurements stay missing. Small probabilities remain
visible as `<1%`. A two-strike ordinary foul keeps the count alive; foul tips and
bunt fouls use their actual baseball rules. No plate-appearance outcome is
invented from pitch-level probabilities.

## Users And Boundaries

Baseball analysts, coaches, fans, and technical evaluators should be able to
judge what the model expected and how it compared with a real sequence.
Individual accounts, manual scenario input, counterfactual branching, full-game
navigation, live inference, and batted-ball simulation are outside this primary
experience. A future expansion must preserve the immediate, coherent replay.

Anonymous sessions last 14 days. Existing editions remain available to their
sessions when a new feature is published. Publication failures leave the prior
feature available. The game browser loads the current MLB schedule on demand;
the featured edition remains operator-published without a daily scheduler.
