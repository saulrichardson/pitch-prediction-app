# Product Experience Audit

- date: 2026-09-11
- status: audit findings and proposed direction; implementation and product changes are not approved by this record
- scope: current working tree, public app, deployed Lambda configuration, recent model execution reports

Follow-up: the owner authorized an extensive refactor on September 12. See the
[prepared replay decision](2026-09-12-prepared-replay-delivery.md) and
[verification report](2026-09-12-refactor-verification.md) for the implemented
response. This audit remains the record of the original deployed behavior.

## Conclusion

The central product loop is good: see a prediction, reveal the actual pitch,
advance. Its execution undermines that simplicity. Forward navigation waits
for inference, revisiting a pitch changes parts of its prediction, refresh loses
the replay entry point, and the layout pushes the useful comparison apart.
Several prominent statistics also need stronger semantics.

Make the product a compact baseball replay instrument. Preserve the real-data
boundary and one primary action. Make forecasts stable, navigation recoverable,
and the default screen substantially smaller. Remove unsupported statistics
instead of adding explanations around them.

## Evidence and limits

Audited `https://baseball.saulrichardson.io` using its actual browser UI. Started
the Sep 9 NYM @ MIA replay, revealed pitch 1, advanced to pitch 2, went back,
advanced again, inspected a 390 × 844 viewport, and refreshed. This used three
real predictions. No load test or quota-exhaustion test was run against the
small shared production allowance.

Browser network timings, measured request to response:

| Action | Observation |
| --- | --- |
| Reveal pitch 1 | HTTP 200 in approximately 98 ms |
| Advance to pitch 2 | HTTP 200 in approximately 8,157 ms |
| Back to pitch 1 result | HTTP 200 in approximately 222 ms |
| Advance to pitch 2 again | HTTP 200 in approximately 8,194 ms |
| Refresh | Returned to the introductory screen, without a resume action |

The original pitch-2 read showed Sinker 77%, expected velocity 95.5 mph, Ball
63%, and next count 2-0 63%. After Back → Next, the same pitch showed Sinker
77%, expected velocity 91.5 mph, Strike/Foul 75%, and next count 1-1 75%.
This is a reproducible navigation/inference problem, not evidence that the
underlying pitch-type model is inaccurate.

CloudWatch reports during the visit showed a 2,541.72 ms model restore, a
4,545.44 ms initial prediction handler, and an 8,014.74 ms warm next-pitch
handler. Most measured advance latency was model execution. These are a few
observations, not percentile measurements or a concurrency benchmark.

Read-only AWS inspection in us-east-1 confirmed:

- Web Lambda: 2048 MB, 300-second timeout, reserved concurrency 10, model call
  timeout 55 seconds, cost guards enabled, eight predictions/workspace/day,
  twenty predictions globally/day. Last modified June 7.
- Model live alias: version 11, 1024 MB, 300-second timeout, reserved concurrency
  one, SnapStart optimization On, sample size eight. Last modified September 3.
- `/health` returned `ok`; `/ready` returned DynamoDB `configured` and model
  `configured`. Readiness does not prove that an actual prediction will succeed.

The working tree already contained extensive uncommitted changes. Findings
identified as source findings refer to that working tree; exact source/image
equivalence was not established. No production configuration or application
behavior was changed by this audit.

Local checks passed: 69 TypeScript tests, 15 Python tests, typecheck, lint, and
production build. The checked-in Playwright suite was inspected, but not run;
browser checks above exercised production directly. Multi-instance races,
quota exhaustion, long-game completion, offline recovery, and model accuracy
over a representative dataset remain unverified end to end.

## Findings, in implementation order

### 1. Mutable timeline caching can break valid navigation — P1, source finding

`packages/db/src/storage/dynamodb.ts:108` returns process-local timeline state
before consulting DynamoDB. There is no freshness check or invalidation across
Lambda instances. `saveTimeline` at line 89 performs an unconditional put.
After instance A saves a reveal, instance B can read an older cached unrevealed
timeline and reject the subsequent advance. Conflicting writes can overwrite
newer state. Even uncached timeline reads omit `ConsistentRead`.

