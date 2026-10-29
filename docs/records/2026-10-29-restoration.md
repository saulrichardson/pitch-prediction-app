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
Bootstrap also defers provisioned capacity until the normal update so CDN
creation can finish before warm-capacity allocation. Bootstrap omits the custom alias: CloudFront rejects creation while DNS still
points at a deleted distribution. Set DNS to the new distribution before the
normal update attaches the custom certificate and alias. Normal releases retain
permission-before-cutover ordering using the known ID.

After initial stack creation, publish reviewed real-model editions, upload the
exact image's static assets, update the assets and cost-control stacks with the
real distribution ID, and redeploy the web stack without BOOTSTRAP_WEB. Verify
cost guard, warm alias, readiness, product HTTP flows, catalog and desktop/phone
interaction before pointing Cloudflare DNS at the new distribution. Retain
reviewed edition JSON privately; it includes the original model provenance.

The CDK CLI must support the installed cloud assembly schema. Restoration
upgraded it to 2.1146.1 after the prior locked CLI rejected schema 55.

## Startup performance

Normal web versions use `/ready` as the Lambda Web Adapter readiness endpoint,
so the featured edition is loaded before provisioned capacity becomes ready.
Bootstrap alone uses `/health` so initial state publication does not block
resource creation. The web role still never invokes the model.

## Verification

The budget-scope tests reject absent scope, other projects and extra filters.
The shutdown boundary tests use $250. The bootstrap infrastructure test asserts
permissions reference the new distribution and do not create a dependency cycle.
An initial custom-alias creation failed because the stale Cloudflare CNAME
referenced the deleted distribution. CloudFormation retained the restored
table and log groups during rollback; they were imported back into the rebuilt
stack using their original logical IDs before the corrected two-phase release.

Production evidence and final release receipt are added after live verification.

## Production receipt

The original URL, https://baseball.saulrichardson.io, now resolves to
`d11r4x1wbhahas.cloudfront.net` (distribution `E2DSBR5GO2JUHR`). HTTPS,
private S3 assets, the authenticated API origin, and the completed CloudFormation
update were verified. CloudFront reports Deployed. The old CNAME was replaced
in Cloudflare with DNS-only delivery.

Web version 7 uses image `restore-20261029`, digest
`sha256:742880d22473a8fb89894e61bf541884690d0052bbc7a474b5e31614e4c4c65d`,
with `/ready` startup, one READY 2 GB provisioned instance, and concurrency ten.
The startup logs show replay validation completing before initialization finishes.
The warm-web verifier passed the qualified alias/OAC/origin checks. CloudWatch
recorded 60 provisioned invocations at 14:03 EDT and seven at 14:06 EDT.

Model live version 17 uses `restore-20261029`, digest
`sha256:807cf7d0f4e8280379f8cec9fa347eadb93bf9447de11c35035a361d4e861360`.
Real AWS health, first-pitch inference, and the saved longest-history request
returned the real xLSTM model and eight valid samples. Response schema checks
passed. Model concurrency remains one, memory 1 GB, and SnapStart enabled.

Restored editions include the 320-pitch October 4 ATL–LAD feature
`5c3d7d605c78f2f991fdf2451f2e4e669e91d647e2d239c665a7ca83c6de98c2`
and the 293-pitch September 27 LAD–SF game
`2aedcec7ab8d26e6cb226277db7e16d66c3697d1bf86db23c6eb680a71de4ded`.
The full production HTTP verifier passed seven workflow checks and all 640
commands through the featured game: 182 ms median, 500 ms p95, 922 ms maximum.
These timings were measured through the replacement distribution hostname;
the original custom host subsequently passed HTTPS, readiness, catalog,
opening and reveal in a real browser. Phone layout, advancing, and refresh
recovery were also inspected. The custom-host browser had zero console errors
or warnings. Normal first-time preparation of unsaved games remains a separate
background workflow; replay navigation never calls the model.

Local verification passed 126 application tests (the PostgreSQL integration
case is intentionally conditional), 34 model tests, 31 desktop/phone browser
tests (one phone case is intentionally skipped), typecheck, lint, production
build, static payload checks, HTTP workflows, and infrastructure synthesis.
The corrected bootstrap/startup tests passed afterward. The initial payload is
271,557 compressed JavaScript bytes.

The $250 monthly / $25 daily budgets have the exact Project filter, and the
Project cost-allocation tag is active. The monthly actual $250 cutoff targets
SNS; the guard targets the real distribution ID and passed a read-only live
check with an armed latch. Warning/forecast notifications are installed, and
the operations email subscription is confirmed. Reported tagged spend was $0;
this is delayed billing data, not a claim that restoration cost nothing.

GitHub CI run 40925940072 passed application checks but its independent Docker
build was blocked by anonymous public ECR `429 Too Many Requests / Data limit
exceeded` when pulling the upstream Lambda adapter. A prior failed run's retry
hit the same external limit. The production image built and deployed successfully
locally; the live checks above are separate evidence. Do not describe CI as green.
Exact review JSON, release logs, import templates, browser snapshots and timing
results are private local artifacts under the restoration chat's `work/` folder.
