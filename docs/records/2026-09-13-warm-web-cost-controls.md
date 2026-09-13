# One warm web instance and a monthly cost stop

- date: 2026-09-13

## Decision

The owner approved one warm web instance and a higher budget with alerts and
automatic shutdown around $50. This supersedes the old $5 monthly posture.
The 2 GB x86 web Lambda now publishes a version and serves through a `live`
alias with exactly one provisioned execution environment. CloudFront uses the
alias's IAM Function URL with its existing OAC and trusted viewer-host boundary.
Static S3 delivery, private response caching rules, model memory/SnapStart,
reserved concurrency ceilings, and prediction-attempt limits remain in place.
Burst requests beyond the single warm environment can still use on-demand
capacity and experience a cold start. Retained old web versions have no
provisioned allocation; keep the prior image/version for rollback.

At the published us-east-1 x86 rate of $0.0000041667 per GB-second, one 2 GB
environment costs about $21.90 per 730-hour month before initialization,
execution and request charges. Monitoring adds four standard CloudWatch alarms
(about $0.40/month outside the free allowance), plus small usage-based
SNS, EventBridge and guard Lambda charges. This is not the total AWS bill.

## Budget and shutdown

`infra/lib/cost-policy.ts` is the policy source. Preserve the existing native
AWS Budgets email recipient. Update `My Monthly Cost Budget` to $50, with
absolute USD actual-spend alerts at $25, $40 and $50, plus a $50 forecast alert.
Update `Daily Cost Spike Budget` to $2 with a $2 actual-spend warning.
The monthly actual $50 notification also publishes to the dedicated cutoff
SNS topic. These are account-wide budgets: other AWS services' costs can stop
this app, but the guard can only change this app's named resources.

`PitchReplayCostControlsStack` owns the independent small guard Lambda,
hourly EventBridge check, cutoff and operations SNS topics, retained SSM latch,
and alarms for guard errors, missed checks, cutoff delivery failures and sustained
public 5xx responses. The operations email subscription requires the standard
SNS confirmation. Native budget email alerts do not depend on that subscription.

The handler reads actual spend from AWS Budgets before acting. Incoming message
text, forecast alerts and SNS test notifications cannot manufacture a shutdown.
At actual spend >= $50, it persists `tripped` in `/pitch-replay/cost-control`,
then independently removes all provisioned allocations and sets reserved
concurrency to zero on the web, preparation and model functions, and disables
the CloudFront distribution. It uses the distribution's current configuration
and ETag so origins and other settings are preserved. Stop operations are
idempotent; partial failures remain latched, raise errors, and retry through
Lambda and the hourly check. A successful stop sends an operations alert once;
delivery retries can occasionally duplicate that message.

The guard has no deletion permissions for functions, editions, databases,
assets, images or model snapshots. It does not automatically restart next
month. Once latched it enforces the stop even if the billing API is unavailable.
Both release scripts check the latch and current budget before building and
again before changing application stacks. A direct lower-level CDK/AWS command
can bypass this release preflight and must not be used to restore service
without the recovery procedure.

AWS billing is delayed; Budgets refreshes only several times a day. The hourly
check cannot see unreported charges. In-flight requests and CloudFront's
disable propagation can add more cost. Retained S3/DynamoDB/ECR data, secrets,
and the model's existing SnapStart snapshot can continue accruing small charges
while the app is paused. This is an automatic compute/traffic stop, not an
exact $50 account ceiling or an account-wide teardown.

## Setup and release

Use us-east-1 explicitly; the local CLI default may point elsewhere. Back up
existing budget details, subscribers and deployed templates privately first.

1. Deploy `PitchReplayCostControlsStack` with the existing `DistributionId` and
   `AlertEmail` taken from the existing budget subscriber. Confirm the SNS email
   and verify the subscription is active. Do not store the contact in source.
2. Set `COST_ACCOUNT_ID` and `COST_CUTOFF_TOPIC_ARN` from the deployed stack and
   run `node --import tsx scripts/configure-cost-budgets.ts`. It preserves email
   contacts and cost types, installs replacement alerts before removing old
   thresholds, and rejects unexpected subscriber drift.