Use authoritative reads for mutable timelines and conditional versioned
transitions. Add command IDs so duplicate requests return their prior result.
Test two storage instances sharing a backend, response loss, and simultaneous
commands. Disabling buttons in one browser does not solve distributed state.

### 2. Navigation regenerates predictions — P1, live reproduction

`packages/domain/src/timeline.ts:54` always predicts on advance.
`stepBackActualTimeline` at line 102 truncates navigation history instead of
retaining a stable forward forecast. Prediction-run records are written but
not retrieved for replay navigation.

Separate the replay cursor from immutable per-pitch forecast records. Back and
forward should revisit the exact same prediction ID and values. Key predictions
by replay revision, pitch index, model artifact/version, inference settings,
and input-context identity. Repeated navigation must not consume prediction
quota. This also establishes the foundation for safe prefetching.

### 3. Next Pitch blocks on inference — P1, measured in production

`apps/web/src/lib/timeline-service.ts:44` calls inference synchronously inside
advance. The browser disables both controls while the request runs. Initial
creation has a durable job; subsequent inference does not.

Move prediction preparation behind a durable, deduplicated operation. Prepare
at most one next prediction after reveal, using only legitimate prior context,
while the user inspects the comparison. Reserve capacity before starting work,
stop at the session boundary, and retain a visible, resumable pending state.
Do not present prefetch as a complete latency solution: a quick user can still
outrun an eight-second model call. Queuing and bounded recovery are required
when the one model slot is busy.

### 4. The public promise exceeds the available session — P1, deployed config

Eight model predictions per workspace/day and twenty globally/day cannot
support the advertised full-game replay. Startup, failed calls, and repeated
Back → Next navigation also compete for that allowance. The public UI explains
billing infrastructure after the interruption instead of providing a planned
ending. See `apps/web/src/lib/cost-guards.ts:55` and the billing-limit panel.

Keep the existing budget fixed until the owner chooses a delivery model. The
recommended public demo is a short, complete featured sequence that has already
been generated by the real model, with stable versioned results served to
visitors. Generate each result from its pre-pitch input, preserve provenance,
and withhold actuals until reveal. Publish only a completely prepared sequence.
This changes the current fresh-inference operating contract and the record
that rejects cached substitutes; obtain a product decision before implementing
shared prepared forecasts. It must be an explicit replay mode, never a hidden
fallback when live inference fails. If fresh inference remains mandatory,
retain the durable queue and choose session size/capacity honestly; zero waiting
cannot be promised under the current execution times and limits.

### 5. Two-strike count predictions are wrong — P1, local reproduction

`services/model-api/src/pitch_model_api/normalizer.py:220` converts the entire
Strike/Foul probability into strikeout probability at two strikes. A local
example containing eight ordinary foul samples at count 1-2 returned Strikeout
100% for both count impact and PA forecast. Ordinary fouls should preserve 1-2.

Preserve result categories before grouping them for display. Compute count
transitions from those categories, including explicit treatment of bunt fouls
and foul tips. Add regression tests from concrete pitch events. Do not ship
the current next-count result as a confident baseball read.

### 6. Displayed statistics exceed their evidential basis — P1/P2, source plus live display

- `pa_forecast` at line 235 uses hand-written multipliers, including an
  unexplained `alive * 0.45`, to produce a label claiming survival after eight
  pitches. It does not simulate eight pitches.
- `expected_pitches_remaining` at line 254 is a bounded heuristic.
- Result and location distributions count eight sampled events in the deployed
  configuration; their coarse zeroes are not proof that outcomes are impossible.
- `expectedVelocityFor` in `formatters.ts:23` chooses the first matching sampled
  pitch, or the first other sample, rather than an expected velocity aggregate.
- `rankPossiblePitches` in `prediction-panel.tsx:118` uses a manually weighted
  60/25/15 blend of marginal support, after the Python layer retains only four
  deduplicated candidates. It is not a joint event probability ranking.

Remove PA outlook and expected remaining pitches from the default product until
there is a defensible model. Define aggregation/provenance for velocity and
sample-derived outputs. Put technical methodology in optional details. Use
`<1%` for small nonzero probabilities rather than rounding them to `0%`.

### 7. Model context uses pitch count as times through the order — P1, source finding

