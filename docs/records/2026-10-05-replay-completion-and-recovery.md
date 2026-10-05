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

Release validation also exposed local build contamination: Docker copied
557 MB of host Next.js output and omitted dependencies installed below the web
workspace in its dependency stage. Recursive Docker exclusions now remove host
dependencies, Next.js/CDK output and TypeScript build caches; the builder copies
the full clean dependency stage. The clean Linux production image built
successfully after these fixes. CI now builds that image as well as the normal
application, so a clean checkout exercises the actual release packaging.

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

## Production receipt

Application revision `6f2806668825dde3cf273a7a4a301b3e235179dc` is deployed as
`serverless-6f2806668825`, web version 3. CloudFormation reports
`UPDATE_COMPLETE`; CloudFront is deployed and the live alias has one READY
provisioned instance. The release image digest is
`sha256:639d4b02daf8039f788f0ea7d239de46e0f3e35dd2045f3f63a06c5161c120cd`.

The original three-pitch link was completed on the public site. The new primary
action opened Games, returning preserved pitch 3, the separate restart returned
to the same first forecast, and a second completion plus desktop refresh kept
the completed cursor. At 390 × 844 the primary action remained in view with no
horizontal overflow. Desktop refresh produced no console warnings or errors.
An invalid explicit link showed its validation message without substitution.
All seven live HTTP replay check groups and the seven-date, 17-game catalog
check passed. Six replay commands measured 75–100 ms (median 97 ms); this is a
smoke sample, not a load test.

The [application CI run](https://github.com/saulrichardson/pitch-prediction-app/actions/runs/37332075770)
passed 112 TypeScript tests including PostgreSQL, 30 model-service tests, and
29 browser checks (one desktop-only omission of the phone-specific test).
The [packaging CI run](https://github.com/saulrichardson/pitch-prediction-app/actions/runs/37333356847)
also passed the new production image build; its final browser result was still
pending when this receipt was written. Rollback configuration, the old web
version/image identity and private verification output remain in ignored
`.cache/replay-repair-2026-10-05/`. Existing editions and sessions were preserved.
