# Public preparation and browser security boundary

- date: 2026-09-14

## Context

An external review found that the global preparation budget bounded spend but
did not stop one anonymous client from consuming the shared allowance. It also
found no Content Security Policy and a readiness response that exposed storage
implementation details.

## Record

Keep the demo anonymous and avoid AWS WAF's standing monthly charge. CloudFront
must overwrite `x-viewer-ip` with `event.viewer.ip`; the application fails
closed in production when that trusted header is missing. The web route derives
a stable HMAC pseudonym using the application secret, and only that digest is
stored. Caller admission is atomic, idempotent by game, and limited to four
distinct games per UTC day and twenty per UTC month. The existing global model
budget remains the final cost boundary.

CloudFront owns one custom response-header policy across static and API
behaviors. It enforces CSP, denies framing, limits browser capabilities, and
publishes two-year HSTS with `includeSubDomains`. Next.js requires inline script
and style allowances in the static document; external origins remain narrowly
enumerated. `/ready` still performs the real storage/edition validation but
returns only `status`.

## Evidence

- `packages/workflows/src/caller-budget.ts` owns the atomic caller allowance.
- `apps/web/src/lib/viewer-identity.ts` owns validation and pseudonymization.
- `infra/lib/pitch-sequence-serverless-stack.ts` overwrites the trusted header
  and applies the response-header policy.
- Focused tests cover concurrency, idempotency, daily/monthly reset decisions,
  IP validation, and synthesized infrastructure.

## Future Guidance

Do not treat cookies, `Origin`, `Sec-Fetch-Site`, or the AWS payload hash as
cost authorization. If distributed abuse defeats the caller allowance, add a
human challenge or paid WAF only after recording its product and monthly-cost
tradeoff. Keep raw network addresses out of durable storage and logs.
