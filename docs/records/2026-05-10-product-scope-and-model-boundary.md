# Product Scope And Model Boundary

- date: 2026-05-10

## Context

The first implementation mixed a live/replay next-pitch prediction cockpit with
counterfactual branching and manual situation setup. That made the product
harder to explain and widened the active API/domain surface. The product also
had a shared password gate and mock prediction path that conflicted with the
goal of demonstrating a real model boundary.

## Record

The active v1 product is a real-game next-pitch replay cockpit:

```text
load game
  -> show model prediction before pitch
  -> reveal actual
  -> score model-vs-actual
  -> advance to the next prediction
```

Counterfactual branch controls, generated pitch cards, branch comparison,
branch APIs, and manual situation APIs are not part of the active v1
web/API/domain surface. If scenario analysis returns, build it as a separate
module with its own product language, routes, state model, persistence plan,
tests, and records.

The app has no shared-password barrier. It issues a signed anonymous workspace
session automatically and scopes timeline reads and writes to that workspace.

Production prediction flows require the real configured model service. Missing
model configuration, unhealthy readiness, timeouts, auth failures, malformed
responses, or missing fields must fail visibly instead of returning local mock
predictions.

The model service is a prediction dependency, not an authority. The browser
never calls the model directly and never receives model credentials or Lambda
invocation authority. Domain code owns reveal, advance, step-back, completion,
and browser redaction behavior.

## Evidence

- `apps/web/src/lib/timeline-service.ts` owns timeline commands.
- `apps/web/src/lib/timeline-dto.ts` shapes browser-safe responses.
- `apps/web/src/lib/model-service.ts` validates model-service outputs.
- `packages/domain/src/timeline.ts` and `packages/domain/src/state.ts` own replay
  and baseball state rules.
- `packages/domain/test/state.test.ts` covers reveal, advance, and history
  behavior.
- `scripts/verify-product-flows.mjs` verifies the public replay path.

## Future Guidance

Keep the primary cockpit focused until the replay loop is reliable, legible, and
easy to verify. Treat any return of scenario analysis, manual setup, mock
prediction, or user accounts as a first-class product and architecture change.
