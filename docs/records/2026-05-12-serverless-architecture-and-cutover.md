# Serverless Architecture And Cutover

- date: 2026-05-12

## Context

The public demo needed a lower-cost deployment than standing web compute,
PostgreSQL, VPC, and NAT resources. Lambda process memory could not be used for
timeline state because Lambda execution environments are recycled and scale
independently. The model runtime also needed to move out of the old App
Runner-era stack.

## Record

The canonical public path is:

```text
CloudFront
  -> Lambda Web Adapter web/API Lambda
  -> DynamoDB
  -> server-side model Lambda invoke
```

The web/API stack owns CloudFront, the Lambda Web Adapter web function,
DynamoDB state, the session secret, web Lambda IAM, logs, and the Function URL.

The model stack owns `pitch-sequence-serverless-model-lambda`, the stable `live`
alias, optional provisioned concurrency, reserved concurrency, logs, and IAM.
The web/API Lambda invokes the model Lambda server-side. The browser cannot call
the model runtime directly.

The public custom domain is `https://baseball.saulrichardson.io`. CloudFront
owns the app endpoint and Cloudflare owns DNS. DNS should stay DNS-only so
Cloudflare does not add another proxy/cache layer in front of CloudFront.

Custom domain operating notes:

- ACM certificate region: `us-east-1`
- ACM certificate ARN:
  `arn:aws:acm:us-east-1:492205018164:certificate/62136baf-0216-4c9a-acbc-7e6e1694b0f0`
- ACM validation CNAME:
  `_392724c7db3a05ce5ce343c55aa46572.baseball` ->
  `_94c517c1b7f207b4dd147d95e3e66d2f.jkddzztszm.acm-validations.aws`
- application CNAME: `baseball` -> `d3aktfcwp3wve1.cloudfront.net`

App Runner is not part of the product path. During transition it may remain only
as a redirect to the serverless version. Retire the old App Runner-era stack
only after the serverless model stack is deployed, the web stack invokes the new
model alias, the product flow passes through the public URL, and App Runner is
confirmed redirect-only.

## Evidence

- `infra/` contains the CDK stacks.
- `scripts/deploy-serverless-model.sh` deploys the model stack.
- `scripts/deploy-serverless-web.sh` builds and deploys the web/API stack.
- `scripts/verify-product-flows.mjs` verifies the deployed user path.
- Public smoke checks use:

  ```bash
  curl -I https://baseball.saulrichardson.io/health
  curl -sS https://baseball.saulrichardson.io/ready
  BASE_URL=https://baseball.saulrichardson.io npm run verify:product
  ```

## Future Guidance

Preserve DynamoDB for deployed serverless state unless a new data-store decision
records why it changes. Do not delete old stacks, state tables, retained
snapshots, ECR rollback images, or secrets without explicit owner coordination
and a rollback or recovery plan.
