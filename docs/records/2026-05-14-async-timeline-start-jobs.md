# Async Timeline Start Jobs

- date: 2026-05-14

## Context

The public app may receive a first request when the model Lambda is cold.
CloudFront's origin timeout is shorter than a worst-case cold xLSTM model load
and first prediction. The product still needs real model predictions, not mock
or cached substitutes.

## Record

Starting a replay creates a durable `TimelineStartJob` and returns immediately.
The browser shows a real waiting state and polls the job while a background web
Lambda invocation creates the first timeline and prediction.

The job states are:

- `pending`
- `running`
- `succeeded`
- `failed`

Workers must claim a job through a conditional storage transition before
calling the model. A running job has an internal lease token and lease expiry.
Completion or failure is accepted only from the current lease owner. Polling may
redispatch expired running leases so a worker timeout or process crash does not
leave the browser waiting forever.

The legacy synchronous `POST /api/timelines` start endpoint is retired for
public callers. Public replay starts use the timeline-job API.

## Evidence

- `apps/web/src/lib/timeline-job-service.ts` owns the service logic.
- `packages/db/src/storage/` owns storage-level job transitions.
- `apps/web/src/app/api/timeline-jobs/` owns the public and internal job routes.
- Product-flow verification creates timelines through the async job endpoint
  and polls until the first real prediction is visible.

## Future Guidance

Keep the first-prediction wait honest and recoverable. If later pitch
advancement also suffers from cold starts or model latency, consider moving all
prediction generation behind the same durable job/polling pattern or a
dedicated queue.
