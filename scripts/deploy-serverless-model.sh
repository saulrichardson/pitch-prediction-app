#!/usr/bin/env bash
set -euo pipefail

AWS_REGION="${AWS_REGION:-us-east-1}"
AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-$AWS_REGION}"
export AWS_REGION AWS_DEFAULT_REGION

account_id="$(aws sts get-caller-identity --query Account --output text)"
export COST_ACCOUNT_ID="${account_id}"
node --import tsx scripts/check-cost-control.ts

MODEL_ECR_REPOSITORY_NAME="${MODEL_ECR_REPOSITORY_NAME:-pitch-prediction-model-api}"
MODEL_LAMBDA_FUNCTION_NAME="${MODEL_LAMBDA_FUNCTION_NAME:-pitch-sequence-serverless-model-lambda}"
MODEL_LAMBDA_ALIAS="${MODEL_LAMBDA_ALIAS:-live}"
MODEL_LAMBDA_ARCHITECTURE="${MODEL_LAMBDA_ARCHITECTURE:-x86_64}"
MODEL_LAMBDA_PROVISIONED_CONCURRENCY="${MODEL_LAMBDA_PROVISIONED_CONCURRENCY:-0}"
MODEL_LAMBDA_RESERVED_CONCURRENCY="${MODEL_LAMBDA_RESERVED_CONCURRENCY:-1}"
MODEL_LAMBDA_TIMEOUT_SECONDS="${MODEL_LAMBDA_TIMEOUT_SECONDS:-300}"
MODEL_LAMBDA_MEMORY_MB="${MODEL_LAMBDA_MEMORY_MB:-1024}"
MODEL_LAMBDA_SNAPSTART="${MODEL_LAMBDA_SNAPSTART:-1}"
MODEL_IMAGE_TAG="${MODEL_IMAGE_TAG:-model-serverless-$(git rev-parse --short=12 HEAD)}"
export MODEL_ECR_REPOSITORY_NAME MODEL_LAMBDA_FUNCTION_NAME MODEL_LAMBDA_ALIAS
export MODEL_LAMBDA_ARCHITECTURE MODEL_LAMBDA_PROVISIONED_CONCURRENCY MODEL_LAMBDA_RESERVED_CONCURRENCY
export MODEL_LAMBDA_TIMEOUT_SECONDS MODEL_LAMBDA_MEMORY_MB MODEL_IMAGE_TAG
export MODEL_LAMBDA_SNAPSTART

case "${MODEL_LAMBDA_SNAPSTART}" in
  0 | [Ff][Aa][Ll][Ss][Ee] | [Nn][Oo] | [Oo][Ff][Ff]) snapstart_enabled=0 ;;
  1 | [Tt][Rr][Uu][Ee] | [Yy][Ee][Ss] | [Oo][Nn]) snapstart_enabled=1 ;;
  *)
    echo "MODEL_LAMBDA_SNAPSTART must be true or false." >&2
    exit 1
    ;;
esac

if [ "${snapstart_enabled}" -eq 1 ] && [ "${MODEL_LAMBDA_PROVISIONED_CONCURRENCY}" -gt 0 ]; then
  echo "SnapStart and provisioned concurrency cannot both be enabled. Set MODEL_LAMBDA_SNAPSTART=0 for a provisioned deployment." >&2
  exit 1
fi

case "${MODEL_LAMBDA_ARCHITECTURE}" in
  x86_64 | amd64)
    docker_platform="linux/amd64"
    ;;
  arm64 | arm_64 | aarch64)
    docker_platform="linux/arm64"
    ;;
  *)
    echo "MODEL_LAMBDA_ARCHITECTURE must be x86_64 or arm64." >&2
    exit 1
    ;;
esac

registry="${account_id}.dkr.ecr.${AWS_REGION}.amazonaws.com"
image_uri="${registry}/${MODEL_ECR_REPOSITORY_NAME}:${MODEL_IMAGE_TAG}"