`packages/domain/src/model.ts:96` computes times through order as
`floor(gamePitchIndex / 18) + 1`. Eighteen pitches are not one turn through a
batting order; this also includes both teams and earlier pitchers. History
conversion in `normalizer.py:110` repeats this approximation. Current request
pitch number is game-wide, whereas historical pitch numbers are within a plate
appearance. Verify the upstream feature contract, then derive these features
from actual pitcher/batter encounters and the required pitch sequence scope.

### 8. Refresh and interrupted connections have no durable user entry point — P1/P2

The component initializes to idle and stores the active job/timeline only in
React state (`pitch-sequence-lab.tsx:44`). Refresh reproduced a return to the
landing page. There is no standalone timeline-read route or resume link.

Persist an opaque session/job reference in the URL or browser storage, retrieve
it through the signed workspace boundary, and reconstruct revealed pitch and
evaluation state from server truth. Refresh during preparation should reattach
to the same job. Recovery after a lost mutation response should reconcile the
command result before attempting another write.

### 9. Waiting has weak bounds and misleading status copy — P2, source finding

Browser fetch helpers have no timeout or cancellation. Network polling failures
retry indefinitely. Pending jobs have no age-based recovery in
`loadTimelineStartJobResult`; expired running jobs are redispatched after a
six-minute lease without a maximum attempt policy. A failed worker can leave a
very long wait even when normal inference takes seconds.

The preparation UI infers “loading” and “warming” from elapsed time and describes
Lambda workers and xLSTM container startup. Those are not measured stages, and
SnapStart is now enabled. Use a small set of real job states, deadlines,
retry limits, and an explicit resume/retry action. Show “Preparing your replay”
or “Preparing next pitch”; disclose system diagnostics only in operator tools.
Keep transient feedback within the action area to avoid inserting a panel that
shifts the whole forecast on each click.

### 10. Mobile layout breaks the reading loop — P1 design, measured

At 390 × 844, the header measured approximately 672 px tall. The read panel began
at y=704 and the strike zone at y=1,383. The whole page was approximately 4,705
px tall. There was no horizontal overflow in the measured state; excessive
vertical stacking is the problem. Controls scroll away from the comparison.

The 1240px breakpoint stacks the entire header and read grid; the 720px rules
also stack player cards and each fact label/value. See `globals.css:1504`.
Recompose the mobile screen rather than stacking desktop sections. Keep a small
scoreboard, one-line matchup, primary prediction, useful zone, and sticky action
within the initial viewport at common phone sizes.

### 11. Default hierarchy repeats information and instruction — P2 design

The full detail panel is always rendered. It repeats the main prediction,
location, velocity, result, next count, and top-two support before presenting
six more distributions/candidate lists. The large unrevealed actual card repeats
instructions implied by the button. The entry screen explains Reads/Shows/Scores
and Read/Reveal/Advance while developer links compete with the primary CTA.

Use one primary read with two alternatives, a compact plot, and one reveal area.
Make full distributions a collapsed “Details” disclosure. Remove the empty
instruction card and keep only a small unrevealed state. Move repository/model
links into About. Preserve the navy/orange identity and condensed display face,
but reduce bold body text, borders, background grids, and competing surfaces.

### 12. Startup does duplicate network/storage work — P2, source finding

`loadMetsGame` fetches the latest game, calls the replay endpoint and discards
its response, then creates a job. The worker calls `getGameReplay` again.
`mlb-service.ts:26` always refetches the full feed and saves all pitches even
when a cached final replay exists. Cached data is used only after failure.

Have one preparation operation resolve the game and fetch/normalize once. Give
final-game replay revisions an explicit cache policy; give in-progress games
a separate refresh policy. Remove the discarded browser request. Version replay
data atomically so hydration cannot mix a newly written game record with an
incompletely written pitch set.

### 13. Quota consumption and timeline writes have partial-failure gaps — P2

`consumeAll` increments several limits sequentially. A later rejection leaves
earlier counters consumed. Model failure also spends the allowance. Timeline
saving and audit writing occur sequentially, so an audit failure after a commit
can return an error even though the state changed.

Define budget reservation/commit semantics and distinguish attempts from useful
predictions. Make timeline transition outcomes discoverable after partial
failure. Use transactional writes where facts must commit together, or an
explicit durable outbox for secondary audit work.