3. Invoke `pitch-replay-cost-control` with `{"dryRun":true}`. It must report the
   real spend and `shouldStop:false` before enabling capacity. Publish a test
   message to the cutoff topic and verify that the guard rechecks billing and
   leaves production armed. Verify error alarms and their email destination.
4. Run the repository checks, then `scripts/deploy-serverless-web.sh`. The new
   published alias and its URL become ready before CloudFormation switches the
   distribution; obsolete unqualified URL resources are removed in cleanup.
   `scripts/verify-warm-web.ts` checks alias/version, exact allocation, deployed
   origin and OAC. Verify live HTTP flows and provisioned-concurrency invocation
   metrics, not only the allocation's READY status.

## Recovery and rollback

Keep the latch tripped while investigating costs. Inspect the actual account
bill, all three function concurrency settings, provisioned allocations, the
CloudFront status, and guard logs. A failed/partial stop needs repair, not reset.
Do not delete saved editions or snapshots merely to manufacture a zero bill.

After the owner authorizes restoration and reported monthly cost is below the
limit (normally next month), explicitly write `{"status":"armed"}` to the SSM
parameter. Restore model reserved concurrency to 1, preparation concurrency to
1, web concurrency to 10, web alias provisioned concurrency to 1, and the saved
distribution configuration's `Enabled` value to true. Preserve its current ETag.
Wait for the warm alias to be READY and CloudFront to be Deployed before smoke
checks. Because shutdown changes resources outside CloudFormation, a no-op
stack deployment does not necessarily restore those settings: inspect and
reconcile the live properties explicitly. Check stalled game jobs and recover
them through the existing workflow; do not rewrite immutable editions.

For an ordinary web rollback while armed, point `live` at the retained previous
web version and wait for its provisioned allocation, or redeploy the prior
image/release through the release script. The warm alias URL remains stable.
Leave the independent cost controls enabled during rollback.

## Verification

Tests cover the $50 boundary, invalid billing/state, no mutation in dry runs,
latch-before-effects, partial failures, retry, month rollover, notification
failure, removal of provisioned allocations before zero concurrency, and
preservation of the CloudFront configuration. Infrastructure tests assert one
warm alias, qualified OAC permissions/origin, narrow shutdown IAM, retained
state and alarm/schedule wiring. Live release evidence is recorded after rollout.

The production release `serverless-2a07a126e664` now uses web version 1 with
one READY provisioned instance. CloudWatch recorded provisioned-concurrency
invocations after the CloudFront cutover. Both alias permissions completed
before the distribution update began; only the qualified `live` Function URL
remains. All 93 sampled health requests before, during and after rollout
succeeded. Live replay commands measured 82 ms median and 124 ms maximum in
the six-command sample. Ownership, origin rejection, idempotency, recovery,
full replay completion and the 91-game catalog passed HTTP verification.
The browser restored COL/DET and passed restart, reveal and advance.

CI run `34740610034` passed 106 TypeScript tests including PostgreSQL,
30 Python tests and 23 browser tests with one intentional browser skip.
The guard's live read-only check reported $1.406 actual monthly spend and an
armed state. A cutoff-topic message claiming a larger cost still re-read AWS
and did not trip. IAM simulation allowed the five required shutdown operations
and denied an unrelated function and function deletion. The operations email
subscription was confirmed; its initial confirmation was moved out of spam,
and the subsequent delivery test arrived in the inbox. All four alarms were OK.
The destructive production stop was not deliberately triggered; its effects
and failure/retry paths were verified through tests and scoped IAM checks.
The model remains version 15. The account's existing cost-guard policy remains
at its original v1. Private rollback and release receipts are under
`.cache/warm-web-2026-09-13/`.

Sources: [Lambda provisioned concurrency](https://docs.aws.amazon.com/lambda/latest/dg/provisioned-concurrency.html),
[Lambda pricing](https://aws.amazon.com/lambda/pricing/),
[AWS Budgets update and notification delays](https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-managing-costs.html),
[budget SNS permissions](https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-sns-policy.html).