echo "Building and pushing serverless model image ${image_uri}"

aws ecr describe-repositories --repository-names "${MODEL_ECR_REPOSITORY_NAME}" >/dev/null 2>&1 \
  || aws ecr create-repository --repository-name "${MODEL_ECR_REPOSITORY_NAME}" >/dev/null

lifecycle_policy='{"rules":[{"rulePriority":1,"description":"Expire untagged images after 1 day","selection":{"tagStatus":"untagged","countType":"sinceImagePushed","countUnit":"days","countNumber":1},"action":{"type":"expire"}},{"rulePriority":2,"description":"Keep the 2 most recent tagged images","selection":{"tagStatus":"tagged","tagPatternList":["*"],"countType":"imageCountMoreThan","countNumber":2},"action":{"type":"expire"}}]}'
aws ecr put-lifecycle-policy \
  --repository-name "${MODEL_ECR_REPOSITORY_NAME}" \
  --lifecycle-policy-text "${lifecycle_policy}" >/dev/null

aws ecr get-login-password --region "${AWS_REGION}" \
  | docker login --username AWS --password-stdin "${registry}" >/dev/null

docker buildx build \
  --platform "${docker_platform}" \
  --provenance=false \
  --sbom=false \
  -f services/model-api/Dockerfile.lambda \
  -t "${image_uri}" \
  --load \
  services/model-api

docker push "${image_uri}"

echo "Deploying PitchSequenceModelStack for ${MODEL_LAMBDA_FUNCTION_NAME}:${MODEL_LAMBDA_ALIAS}"
node --import tsx scripts/check-cost-control.ts
npm --workspace @pitch/infra run deploy:model

if [ "${MODEL_LAMBDA_PROVISIONED_CONCURRENCY}" -gt 0 ]; then
  echo "Waiting for provisioned concurrency on ${MODEL_LAMBDA_FUNCTION_NAME}:${MODEL_LAMBDA_ALIAS}"
  provisioned_status=""
  for _ in $(seq 1 90); do
    provisioned_status="$(aws lambda get-provisioned-concurrency-config \
      --function-name "${MODEL_LAMBDA_FUNCTION_NAME}" \
      --qualifier "${MODEL_LAMBDA_ALIAS}" \
      --query Status \
      --output text 2>/dev/null || true)"
    if [ "${provisioned_status}" = "READY" ]; then
      break
    fi
    if [ "${provisioned_status}" = "FAILED" ]; then
      aws lambda get-provisioned-concurrency-config \
        --function-name "${MODEL_LAMBDA_FUNCTION_NAME}" \
        --qualifier "${MODEL_LAMBDA_ALIAS}" >&2 || true
      exit 1
    fi
    sleep 10
  done
  if [ "${provisioned_status}" != "READY" ]; then
    echo "Provisioned concurrency did not become READY. Last status: ${provisioned_status:-unknown}" >&2
    exit 1
  fi
fi

health_file="$(mktemp)"
trap 'rm -f "${health_file}"' EXIT

aws lambda invoke \
  --function-name "${MODEL_LAMBDA_FUNCTION_NAME}:${MODEL_LAMBDA_ALIAS}" \
  --cli-binary-format raw-in-base64-out \
  --cli-read-timeout "${MODEL_LAMBDA_TIMEOUT_SECONDS}" \
  --payload '{"action":"health"}' \
  "${health_file}" >/dev/null

python3 - "${health_file}" <<'PY'
from __future__ import annotations

import json
import sys

with open(sys.argv[1], "r", encoding="utf-8") as handle:
    payload = json.load(handle)

status = payload.get("health", {}).get("status")
if payload.get("ok") is not True or status != "ok":
    raise SystemExit(f"serverless model alias health check failed: {payload}")

print(f"Serverless model alias is ready: status={status}")
PY

echo "Serverless model Lambda deployed at ${MODEL_LAMBDA_FUNCTION_NAME}:${MODEL_LAMBDA_ALIAS}"
