# Complete Dodgers games and reliable CI

- date: 2026-10-05

## Requirement and operating model

The owner clarified that a replay must continue through the whole game. The
previous 3–8-pitch at-bat product boundary was wrong for that goal. The final
requested scope is the Dodgers’ ten most recent completed games, not all teams.
The owner authorized adjusting cost limits while retaining runaway-spend controls.

`prepared-game-v2` includes all normalized pitches in source order. The final
reveal alone completes the game; at-bat, pitcher and inning changes simply
advance to the next recorded state. Full-game pitch count validation rejects
truncated editions. Extra innings and one-pitch at-bats are not filtered out.
Future actuals and final scores remain hidden until their respective reveals.

Repeated request history is stored as validated references to earlier game pitches.
Compressed, checksummed 2 KiB chunks precede their immutable manifest. DynamoDB
paces reads and byte-sized writes below the existing 25/10-unit table limits.
An actual 320-pitch save exposed the old oversized-write throttling; the smaller
format was validated against the real table before publication. The
expanded audit data retains every exact model request and response. A bounded
cache stores only validated immutable editions; sessions remain authoritative
conditional database reads/writes. Existing public at-bat records are retained;
when a full edition is indexed, session migration preserves the old game-pitch
index and revealed state. Older unsupported games cannot enqueue preparation.

Preparation pins the MLB source and immutable model identity, saves each
forecast, and queues a continuation before the 540-second worker deadline.
Continuation uses saved forecasts and a stable publication timestamp. A failed
model request stops with an explicit resumable error, rather than an automatic
unbounded retry. Catalog admission filters both fresh and cached schedules to
10 completed Dodgers games. Cross-year schedule requests require explicit
seasons; a broad date range without a season omitted 2026 postseason games in
an observed upstream response.

The atomic preparation allowance is 4,000 daily / 6,000 monthly attempts.
Failed invocations count. Caller allowance is ten distinct games daily /
twenty monthly. The model and preparation worker each retain concurrency one.
The account-wide $50 monthly shutdown latch and $25/$40/forecast/daily alerts
remain active. Billing lag prevents an exact dollar cap; attempt limits,
concurrency, finite invocation timeouts, and bounded supported games also
constrain exposure before the account guard observes spend.

## Supporting repairs

Full-game normalization now applies MLB runner movements at their recorded
play-event indexes, carries automatic count changes, and updates runs before
the next pitch. Final-play processing does not reintroduce a runner who moved
on an earlier event. Pitch IDs include the numeric MLB game ID. Extra-inning runner placement is
applied before the first pitch, and observed spin comes from MLB’s breaks data.

The xLSTM decoder evaluates identical observed history once for all eight
sampling branches, then copies independent recurrent states. Both tokens and
all context tensors must match. Weights, complete history, sampling, and grammar
remain unchanged; no state crosses prediction requests.

CI run 37333356847 failed while Turbopack compiled Source Sans 3 from remote
Google Fonts CSS (`next/font/google queries have exactly one entry`). All 29
browser tests consequently failed against a compilation-error page. The next
unchanged-code run succeeded, but rerunning was not the repair. Fonts are now
bundled with their OFL licenses through `next/font/local`. Playwright waits on
the root document, and failed runs retain their traces as CI artifacts.

## Verification before release

- Full-game domain tests traverse nine innings and extra innings; incomplete
  data and future/omitted model history are rejected.
- Storage tests cover editions larger than a DynamoDB item and checksum errors.
- Worker tests cover continuation, pinned source/model, saved-forecast reuse,
  and duplicate delivery. Admission tests reject non-Dodgers and the eleventh game.
- Desktop and phone browser tests complete every step of a 72-pitch nine-inning
  fixture, cross the old six-pitch stopping point, refresh, and retain completion.
- Real pinned-checkpoint comparison used histories of 0, 20, 50, and 89 pitches.
  Seeded sampled outcomes matched; normalized floating values matched within
  1e-5. Local previous/new times were 116/85, 480/124, 1756/271, and 4937/628 ms.
  These are local correctness/performance probes, not AWS latency claims.

