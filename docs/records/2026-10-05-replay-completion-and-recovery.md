# Replay completion and recovery

- date: 2026-10-05

## Cause and change

The reported featured URL opens the saved three-pitch Cole/Lindor at-bat.
Live browser and HTTP checks reached all three pitches successfully. The final
primary action then changed to **Replay again**, restarting the same sequence
when the visitor continued clicking in place. Completion now keeps the final
pitch, labels the heading **At-bat complete**, and offers **Choose another
game**. Restart is a separate action in the recap. This preserves the prepared
at-bat unit; it does not add full-game stepping or generate new predictions.

Browser regression tests also reproduced a stale restoration response clearing
a newly opened game's URL and local resume ID, a missing explicit replay link
silently falling back to an unrelated feature, and a rejected preparation
request losing its error during status polling. Restoration now checks its
generation before recovery side effects, explicit invalid/missing links show
an error, and request errors are stored separately from status-read errors.
Viewing ongoing preparation reads progress without submitting another request.

The GitHub deployment workflow now calls the same web release script as local
releases. Its former direct CDK step omitted publishing the immutable S3
release document/assets and the warm-alias verification.

Five existing workflow tests expired their September fixtures against the real
October storage clock. Their injected storage and service clocks now agree,
including simulated time advancement; the assertions and production TTL rules
are unchanged.

## Verification

The new completion, stale-response, missing-link and preparation-error browser
checks failed against the previous source and passed after repair. The local
verification includes unit/model tests, type checks, lint, production build,
static asset size checks, infrastructure synthesis, HTTP flows and the full
phone/desktop browser suite. PostgreSQL coverage runs separately in CI.

Keep old editions and session ownership intact. A session-not-found 404 for a
new browser is followed by an idempotent start of the same edition; it is not
an unavailable edition or a reason to substitute a different game.
