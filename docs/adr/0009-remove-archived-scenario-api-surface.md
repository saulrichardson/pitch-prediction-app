# ADR: Remove Archived Scenario API Surface

- status: accepted
- date: 2026-05-12
- owners: project maintainers

## Context

The repo originally kept counterfactual branch APIs and manual situation APIs
after the primary product refocused on real-game next-pitch replay. That left
live routes, domain functions, tests, and documentation for behavior that was
not part of the v1 cockpit.

Keeping that code made the project harder to review because future agents had
to determine whether branch/manual behavior was still supported, archived, or
accidental.

## Decision

Remove branch and manual situation behavior from the active web/API/domain
surface.

The active v1 timeline state machine is now only:

```text
actual hidden -> reveal actual -> advance actual -> next actual hidden
```

The supported API surface is limited to session creation, game replay loading,
timeline creation, reveal, advance, and back-step.

Legacy PostgreSQL migration tables for branch/manual data are not dropped by
this decision. Dropping legacy durable tables would be a separate persistence
migration decision.

## Consequences

- The app has less live API surface to secure, test, and explain.
- Product-flow verification now covers the real-game replay loop only.
- Scenario analysis can return later only as a first-class module with its own
  feature brief, routes, state machine, tests, and docs.
- Existing old PostgreSQL installations may still contain unused legacy tables
  until a deliberate cleanup migration is approved.

## Verification

- TypeScript typecheck
- domain/API unit tests
- Playwright spec updated to current cockpit UI
- product-flow script updated to replay-only API surface
