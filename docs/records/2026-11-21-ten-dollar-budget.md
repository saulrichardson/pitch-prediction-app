# $10 monthly baseball hosting budget

The owner set a $10 USD monthly budget for baseball.saulrichardson.io. This
supersedes the November 1 policy. AWS Budgets measures the calendar month
using the active `Project=PitchPredictionApp` cost-allocation tag.

- Actual monthly alerts at $4 and $5. Forecast alert at $10. Actual daily
  spike alert at $0.75. Budget reconciliation preserves existing recipients.
- At $6 in reported monthly spend, the independent guard latches in SSM,
  removes any provisioned allocations, sets all three app Lambdas to zero
  reserved concurrency, and disables CloudFront. An hourly check backs up
  the SNS budget notification. The latch survives month rollover.
- The web Lambda has two reserved slots and no provisioned instances.
  The model and preparation worker each retain one reserved slot.
  The same web limit applies to local CDK releases and GitHub Actions.
- New model releases default to SnapStart off. The currently published model
  version 17 remains available for preparation jobs pinned to that version.
  AWS reported $2.69 in snapshot caching through November 21, equivalent to
  about $4 for a full 31-day month at the current allocation. A stopped
  function can still incur snapshot charges. AWS removes that charge when the
  published version is deleted.

The $4 margin covers expected billing delay and residual costs. AWS can still
report charges after the shutdown, and retained snapshots, storage, secrets,
and monitoring continue billing. Domain renewals and shared or untagged
account charges sit outside the app tag.

## Verification and recovery

Deploy the independent cost-control stack with the existing distribution
parameter, then run `scripts/configure-cost-budgets.ts` using the deployed
account and cutoff topic. Verify the monthly and daily budgets and their
notifications in AWS. Invoke the guard with `{"dryRun":true}` to confirm
reported spend and the latch without changing production. The web stack can be
updated using its deployed image and asset tag.

If the guard trips, inspect billing, the latch, all three functions, and
CloudFront. Repair any partial shutdown while the latch is still tripped.
After mitigating the cause, confirm owner authorization, reported spend
below $6, the $10 budget, and the cutoff subscription. Set
`/pitch-replay/cost-control` to `{"status":"armed"}`, restore reserved
concurrency to two for web and one each for worker and model, then re-enable
the distribution using its current configuration and ETag. Leave
provisioned concurrency at zero. Wait for CloudFront to deploy, confirm the
guard stays armed, check `/ready`, and smoke-test a saved replay. Recover
stalled preparation jobs through the existing workflow.

[AWS Budgets reporting delays](https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-managing-costs.html)
[Lambda snapshot charges](https://docs.aws.amazon.com/lambda/latest/dg/snapstart.html)
