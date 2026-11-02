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