### 14. Completion and long-game storage need their own delivery checks — P2

After Finish Game, `nextPitch` clears the local actual pitch/evaluation although
the terminal timeline stays revealed. The same render can then show “Game
Complete” and “Ready to reveal.” There is no completion recap or new-game path.
This is traced from source, not reproduced through a full production game.

`compactTimeline` removes only `actualPitches`; full actual history and forecast
history grow in a single mutable record and are returned on each command. Move
immutable events/forecasts to per-pitch records, bound command response size,
and measure a complete game's persistence before promising full-game delivery.

### 15. Passing tests do not protect the frustrating cases — P2

Current tests cover useful domain transitions and DTO redaction. The browser
suite also asserts that much of the verbose presentation remains visible. It
has desktop/tablet projects but no phone project, relies on a real model and a
moving latest game, and is absent from CI. There are no distributed DynamoDB
adapter tests protecting the cache/write issue above.

Add deterministic workflow tests for resume, response loss, duplicate commands,
two independent app instances, bounded waiting, stable Back → Next forecasts,
quota rejection, two-strike fouls, completion, and phone control visibility.
Keep a separately budgeted real-model smoke test. Validate visible semantics
and continuity rather than the presence of explanatory paragraphs.

## Proposed design contract

Archetype: industrial/utilitarian, with the discipline of a baseball broadcast
scoreboard. Signature interaction: forecast and actual appear on the same
compact strike-zone plot without moving the action or changing the page shape.

The result should answer three things immediately: who is pitching to whom,
what pitch is likely, and how the actual pitch compared. Keep the existing real
MLB inputs, model boundary, workspace ownership, pre-reveal secrecy, and primary
Reveal Actual → Next Pitch loop. Change hierarchy, navigation persistence,
prediction identity, loading behavior, and unsupported metric presentation.
The user's request for less qualification is a design constraint, not text to
put into the app.

Default screen, top to bottom:

1. One compact scoreboard: teams, replay date, inning, count, outs, bases.
2. One-line matchup.
3. Large likely pitch and probability, with two compact alternatives beside a
   proportionate strike zone. Retain a stable graphic coordinate frame while
   explaining zone provenance only inside details.
4. Actual comparison after reveal; a concise previous-pitch result when advancing.
5. Primary action and secondary Back in a fixed location; sticky on phones.
6. Collapsed Details and an unobtrusive About link.

Copy examples: “Preparing next pitch”, “Reconnect to continue”, “Replay complete”.
Avoid “Advancing along actual timeline”, “Worker claim”, and billing terminology
in routine baseball interactions. Keep genuinely useful probabilities visible;
do not turn statistical uncertainty into verbal hedging.

## Delivery sequence and acceptance criteria

1. **Correctness and continuity:** authoritative versioned state, immutable
   forecasts, idempotent commands, resume, foul/count correction, remove or
   repair misleading metrics, correct model input context.
2. **Compact interaction:** rebuild hierarchy at desktop/phone sizes, keep the
   action stationary, collapse secondary detail, simplify loading/recovery.
3. **Latency and cost contract:** choose prepared featured replay versus fresh
   inference, implement durable deduplicated preparation, eliminate duplicate
   feed work, make completion and capacity first-class states.

Proposed acceptance targets, not current guarantees:

- Back → Next preserves prediction ID and all forecast values and makes no new
  model call.
- Refresh restores the exact pitch or active preparation operation.
- Duplicate commands and requests on separate instances cannot regress state.
- No successful save is represented as an unrecoverable unknown failure.
- Every wait resolves to success, bounded recoverable failure, or a truthful
  capacity state; every retry reuses the original command/job identity.
- At 390 × 844 and 1280 × 720, the primary read and action are accessible without
  scrolling through instructional panels; details are opt-in.
- Prepared/revisited transitions target under 500 ms; measure p50/p95 on the
  actual deployment before promising that target publicly.
- A featured session reaches a designed ending under its admitted budget.
- Only defensible, explicitly defined metrics appear as model forecasts.

The first two slices can begin within the current product direction. Shared
prepared forecasts and changes to spending/capacity require an explicit product
decision. This audit authorizes neither deployment nor changes to that budget.
