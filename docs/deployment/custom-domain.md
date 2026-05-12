# Custom Domain

The serverless deployment is intended to be reachable at:

```text
https://baseball.saulrichardson.io
```

CloudFront owns the app endpoint. Cloudflare owns DNS for `saulrichardson.io`.

## AWS Resources

- CloudFront distribution output: `ServerlessWebUrl`
- custom domain output: `CustomDomainUrl`
- ACM certificate region: `us-east-1`
- ACM certificate ARN: `arn:aws:acm:us-east-1:492205018164:certificate/62136baf-0216-4c9a-acbc-7e6e1694b0f0`

## Required Cloudflare DNS Records

ACM DNS validation record:

```text
Type: CNAME
Name: _392724c7db3a05ce5ce343c55aa46572.baseball
Target: _94c517c1b7f207b4dd147d95e3e66d2f.jkddzztszm.acm-validations.aws
Proxy status: DNS only
TTL: Auto
```

Application record, after the CloudFront distribution has the custom domain
attached:

```text
Type: CNAME
Name: baseball
Target: d3aktfcwp3wve1.cloudfront.net
Proxy status: DNS only
TTL: Auto
```

Use DNS-only records so Cloudflare does not add another proxy/cache layer in
front of CloudFront.

## Verification

After Cloudflare DNS is configured and the deploy workflow has completed:

```sh
curl -I https://baseball.saulrichardson.io/health
curl -sS https://baseball.saulrichardson.io/ready
BASE_URL=https://baseball.saulrichardson.io npm run verify:product
```
