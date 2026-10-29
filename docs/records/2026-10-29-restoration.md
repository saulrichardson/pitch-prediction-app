# Restore hosting with an app-specific budget

- date: 2026-10-29

## Context

The owner requested restoring the baseball app linked from the personal website,
with quick, responsive interaction. The owner then requested a generous budget
limit. Use $250 monthly, $100/$200 actual warnings, a $250 forecast warning,
and a $25 daily warning.

AWS CloudFormation recorded deletion of the application, model, static assets,
cost controls, and CDK bootstrap on October 22 UTC. Lambda functions, ECR images,
and the DynamoDB table were absent. The original certificate survived, and
Cloudflare still had the old distribution CNAME. Reviewed full-game editions
survived locally. This was a rebuild from retained source/artifacts, not a
restart of an existing deployment.

## Budget ownership

Use `Pitch Replay Monthly Cost Budget` and `Pitch Replay Daily Cost Budget`,
filtered to `user:Project$PitchPredictionApp`. Every application stack and
manually created image repository uses `Project=PitchPredictionApp`. The Project
cost-allocation tag must be active. The deployment preflight and guard require
this exact scope and reject account-wide or differently filtered budgets.
Unrelated account spending must not stop this application. Native email alerts
retain the owner's prior budget contact; do not commit that address.

The automatic guard retains the latched stop, hourly billing check, and scoped
permissions. Billing/tag attribution is delayed, so $250 is an operational
threshold, not an exact prepaid ceiling. Concurrency, finite timeouts,
preparation attempt limits and caller limits continue bounding workload.

## Rebuilding a deleted distribution

Recreate CDK bootstrap and the two ECR repositories, then publish production
images. Bootstrap the private asset stack with the placeholder distribution ID
`BOOTSTRAP` (which authorizes no real distribution). For initial serverless
stack creation only, set `BOOTSTRAP_WEB=true`: Lambda permissions reference the
new distribution and are created afterward, avoiding a circular dependency.
Normal releases retain permission-before-cutover ordering using the known ID.

After initial stack creation, publish reviewed real-model editions, upload the
exact image's static assets, update the assets and cost-control stacks with the
real distribution ID, and redeploy the web stack without BOOTSTRAP_WEB. Verify
cost guard, warm alias, readiness, product HTTP flows, catalog and desktop/phone
interaction before pointing Cloudflare DNS at the new distribution. Retain
reviewed edition JSON privately; it includes the original model provenance.

The CDK CLI must support the installed cloud assembly schema. Restoration
upgraded it to 2.1146.1 after the prior locked CLI rejected schema 55.

## Verification

The budget-scope tests reject absent scope, other projects and extra filters.
The shutdown boundary tests use $250. The bootstrap infrastructure test asserts
permissions reference the new distribution and do not create a dependency cycle.
Production evidence and final release receipt are added after live verification.
