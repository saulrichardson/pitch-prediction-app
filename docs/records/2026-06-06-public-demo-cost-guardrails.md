# Public Demo Cost Guardrails

- date: 2026-06-06

## Context

The owner set a hard preference to avoid spending more than 5 USD/month on the
public demo. The prior posture already avoided standing model provisioned
concurrency, but the public surface still allowed direct Lambda Function URL
access and had no application-level quotas for high-cost actions.

## Record

Default the public demo to no-standing-charge guardrails:

- CloudFront uses Lambda Function URL origin access control with IAM signing, so
  direct Function URL access is not the supported public path.
- AWS WAF is not enabled by default while the monthly target is under 5 USD; a
  Web ACL has a standing monthly charge before normal traffic.
- Web Lambda reserved concurrency stays at 10 so browser static chunk cache
  misses can hydrate the page and the async start-job worker can run while the
  browser polls; model Lambda reserved concurrency defaults to 1.
- Model provisioned concurrency remains 0 by default.
- DynamoDB on-demand throughput is capped at low demo values.
- Lambda log retention is 1 day.
- ECR lifecycle policies keep only the 2 newest tagged images and expire
  untagged images after 1 day.
- The CloudFront distribution defaults to a US country allowlist.
- DynamoDB-backed usage counters enforce daily and monthly limits for timeline
  starts and model predictions.

The application should return explicit 429 `cost_limit_exceeded` responses when
usage limits are exhausted. Those responses should include structured
limit/reset metadata when available, and the browser should present them as a
public-demo billing guardrail rather than a generic failure. The app should not
silently fall back to mock predictions or start extra model capacity.

Vercel Analytics and Speed Insights are disabled outside Vercel unless
explicitly enabled. The AWS-hosted public demo should not request unavailable
`/_vercel/*` scripts.

## Evidence

- `apps/web/src/lib/cost-guards.ts` centralizes timeline-start and
  model-prediction quotas.
- `packages/db/src/storage/dynamodb.ts` enforces production counters with
  conditional DynamoDB updates.
- `infra/lib/pitch-sequence-serverless-stack.ts` owns CloudFront OAC, web
  concurrency, DynamoDB throughput caps, country allowlist, and web cost env.
- `infra/lib/pitch-sequence-model-stack.ts` owns model concurrency and log
  retention.
- `scripts/verify-product-flows.mjs` and the browser API helper send
  `x-amz-content-sha256` for JSON POSTs required by CloudFront OAC.
- `apps/web/src/components/pitch-sequence-lab/billing-limits.ts` translates
  `cost_limit_exceeded` API and async-job failures into billing-limit UI state.
- `apps/web/src/components/site-telemetry-config.ts` keeps Vercel telemetry
  tied to the Vercel runtime or an explicit opt-in.

## Future Guidance

Treat 5 USD/month as an operating posture, not an AWS-enforced hard cap. AWS
Budgets can alert, and reserved concurrency can stop Lambda spend, but AWS does
not provide a universal hard account spending ceiling for this stack.

Before adding WAF, provisioned concurrency, broader geography, longer retention,
higher quotas, or additional always-on services, record the expected monthly
cost and the product reason. If spending must stop immediately, set reserved
concurrency to 0 for both the web and model Lambdas and investigate before
restoring service.
