# ADR: Remove Password Gate And Mock Predictions

- status: accepted
- date: 2026-05-10
- owners: project maintainers

## Context

The in-game pitch prediction cockpit is now intended to be directly accessible
as a demo surface. The previous shared-password gate added friction without
adding meaningful user identity or role-based authorization.

The product also needs a clear trust boundary around predictions. A user should
know when the real pitch model is ready, and prediction workflows should fail
visibly when the model is unavailable. Returning substitute values makes the UI
look healthy while skipping the intended model boundary.

## Decision

Remove the shared-password login/logout flow. The app issues a signed anonymous
workspace session automatically and scopes timeline reads and writes to that
workspace ID.

Remove the application mock prediction path. Prediction-producing operations
must call the configured real model service through the typed model adapter.
If the service is missing, unhealthy, times out, or returns malformed output,
the app returns an explicit error instead of generating a local prediction.

## Consequences

- The app can be opened without a password barrier.
- Timeline ownership still exists through signed anonymous workspace cookies.
- Prediction flows require either `MODEL_BASE_URL` plus any required
  `MODEL_API_KEY` for HTTP mode or `MODEL_LAMBDA_FUNCTION_NAME` plus IAM
  permission for Lambda mode.
- Product-flow verification treats real model readiness as required evidence.

## Verification

- API/session tests should prove anonymous workspace isolation.
- Domain tests should provide test prediction functions explicitly instead of
  relying on default prediction generation.
- End-to-end tests require a configured real model service.
