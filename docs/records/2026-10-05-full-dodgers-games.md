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

Production receipt follows after deployment and live verification.
