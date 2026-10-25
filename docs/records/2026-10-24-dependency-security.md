# Dependency security update

- date: 2026-10-24

Refresh the JavaScript and model-service locks to remove the GitHub dependency
advisories, including the Next.js remote code execution and Pillow/certifi
issues. The web build resolves Next.js 16.4.3. Vitest/Vite and AWS CDK are updated
to patched releases; the model service retains its existing project API and
pitchpredict version while updating vulnerable dependencies.

CDK 2.274.0 emits an additional InvokeFunction permission for Function URLs.
The infrastructure test now selects the explicit live-alias permission, which
is still present, instead of assuming it is the first permission of that type.
The assertions still verify the live alias, CloudFront principal, distribution
scope, and InvokedViaFunctionUrl restriction.

Run the JavaScript tests/type checks/build, the model-service tests, and both
dependency audits before the existing production deployment workflow.
