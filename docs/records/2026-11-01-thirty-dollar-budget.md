# $30 monthly operating budget

Date: 2026-11-01

The owner requested reasonable cost controls to stay below $30. Interpret this as
USD per calendar month for the baseball application. This supersedes the October
29 $250 policy and the September always-warm web configuration.

## Policy

`infra/lib/cost-policy.ts` separates the $30 monthly budget from the $20 actual
spend shutdown threshold. Keep $10 of headroom for delayed AWS billing, in-flight
work, distribution propagation, and retained storage. Monthly actual warnings
are $10 and $15; a $20 actual notification invokes the existing guard; a $30
forecast notification warns the owner. The daily warning is $2. Email recipients
are preserved by the budget reconciliation script. Both budgets retain the exact
`Project=PitchPredictionApp` tag filter; unrelated projects cannot stop this app.

The independent guard retains its hourly check, error/heartbeat alarms and durable
SSM latch. At $20 reported monthly spend it stops all three application functions,
removes any provisioned allocations, and disables CloudFront. It stays stopped
across month rollover until an operator explicitly restores it. Release preflight
blocks at $20, on a tripped latch, or if the $30 scoped budget is missing.

Web execution is on-demand, with no provisioned concurrency. The previous 2 GB
always-on instance alone cost approximately $21.60 per 30 days at the us-east-1
x86 provisioned-capacity rate, excluding invocations. Static S3/CDN delivery and
the published IAM alias/OAC remain. First interactive requests after inactivity
may cold-start. The existing finite timeouts, reserved concurrency, atomic
preparation attempts/caller limits, bounded DynamoDB throughput and log retention
continue to constrain usage. Saved replay navigation never invokes the model.

## Release and recovery

Deploy the independent cost-control stack, then run `scripts/configure-cost-budgets.ts`
with the account and cutoff topic. Deploy the web infrastructure using the existing
production image tag and domain settings; this change needs no new web container.
Inspect the CloudFormation change set so only the alias capacity is removed.
`scripts/verify-warm-web.ts` retains its historical filename but now verifies
published-alias/OAC delivery and absence of provisioned capacity.

Use the September shutdown recovery procedure only after inspecting billing and
explicit authorization to restore service; restore web reserved concurrency to ten,
model and worker concurrency to one, and CloudFront to enabled. **Do not restore
web provisioned concurrency.** Check current spend is below $20 and keep the $30
budget and cutoff subscription in place before rearming the latch.

AWS does not provide an exact hard dollar cap for this architecture. Billing and
tag attribution lag; storage, image repositories, secrets, monitoring and retained
model snapshots can accrue charges while compute is stopped. This policy is a
conservative operational control, not a guarantee that an invoice cannot exceed
$30. Domain renewals and untagged/shared account charges are outside this app-tagged
budget. Do not delete data or snapshots to manufacture a zero bill.

Sources: [AWS budget delays](https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-managing-costs.html),
[Lambda pricing](https://aws.amazon.com/lambda/pricing/).

## Production verification

Both CloudFormation stacks completed their updates. The reviewed web diff removed
only `WebLiveAlias.ProvisionedConcurrencyConfig`; the existing production image,
version 7, static release, origin and domain were preserved. AWS lists no web
provisioned allocations; reserved concurrency remains ten. CloudFront distribution
`E2DSBR5GO2JUHR` is enabled and Deployed. The guard update completed successfully.

Live budget reads confirmed $30 monthly and $2 daily with the exact Project filter.
All four monthly notifications match the policy; the $20 actual notification has
the cutoff SNS subscriber. Existing email recipients were preserved and the
operations subscription is confirmed. The hourly EventBridge rule is enabled;
all four cost/site alarms are OK. A read-only guard invocation reported
`shouldStop:false`, `state:armed`, and $0.361 reported current-month spend.
This is delayed billing data, not a final invoice estimate. The production shutdown
was not deliberately triggered; boundary and partial-failure behavior passed tests.

All 127 TypeScript tests passed, with one conditional PostgreSQL integration test
skipped. Infrastructure and scripts type checks passed. The live alias/OAC and
no-provisioned-capacity verifier passed. Homepage and readiness returned HTTP 200.
The live catalog verifier passed. All seven live product checks passed, including
completion of the 320-pitch game and restart; replay commands measured 149 ms
median, 156 ms p95 and 285 ms maximum. No model inference was needed for those
saved replay checks.
