# Prepared Replay Refactor Verification

- date: 2026-09-12
- status: historical local verification; subsequently [deployed and verified](2026-09-12-production-release.md)
- original branch: `codex/replay-experience-refactor` (now integrated into `main` and removed)
- decision and rollout: [prepared replay delivery](2026-09-12-prepared-replay-delivery.md)
- baseline: [September 11 production audit](2026-09-11-product-experience-audit.md)

## Result

The public interaction is now a complete prepared at-bat. The operator generates
and validates real forecasts before publication. Reveal, Next, Back, refresh,
and restart operate on an immutable edition and a workspace-owned cursor.
The web role cannot invoke the model. This makes forecast stability and the
absence of per-click inference properties of the architecture.

The interface has one comparison surface, one primary action, a compact score
context, and optional forecast detail. Repeated readiness copy and unsupported
plate-appearance statistics are removed. Light/dark appearance, keyboard
navigation, reduced motion, missing measurements, and off-plot locations have
explicit behavior.

## Authentic Model And Database Exercise

Prepared all seven pitches of Carlos Rodón pitching to Francisco Lindor in the
September 11 NYM @ NYY game through the real local xLSTM service:

- checkpoint: `97a87376621182e14cbd9c5b6c21077189b7df64`
- artifact: `xlstm-97a87376621182e14cbd9c5b6c21077189b7df64-normalizer-v3-samples8`
- edition: `a413ede1df60d3f2c15f72a31a625c23a799d6a6f05e6a01f169102d8f122f2f`
- review JSON: `.cache/real-edition-v3.json` (local, ignored by Git)

Applied the additive migration to a disposable local PostgreSQL database and
published the reviewed edition through the real operator CLI. Ran the packaged
Next.js standalone production server against that database, then shut down the
model service. Completed the replay through both the browser and HTTP verifier.

The real database test found JSONB object-key reordering at the publication
boundary. Edition comparison now uses semantic deep equality; a regression
test covers reordered object keys. Conditional writes, expiry, independent
workspace ownership, and concurrent command conflicts also passed.

## Measurements

These compare the audited deployed app with the local refactor. They establish
the eliminated work and verified behavior, not a deployed latency guarantee.

| Concern | Deployed baseline | Refactored production build, local PostgreSQL |
| --- | --- | --- |
| Next/revisit API | About 8.16 / 8.19 seconds; invokes model | 14 measured commands, median 3 ms, p95/max 4 ms; model service stopped |
| Back then Next | Same pitch had different generated values | Exact saved forecast preserved |
| Refresh | Returned to intro and lost place | Restored the same pitch and reveal state, including after server restart |
| Lost command response | No durable reconciliation | Reads committed cursor, acknowledges once; original UUID survives refresh if retry remains necessary |
| Phone, 390 × 844 | About 4,705 px page; zone began around 1,383 px | About 893 px collapsed replay; primary action inside first viewport |
| Reveal layout | Comparison and controls far apart | Phone actual panel remains 132 px; measured primary-button movement 0 px |

The final HTTP report is `.cache/real-product-verification.txt`. Measurements
use a small sequential run, not a load test or an estimate of AWS percentiles.

## Checks Completed

- Type checking across web, domain, database, infrastructure, operator scripts,
  fixtures, and browser-test source: passed.
- Vitest: 14 files, 62 tests passed, including the real PostgreSQL integration
  path with `TEST_POSTGRES_URL` set.
- Python model tests: 22 passed.
- ESLint and optimized production build: passed.
- AWS CDK synthesis and infrastructure assertions: passed. The web IAM policy
  contains no model or self-invocation permission.
- Dependency audit: zero reported vulnerabilities after compatible updates.
- Deterministic local HTTP verification: all seven groups passed.
- Authentic edition / standalone server / PostgreSQL HTTP verification: all
  seven groups passed, with the model service stopped.
- `git diff --check`: passed.

The HTTP groups cover real readiness, idempotent start, spoiler redaction,
workspace ownership, origin/input rejection, repeated UUIDs, stale revisions,
Back/Next stability, a single winner for concurrent writes, completion, and
restart.

## Browser Checks Completed

Used the actual in-app browser against the packaged production server:

- Revisited pitch four and compared the visible forecast exactly.
- Used the arrow key while the primary control had focus.
- Went offline during a reveal, reconnected, refreshed, and retried the saved
  action without losing or duplicating the step.
- Dropped a successful POST response and allowed the recovery GET to complete;
  the UI reconciled automatically to the committed cursor.
- Restarted the web process with the same database and signing secret; browser
  refresh retained pitch three in its revealed state.
- Completed all seven pitches. Two ordinary two-strike fouls kept the count
  alive, and the seventh pitch completed a strikeout. The recap correctly
  reported three top-pick matches and four top-two matches for this edition.
- Restarted to the same first forecast: Sinker 87%, 94.9 mph.
- Opened the secondary distributions and verified small probabilities remain
  visible as `<1%`.
- Checked 320 × 568, 390 × 844, 768 × 1024, 1280 × 720, and 1440 × 900:
  no horizontal overflow; primary controls remained within the viewport.
- Checked light and dark appearance, focus indication, and off-plot triangle
  rendering. Fixed an SVG fade that temporarily overrode the pitch's position.
- Emulated reduced motion and confirmed the marker animation drops to 0.01 ms.
  Reset all temporary viewport, appearance, and network overrides afterward.
- The final browser console inspection returned no errors.

The checked-in Playwright suite now covers five scenarios across laptop and
phone projects, including a regression for the marker position during its fade.
It was typechecked and added to CI; the standalone Playwright runner was not
executed in this session. Browser evidence above is from direct interaction,
not a claimed automated-suite result.

## Delivery Boundary

This section describes the boundary at the end of the initial implementation.
The subsequent [production release](2026-09-12-production-release.md) completed
deployment, publication, CI browser tests, live checks, commit/push, and branch
cleanup. The local preview and disposable database are now stopped.

No production deployment, migration, publication, or configuration change was
performed. The local preview is `http://127.0.0.1:3000`, backed by disposable
PostgreSQL on port 55432. The model process is stopped. The preview and database
are left running for review.

The model response contract and public replay routes changed together. Use the
documented model-first cutover and rollback procedure. Actual AWS Lambda image
startup, DynamoDB service behavior, CloudFront/OAC origin checks, and deployed
latency still need the post-deployment smoke checks. Do not claim model accuracy
or calibration gains from this single at-bat.

The working tree contained substantial existing changes when this work began.
Those changes were preserved; the complete current diff is not solely the replay
refactor. No commit or push was performed.
