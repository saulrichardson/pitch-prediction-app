# ADR: Refocus Primary UI On Next-Pitch Prediction

- status: accepted
- date: 2026-05-10
- owners: project maintainers

## Context

The initial product surface combined two related but different jobs:

- live/replay next-pitch prediction
- counterfactual pitch sequence branching and comparison

The shared backend and domain model can support both, but the primary cockpit
became too dense for the clearest baseball decision-maker use case. The most
legible v1 product is an in-game prediction loop: show what the real model
expects before the next pitch, reveal what happened, score the model read, and
advance to the next pitch.

Counterfactual analysis may still be valuable, but it is slower exploratory
work and needs a dedicated scenario module if it returns.

## Decision

Make the default web app an in-game/replay next-pitch prediction cockpit.

The primary UI should emphasize:

- current game situation
- pitch history
- model next-pitch read
- likely location
- actual reveal and model-vs-actual scoring
- one primary game-step control that alternates between reveal and advance
- manual current situation prediction

Remove counterfactual branch controls, generated pitch cards, branch comparison,
and branch path management from the default cockpit.

Keep existing branch/domain/API code as archived internal capability for now.
Do not present it as required v1 product behavior. If counterfactual analysis is
revived, build it as a separate Scenario Lab module with its own information
hierarchy and tests.

## Rationale

This preserves the typed model contract and replay state machine while reducing
product ambiguity. The model should first earn trust through a simple repeated
loop:

```text
game state + prior sequence -> model read -> actual reveal -> evaluation
```

That loop is useful to baseball analysts and decision makers without asking
them to manage branches, generated futures, or simulator assumptions.

## Alternatives Considered

- Keep all branch controls in the primary cockpit.
  This preserved more functionality on one screen but made the product feel
  like a simulator dashboard instead of a live next-pitch tool.
- Delete branch APIs and domain code immediately.
  That would reduce dead surface area but create unnecessary backend churn
  before a separate scenario module decision is made.
- Keep branching behind a small button in the main cockpit.
  That still forces the primary UI to explain a second product mode.

## Consequences

The v1 demo becomes easier to explain and verify:

```text
load game
predict before pitch
click game-step button to reveal actual
score model
click same button to advance
manual predict
```

Branch-related persistence and API routes remain in the codebase, but they are
not part of the primary UI acceptance path. Future work should either remove
them or promote them into a separate scenario module with dedicated product
language, docs, and tests.

## Verification

- product-flow verification focuses on replay reveal/advance and manual
  prediction
- UI smoke tests verify the protected cockpit entry flow and next-pitch
  positioning
- typecheck, lint, unit tests, build, and Playwright smoke test remain required
