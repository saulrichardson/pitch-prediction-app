# Model Cold-Start Path

- date: 2026-09-03

## Context

The first public replay after an idle period appeared stuck. Production logs
showed the on-demand model Lambda exceeding its 10-second initialization phase,
then repeating initialization inside the first invocation. The successful
request took about 64 seconds at 1024 MB. It also downloaded the xLSTM
checkpoint from Hugging Face without authentication during that user request.

## Record

Keep provisioned concurrency at 0 and reserved concurrency at 1 for the public
low-cost demo. Improve the cold path without provisioned capacity:

- pin and checksum-verify the xLSTM checkpoint in the model image build
- keep the Lambda image and runtime on the xLSTM-only import path instead of
  loading the unused similarity/Statcast dependency graph
- set `PITCHPREDICT_XLSTM_PATH=/opt/pitchpredict-xlstm` in the image and Lambda
- enable SnapStart for published container-image versions and preload the model
  while Lambda creates each version snapshot
- allocate 1024 MB to keep continuous snapshot caching near 4.03 USD per
  31-day month, leaving provisioned concurrency disabled
- keep module import lazy outside the SnapStart publish phase, so explicitly
  disabling SnapStart falls back to first-invocation warmup safely
- reseed Python, NumPy, and PyTorch randomness after each snapshot restore

The pinned checkpoint revision is
`97a87376621182e14cbd9c5b6c21077189b7df64`. Changing it requires updating the
reviewed SHA-256 digests in `services/model-api/Dockerfile.lambda`.

## Evidence

- CloudWatch reported `INIT_REPORT ... Status: timeout` at 9999.59 ms for the
  broken-feeling request.
- The same invocation completed successfully in 63968.68 ms, used 732 MB, and
  logged an unauthenticated Hugging Face download before loading the model.
- `services/model-api/src/pitch_model_api/lambda_handler.py` initializes during
  module import only when both the deployment opt-in and Lambda's `snap-start`
  initialization phase are present.
- `services/model-api/Dockerfile.lambda` owns the pinned checkpoint artifact.
- `infra/lib/pitch-sequence-model-stack.ts` owns model memory and runtime paths.
- Production version 11 reached `Active` with SnapStart optimization `On` at
  1024 MB. Snapshot initialization took 63484.32 ms during deployment; the
  first restore took 1619.95 ms and its health handler took 94.10 ms.
- A clean public-site replay reached the populated `Reveal Actual` state in
  8026 ms. Its warm model invocation took 4543.90 ms and used 514 MB.

## Future Guidance

Measure restore and warm invocation duration after model deployments. Delete
superseded published versions so unused snapshots do not keep accruing cache
charges. Keep the public demo at 1024 MB while it retains its 5 USD/month
posture. Do not enable provisioned concurrency by default unless SnapStart is
disabled and the owner explicitly accepts its standing monthly cost.
