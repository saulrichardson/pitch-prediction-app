# Seven-day game browser

- date: 2026-09-12

## Context

The user requested choosing a date and game, suggesting either a year or a
recent week. The first release uses a rolling seven-day MLB schedule, including
today, for all teams. It preserves the complete 3–8-pitch at-bat as the replay
unit. A year of discovery and full-game navigation are separate expansions.

## Record

Dates follow America/New_York and MLB's `officialDate`. The schedule is fetched
with hydrated team abbreviations, validated, and projected without scores or
winners. Live, postponed, and cancelled games remain visible but unselectable.
Doubleheader rows identify the game number. Existing edition URLs remain valid
after their date leaves the discovery window.

Preparing all games in advance would spend inference on games nobody opens.
The first selection instead saves one shared `game-job:<gamePk>` record and
returns immediately. Its queued DynamoDB stream event invokes a dedicated
worker. Conditional writes select one owner; duplicate browser requests and
stream deliveries do not create another preparation. The worker resolves the
model alias once to an immutable version and image digest and retains that
identity on retries. Each validated forecast is saved before progress advances.

The worker indexes a complete immutable edition in `game-edition:<gamePk>` and
the small `catalog-editions:<date>` summary map. Its direct item permissions
exclude `featured` and workspace session keys. The web role still cannot invoke
the model. This keeps
preparation separate from replay navigation and operator feature selection.
The date summary avoids reading every large prediction payload on each list.
Stream reader IAM is scoped to the table's stream, which also contains other
record images; the event-source filter delivers only queued game jobs to the
handler. This filter is an event-delivery boundary, not a separate storage or
IAM boundary.

The public path and operator CLI share the existing 20-attempt daily and
400-attempt monthly budget. These are UTC windows; failed attempts count.
The [September 13 performance release](2026-09-13-performance.md) later raised
the daily allowance to 60 while retaining the 400-attempt monthly ceiling.
The picker shows the reset time when preparation is paused. The worker has
reserved concurrency 1 and a 540-second timeout. A stale queued/preparing job
becomes resumable after ten minutes; successful forecasts and model identity
are retained. This is explicit user-initiated recovery after a hard timeout,
not an unbounded retry loop. A game without a qualifying at-bat fails before
model invocation.

Browser URLs preserve the selected date and preparation. The selected job is
polled every 2.5 seconds and opens automatically when ready. Users can keep
browsing during preparation. A request is aborted or its late response ignored
when the user leaves that selection. Replay cursors and unacknowledged commands
are stored per edition, so switching games cannot discard an interrupted action.

## Rollout and recovery

This is an additive update to `PitchSequenceServerlessStack`: enable NEW_IMAGE
streams on the retained table, add the filtered preparation worker and its
restricted IAM role, and update the web image. The deployed model contract and
alias remain unchanged. No SQL migration or session migration is required.

Existing saved editions need their new indexes seeded. Re-publishing the same
featured ID through the updated CLI seeds it without changing the featured
pointer. Other reviewed saved editions can use `indexGameEdition` directly.
Never generate or publish the deterministic test fixture in production.

Before rollout, retain the current stack template and web image digest. Rollback
can restore that web image and disable the preparation event source; retained
editions and existing replay sessions remain usable. Do not delete the table,
saved forecasts, or session records. Preserve the stream and worker during an
image-only rollback unless the queue itself requires stopping.

After rollout, check the event source is enabled, inspect one real non-featured
game from request through forecast progress to ready, verify its immutable model
identity, then run both HTTP smoke suites. Confirm preparation leaves the
featured pointer unchanged and reopening the saved game consumes no attempts.

## Evidence

- Domain tests cover calendar boundaries, dates, schedule states, and redaction.
- Workflow tests cover validated admission, concurrent requests, budget pauses,
  indexing, duplicate delivery, partial recovery, and model identity retention.
- Infrastructure assertions cover worker concurrency, stream filtering, and
  preparation-only key permissions.
- Browser regressions cover both laptop and phone, switching games, saved
  cursors, interrupted commands, refresh during preparation, date recovery,
  doubleheaders, live-game selection, and horizontal overflow.
- `verify:catalog` checks all seven dates and invalid requests without inference;
  `verify:product` exercises saved replay correctness and command latency.
- Manual local verification used 1280-, 390-, and 320-pixel widths and inspected
  saved replay content after switching dates and teams.

## Future guidance

Keep discovery, preparation, and replay navigation separate. Expanding the date
window is straightforward in the domain constant, but availability remains
subject to complete MLB pitch data and the shared preparation budget. Revisit
capacity explicitly before promising instant access to every unprepared game.
Expanding to full-game replay requires a new selection and navigation model;
do not hide that product change inside the existing at-bat picker.

## First AWS verification

The initial rollout at application commit `82a80146ba054509d90645b2abf329831b72aa84`
completed successfully. Its [CI run](https://github.com/saulrichardson/pitch-prediction-app/actions/runs/34721322784)
passed 76 TypeScript tests including PostgreSQL, 22 Python tests, and 18 browser
checks. A browser-test locator initially matched Next.js's route announcer as
well as the catalog error; scoping it to the named game-browser region fixed
the assertion without weakening the checked error or recovery behavior.

The live picker returned 91 games across September 6–12, with current live and
pregame states disabled and no final scores. Both HTTP smoke suites passed;
the six sampled replay commands took 84–137 ms (median 93 ms). These are smoke
measurements, not a load test.

The production browser selected September 11's PIT @ CHC game `824631` and
queued request `d34c76c9-f0f5-4d33-8e7d-38b6b7ff7fb2`. The DynamoDB stream worker
prepared all six pitches, using immutable model version 12 and image digest
`sha256:9e4bfd6d4c008788612e01fd586857b39900f77b5a34d208e1d884f46859ea4e`.
It saved edition `37aa461a76ab0f69624412f58b1e7c5b5acfb656a8ec5a5dd5408e10b7691101`.
Preparation ran from 22:02:19.392Z to 22:03:59.076Z. The browser showed progress
after refresh and opened automatically when complete. The 390-pixel phone
layout had no horizontal overflow.

Switching to the September 12 Mets game and back preserved the exact second
Pirates forecast. All remaining pitches completed in the live browser. The
model-attempt counter rose from 3 to 9 during preparation and stayed at 9 after
reopening and navigating. The featured pointer remained unchanged. The reviewed
edition, rollback configuration, build/deployment output, and verification logs
are retained in ignored `.cache/release-game-browser-2026-09-12/`; configuration
receipts are private and must not be committed.

The observed roughly 100-second first preparation informed the final action
labels: **Prepare replay** for an unprepared game, **Preparing** while selected
work is active, and **Ready** for a saved edition. Do not imply that first-time
inference is instantaneous. Invalid selected-game links show their actual
validation message and provide a route back to the game list.
