# Faster delivery and incremental pitch decoding

- date: 2026-09-13

## Context

The owner requested faster loading and less waiting, with room for a modest
budget increase. Production measurements separated three causes: browser code
size, web cold starts, and repeated model computation. Warm web requests were
already about 75–85 ms in the sampled flows. The previous 24 hours of web logs
contained cold initializations of 0.7–3.4 seconds. These logs include deployment
and verification traffic; they are not an organic-traffic percentile study.

Preparing PIT at CHC (game 824631) previously took 98.6 seconds for six pitches.
Model invocations grew from 4.3 to 29.3 seconds as history grew. pitchpredict
0.5.0 recomputed the full growing history for every one of 16 generated tokens.

## Decisions

- Keep the real pinned checkpoint, eight samples, upstream grammar and sampling,
  prediction normalization, and immutable saved-edition semantics.
- Give each prediction a fresh incremental decoder over shared read-only
  weights. Evaluate its prefix once and append one token at a time. Reuse the
  upstream `_chunk_parallel` kernel with recurrent state; `cell.step` has a
  different normalization order and is not a parity-preserving substitute.
  Reject changed history or nonincremental reuse. No decoder state survives
  into another prediction or snapshot.
- Use Zod Mini for the two strict browser contracts. Direct package subpath
  imports keep full server-side edition schemas out of the application bundle.
  Validation still rejects impossible dates, unknown fields, invalid actions,
  bad UUIDs, and negative/noninteger revisions.
- Deliver the prerendered public document, favicon, and hashed Next assets
  from a private S3 bucket through CloudFront OAC. Lambda remains the API origin.
  The root is static and contains no edition, session, or actual pitch data.
- Cache only the public featured summary GET for 30 seconds. Its handler never
  reads or creates a session. Every private replay response stays `no-store`.
  The exact `/api/replays` behavior caches GET/HEAD only, forwards POST cookies
  and the trusted viewer host, and has zero minimum/default TTL. Errors opt out.
- Keep existing memory, concurrency, and attempt limits for this rollout.
  Standing warm web capacity is a separate budget decision. One 2 GB x86
  provisioned instance is about $21.90 per 730-hour month before usage charges
  at the published $0.0000041667 per GB-second rate. S3 adds storage/request
  usage without standing compute capacity.

## Delivery and rollback

`scripts/deploy-serverless-web.sh` is the release entry point. It builds one
Lambda-compatible image manifest, deploys `PitchReplayWebAssetsStack`, copies
the exact image's prerendered HTML and assets to S3, then deploys the web stack.
Missing prerendered HTML fails before switching traffic. The distribution
rewrites `/` and `/favicon.svg` to `/releases/<immutable-image-tag>/...` before
cache lookup. Query parameters remain available to the client. A new tag gets
a new document cache key; no global invalidation is needed. Hashed assets and
old documents are retained for open tabs and rollback. Seed the prior release's
hashed assets before the first migration from Lambda delivery.

The asset stack owns the private bucket and its policy, limited to the existing
distribution's ARN and static paths, with TLS required. The release script reads
the distribution ID from the deployed web stack and supplies it as an asset
stack parameter. Access is ready before traffic switches; there is no
CloudFormation dependency cycle. CDK's imported-bucket OAC warning is expected:
`WebAssetsStack` supplies the required policy before web deployment.

Retain model versions across rollout because preparation jobs pin immutable
versions across invocations and retries. For the first rollout, add Retain to
the existing version's deployed template before replacing it. After verifying
the new model, inspect every incomplete/retryable game job before retiring
unused older snapshots; completed editions need no model invocation. Preserve
the prior image and rollback template. Retained unused snapshots carry cost.

Rollback the web by restoring its previous template/image and, for later S3
releases, previous release tag. Roll back the model alias to a retained version,
or redeploy the preserved prior image if its snapshot has been retired. Do not
rewrite saved editions. Do not remove a version still pinned by a resumable job.

## Evidence and future checks

The main application chunk fell from 143,495 to 87,077 gzip bytes (39.3%).
All JavaScript compressed transfer fell by about 17%; framework chunks remain.
`npm run verify:static` requires prerendered HTML and caps its initial JavaScript
at 300,000 gzip bytes in CI. Investigate client imports before raising that budget.
Six real PIT/CHC requests produced identical normalized forecast values with
equal seeds, excluding generated IDs and timestamps. Local decoding took
122–153 ms versus 264–1,294 ms in that run. This is local evidence, not AWS
latency. Eight decoder tests exercise every generated position, chunk boundaries,
sampling parity, changing context, request isolation, and invalid reuse. All
30 Python tests pass.

Before delivery, run the full repository/CI checks, inspect the live interface,
verify CDN miss/hit behavior and private S3 access, and measure the real AWS
model. Record those production measurements here after rollout. On any
pitchpredict or PyTorch upgrade, rerun seeded parity against the pinned real
checkpoint as well as unit tests. Performance improvements do not establish
model calibration or accuracy across games.
