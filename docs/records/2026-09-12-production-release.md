# Prepared Replay Production Release

- date: 2026-09-12
- status: deployed and verified
- application commit: `87a15e188a2cab0be58ce1f598d8d9e0ce7af35b`
- production: <https://baseball.saulrichardson.io>
- CI: <https://github.com/saulrichardson/pitch-prediction-app/actions/runs/34716818485>

## Delivered

Integrated the reviewed existing work and prepared-replay refactor into `main`,
pushed it, and deployed both existing AWS stacks. CloudFormation reports
`UPDATE_COMPLETE` for `PitchSequenceServerlessStack` and
`PitchSequenceModelStack`. The browser now completes a real prepared at-bat
without model generation during interaction.

| Artifact | Deployed identity |
| --- | --- |
| Web image tag | `serverless-87a15e188a2c` |
| Web image digest | `sha256:18f0ab950fb34323ddbec05cf0e1c6ea002d0523596960a0796ba3502581b587` |
| Model image tag | `model-serverless-87a15e188a2c` |
| Model image digest | `sha256:9e4bfd6d4c008788612e01fd586857b39900f77b5a34d208e1d884f46859ea4e` |
| Model function | `pitch-sequence-serverless-model-lambda:12` |
| Model alias / startup | `live` → `12`; Active; SnapStart optimization On |
| Featured edition | `435fbd08c16537fa050569da610570eafe76d740d83b6c6b0c0b540a3a91e78d` |

The feature is a three-pitch Gerrit Cole / Francisco Lindor at-bat from NYM @
NYY on September 12. The operator CLI invoked immutable AWS model version 12,
saved all three real forecasts with eight samples each, validated the edition,
and published it atomically. The review JSON is retained locally in
`.cache/release-2026-09-12/aws-edition.json`. The earlier reviewed seven-pitch
edition remains available to sessions that opened it before publication.

The web role has no Lambda invocation permission, uses DynamoDB, and has a
30-second timeout. Existing reserved concurrency remains web 10 / model 1;
model provisioned concurrency remains zero. The existing country allowlist,
table limits, session signing secret, and one-day logs were preserved. No
production records were deleted and DynamoDB required no table migration.

## Verification

- CI on the deployed application commit passed: 65 TypeScript tests, 22 Python
  tests, and all 10 browser scenarios across laptop and phone. Type checking,
  PostgreSQL migration/integration, lint, build, and HTTP smoke checks passed.
- Both `/health` and `/ready` return 200. Readiness validates the current
  featured edition through real DynamoDB reads.
- All seven production HTTP verification groups passed: readiness, idempotent
  start, spoiler redaction, workspace ownership, origin/input rejection,
  command retries, stale revisions, forecast stability, concurrent-write
  ownership, completion, and restart.
- Six measured production commands took 79–92 ms; median 84 ms and maximum
  92 ms. The earlier bootstrap edition measured median 89 ms / maximum 161 ms
  across 14 commands. These are small sequential smoke runs, not load tests.
  The original deployed audit measured approximately 8.16 seconds for Next.
- The actual production browser completed all three pitches, showed the recap
  (one top-pick match and two top-two matches), and restarted to the exact saved
  first forecast. Back and refresh preserved the displayed forecast/reveal.
- With the production browser deliberately disconnected, Reveal preserved the
  current view and offered one retry. Reconnection, refresh, and retry applied
  the saved action once. All temporary network and viewport overrides were
  reset afterward.
- At 390 × 844 the collapsed replay is 893 px tall, has no horizontal overflow,
  and keeps the main action between y=693 and y=741. At 1280 × 720 there is no
  horizontal overflow and the main action remains within the viewport.
- Expanded forecast details show source/sample information and probabilities
  below one percent. The final browser console inspection returned no errors.
- A startup check initially captured the loading screen before hydration.
  The network trace resolved the document, assets, and replay-data request in
  about 0.7 seconds with no failed asset requests. No code change was needed.
- CloudWatch review found no application errors or timeouts. Model version 12
  logged one health call and three preparation calls; no model invocation
  occurred during the subsequent HTTP and browser replay checks. Its first
  SnapStart restore took 946 ms; individual preparation calls took about
  4.6–13 seconds, outside the public interaction path.

## Release Fixes And Durable Lessons

The real DynamoDB publication check exposed two order-sensitive comparisons:
matchup/count maps and historical model input maps. DynamoDB can reorder object
fields independently at every nested level. Domain comparisons now compare
the explicit matchup/count values and recursively compare validated JSON by
meaning, preserving array order. Regression tests fail under the previous
implementation and pass after the fix. A failed publication never changed the
featured pointer.

The first CI browser run exposed an assertion comparing raw hidden text with
rendered text. Both assertions now compare rendered text consistently. All
browser scenarios then passed on the deployed commit.

## Delivery State And Recovery

The completed `codex/replay-experience-refactor` and
`codex/serverless-native-cutover` branches were integrated into `main` and
removed locally; the completed remote task branch was removed too. Stale
worktree metadata was pruned. The local preview and disposable PostgreSQL
processes were stopped. The live production browser is left open for review.

`serverless-latest` points to the verified web digest. The prior web and model
images remain retained for rollback. Original stack templates, function
configuration, IAM policies, and release logs are kept in the ignored,
restricted `.cache/release-2026-09-12/` directory. Some snapshots contain secret
configuration; they must never be committed or shared. Follow the
[rollback procedure](2026-09-12-prepared-replay-delivery.md#rollback-and-recovery)
to restore both the matching images and required stack configuration.

This receipt and the linked status updates are documentation-only changes
after the application release; they do not change its deployed runtime.
`AGENTS.md` records the owner's standing instruction: verified work is committed,
integrated into `main`, pushed, deployed, and checked live, with a clean working
tree and completed task branches removed.
