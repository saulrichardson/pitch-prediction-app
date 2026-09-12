# Stack And Operating Model

- date: 2026-05-09

## Context

The project started from an older generated agentic-engineering documentation
set whose default implementation profile was more purity-oriented than this app
needed. The app quickly moved to a job-aligned mainstream stack for a working
MLB prediction demo.

## Record

Use the current TypeScript-first web stack for production application work:

- Next.js App Router, React, and TypeScript for the web UI
- Next.js API routes, Node.js, and TypeScript for the web/API boundary
- isolated Python/FastAPI model runtime for PitchPredict inference
- DynamoDB for deployed serverless state
- PostgreSQL and Drizzle only for SQL durable mode
- memory storage only for local development
- signed anonymous workspace sessions for ownership
- Vitest, pytest, Playwright, product-flow checks, and GitHub Actions for
  verification
- AWS CloudFront, Lambda Web Adapter, Lambda, DynamoDB, Secrets Manager, ECR,
  and CDK for the public serverless demo

The old generated template metadata is historical context, not implementation
authority.

## Evidence

- `package.json` defines the Node, npm, workspace, build, test, model test,
  lint, infrastructure synth, and product verification commands.
- `apps/web/`, `packages/domain/`, `packages/db/`, `services/model-api/`, and
  `infra/` contain the implemented boundaries.
- `docs/approach.md` records the current operating model.

## Future Guidance

When the stack changes, update `docs/approach.md`. Add a new record when a
future agent should inherit the reason, tradeoff, migration path, or rollback
expectation behind the change.
