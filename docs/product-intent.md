# Product Intent

This is the project-owned place for describing what the product is actually
trying to become.

Use it for raw thoughts, product narrative, desired functionality, workflow
ideas, model-service behavior, constraints, examples, open questions, and notes
that are not yet ready to become formal contracts or ADRs.

This file may be messy while the product is still being understood. It should
be useful to humans and coding agents trying to understand the goal behind the
work.

## Raw Notes

- Pitch Prediction App is now focused on in-game and replay next-pitch
  prediction.
- The user loads a real MLB game, steps through it pitch by pitch as if it were
  live, sees what the model expected before each actual pitch, then uses one
  primary game-step button to reveal what happened and advance to the next
  prediction.
- Counterfactual branching and manual current-situation setup are outside the
  active v1 web/API surface. The first product surface should not ask managers
  to enter game state by hand or manage generated branches.
- The first demo defaults to the latest Mets game available from public MLB
  data.

## Product Narrative

What are we building, for whom, and why?

Pitch Prediction App is a compact in-game prediction cockpit. It answers:
given this pitcher, batter, game state, and pitch history, what is most likely
on the next pitch?

The product should feel like a live read, not a simulator dashboard. Its core
loop is:

```text
current game state
  -> model next-pitch read
  -> actual pitch reveal
  -> model-vs-actual score
  -> next pitch read
```

The main replay control alternates by state:

```text
prediction visible, actual hidden -> click Reveal Actual
actual visible, model scored      -> click Next Pitch
next prediction visible           -> repeat
```

## Desired Functionality

What should the product let users do?

- Load a real Mets game and replay it pitch by pitch.
- See model predictions before actual pitches are revealed.
- Step the replay with one primary button that alternates between reveal and
  advance.
- Score actual pitches against model expectation.
- Give decision makers a compact manager read: model confidence, top-two pitch
  concentration, likely location, likely pitch-level result, and count impact.
- Keep the previous pitch's model-vs-actual check visible after advancing so a
  user can calibrate the model while reading the next pitch.
- Inspect secondary model detail such as pitch-level result and count impact
  when needed, without making those details dominate the default screen.

## Users And Jobs

Who uses this system, and what job are they trying to get done?

Primary users are baseball analysts, coaches, technical evaluators, and
baseball decision makers who want a fast read on what the model expects next
from the current pitcher, batter, count, game state, and prior sequence.

## Model Service Role

What role should the pitch model service play?

What should they never decide or do?

The separate pitch model is a prediction service, not an authority. The app
validates model responses and uses deterministic domain rules for timeline
state changes.

## Core Workflows

What are the most important end-to-end workflows?

- Real game replay: load latest Mets game, predict before reveal, click the
  game-step button to reveal actual, click the same button again to append that
  actual pitch into history and compute the next prediction.
- Model readiness: make real-model-ready and unavailable states clear. The
  product should not provide substitute predictions when the real model is not
  working.
- Scenario analysis may return later as a separate module, but it should not
  crowd the in-game prediction UI or leak into the v1 replay API surface.

## Boundaries And Non-Goals

What should stay out of scope?

What behavior would make the product confusing, unsafe, or untrustworthy?

- V1 does not host model weights or expose model plumbing to the browser.
- V1 does not provide full batted-ball simulation after ball in play.
- V1 does not include individual user accounts or large-scale collaboration.
- Main UI should avoid raw IDs, logits, embeddings, or request JSON unless a
  detail panel is explicitly opened.
- Main UI should not expose counterfactual branch controls, generated pitch
  cards, or branch comparison controls. Those belong in a separate scenario
  module if the product later returns to counterfactual analysis.
- Main UI should not expose manual state-entry controls. Those belong in a
  separate setup or scouting module if the product returns to manual prediction.

## Examples

Representative examples, scenarios, sample inputs, sample outputs, or sketches:

- Before reveal: the app shows `Most likely SI 35%`, likely location `Middle
  Away`, and top alternatives.
- After reveal: the app shows `Actual was FF called strike`, the model rank and
  probability for `FF`, the result probability, and an expectedness label.
- On the next click: the previous pitch is appended to actual history and the
  next real pitch receives a fresh model prediction.

## Open Questions

- Which real model service URL and authentication scheme will production use?
- What retention policy should anonymous workspace sessions use?

## Promote Stable Facts

When a note here becomes stable and important, move or summarize it into the
right durable artifact:

- `docs/project-profile.md` for concise project facts, constraints, users,
  stack choices, invariants, and non-goals
- `docs/templates/feature-brief.md` for a specific feature before implementation
- `docs/adr/` for architecture, stack, policy, persistence, or workflow decisions
- `docs/contracts/` for state machines, model-service behavior, policy inputs,
  side-effect capabilities, workflow events, and telemetry events
- `docs/security/threat-model.md` for security and abuse-risk assumptions

Coding agents may use this file to understand intent, but this file is not by
itself an execution contract. Important behavior should be promoted into the
project profile, contracts, feature briefs, tests, or ADRs before implementation
depends on it.