## Production receipt

Code commits `d557fb4` and `5e61cdd` were pushed to main. GitHub CI runs
[37347485954](https://github.com/saulrichardson/pitch-prediction-app/actions/runs/37347485954)
and [37347940308](https://github.com/saulrichardson/pitch-prediction-app/actions/runs/37347940308)
both completed successfully, including the clean production container build.
Local checks passed: typecheck, lint, build, static budget, HTTP workflows,
124 application tests (the PostgreSQL integration test runs in CI), 34 model
tests, and 31 browser tests (one desktop-only interaction is skipped on phone).

Released web image `serverless-5e61cdd1f6e3`, digest
`sha256:b70b259495e6ad1c2d8d274d3f765ff085f186bda2268118a2de518a9b4ceed0`,
is served by live version 4. The release script verified one READY provisioned
web instance and CloudFront's authenticated alias origin. The preparation
worker was updated in the same completed serverless stack deployment.

Model live version 16 uses `model-serverless-d557fb40b229`, digest
`sha256:934a4b1f9787b2d68b2d723ddaf2f6e8d710f64df8c27381344198072b198ffb`.
It retains 1 GB memory, a 300-second timeout, concurrency one, SnapStart, and no
provisioned concurrency. Actual AWS requests with 89 and 96 prior pitches
succeeded in 20.45 and 23.12 seconds; the largest observed memory high-water
mark was 962 MB. The latter is the longest history in the ten supported games.
These measurements should inform future full-game capacity changes.

The featured October 4 ATL–LAD game has all 320 pitches. Edition
`5c3d7d605c78f2f991fdf2451f2e4e669e91d647e2d239c665a7ca83c6de98c2`
was generated with the real pinned checkpoint on the local CPU runtime, with
its checkpoint, decoder, normalizer, sample count, and runtime recorded in the
artifact identity. The exact 11.1 MB expanded edition round-tripped through
79 small production database chunks without changing requests or forecasts.
The earlier spin-imputed preparation remains unreferenced; the published
edition includes all 320 observed spin measurements.

A real browser request prepared the September 27 LAD–SF game through the
production stream worker and immutable Lambda version 16. It saved 198 of 293
forecasts, yielded at 450.6 seconds, and automatically resumed under the same
request and source identity. The second invocation completed in 313.4 seconds,
publishing all 293 pitches across ten innings as
`2aedcec7ab8d26e6cb226277db7e16d66c3697d1bf86db23c6eb680a71de4ded`.
The saved actuals match the pinned source exactly, including the runner on
second before both tenth-inning halves. Other listed games prepare on demand;
first preparation can take several minutes, and longer histories take longer.

The live catalog returned exactly the ten expected completed Dodgers games
and rejected an unsupported non-Dodgers request. Production HTTP verification
completed all 320 pitches and all seven ownership/redaction/retry/concurrency
checks. The first concurrent browser/HTTP run had a 5,064 ms command while a
second web instance first loaded its immutable edition, failing the existing
2-second maximum latency assertion. This evidence is retained, not treated as
a pass. The warmed repeat passed unchanged: 640 commands, 150 ms median,
200 ms p95, and 1,224 ms maximum. Cold edition reads still take roughly five
seconds; additional provisioned capacity was not added to hide this limitation.

The production browser also played all 320 pitches through nine innings,
retained pitch 8 after refresh, displayed Game complete only after pitch 320,
retained that completion after refresh, and returned to the Dodgers picker
without restarting. No model generation is on the replay-command path.

The account cost-control check remained armed against the $50 threshold.
Reported billing was still lagging; it is not evidence that this release cost
zero. Temporary model servers were stopped. Source feeds, exact review JSON,
logs, previous deployment metadata, and checkpoint parity evidence are kept in
ignored `.cache/replay-repair-2026-10-05/`, outside the Git commit.
