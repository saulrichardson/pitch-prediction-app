#!/usr/bin/env bash
set -euo pipefail

AWS_REGION="${AWS_REGION:-us-east-1}"
AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-$AWS_REGION}"
export AWS_REGION AWS_DEFAULT_REGION

MODEL_LAMBDA_FUNCTION_NAME="${MODEL_LAMBDA_FUNCTION_NAME:-pitch-sequence-serverless-model-lambda}"
MODEL_LAMBDA_ALIAS="${MODEL_LAMBDA_ALIAS:-live}"
MODEL_LAMBDA_ARCHITECTURE="${MODEL_LAMBDA_ARCHITECTURE:-x86_64}"
MODEL_LAMBDA_PROVISIONED_CONCURRENCY="${MODEL_LAMBDA_PROVISIONED_CONCURRENCY:-0}"
MODEL_LAMBDA_RESERVED_CONCURRENCY="${MODEL_LAMBDA_RESERVED_CONCURRENCY:-1}"
MODEL_LAMBDA_TIMEOUT_SECONDS="${MODEL_LAMBDA_TIMEOUT_SECONDS:-300}"
MODEL_LAMBDA_MEMORY_MB="${MODEL_LAMBDA_MEMORY_MB:-1024}"
MODEL_LAMBDA_SNAPSTART="${MODEL_LAMBDA_SNAPSTART:-1}"
MODEL_ECR_REPOSITORY_NAME="${MODEL_ECR_REPOSITORY_NAME:-pitch-prediction-model-api}"
MODEL_IMAGE_TAG="${MODEL_IMAGE_TAG:-model-serverless-$(git rev-parse --short=12 HEAD)}"

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

if [ "${snapstart_enabled}" -eq 0 ]; then
  snapstart_apply_on="None"
  initialize_for_snapshot="false"
else
  snapstart_apply_on="PublishedVersions"
  initialize_for_snapshot="true"
fi

case "${MODEL_LAMBDA_ARCHITECTURE}" in
  x86_64 | amd64)
    docker_platform="linux/amd64"
    lambda_architecture="x86_64"
    ;;
  arm64 | arm_64 | aarch64)
    docker_platform="linux/arm64"
    lambda_architecture="arm64"
    ;;
  *)
    echo "MODEL_LAMBDA_ARCHITECTURE must be x86_64 or arm64." >&2
    exit 1
    ;;
esac

account_id="$(aws sts get-caller-identity --query Account --output text)"
registry="${account_id}.dkr.ecr.${AWS_REGION}.amazonaws.com"
image_uri="${registry}/${MODEL_ECR_REPOSITORY_NAME}:${MODEL_IMAGE_TAG}"

echo "Deploying model image ${image_uri}"

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
  -f services/model-api/Dockerfile.lambda \
  -t "${image_uri}" \
  --push \
  services/model-api

env_file="$(mktemp)"
trap 'rm -f "${env_file}"' EXIT

existing_env="$(aws lambda get-function-configuration \
  --function-name "${MODEL_LAMBDA_FUNCTION_NAME}" \
  --query 'Environment.Variables' \
  --output json)"

EXISTING_ENV="${existing_env}" INITIALIZE_FOR_SNAPSHOT="${initialize_for_snapshot}" python3 - <<'PY' > "${env_file}"
from __future__ import annotations

import json
import os

raw = os.environ.get("EXISTING_ENV", "{}")
variables = json.loads(raw) if raw and raw != "null" else {}
variables.update(
    {
        "ENVIRONMENT": "lambda",
        "MODEL_API_AUTH_REQUIRED": "false",
        "PITCHPREDICT_ALGORITHM": variables.get("PITCHPREDICT_ALGORITHM", "xlstm"),
        "PITCHPREDICT_SAMPLE_SIZE": variables.get("PITCHPREDICT_SAMPLE_SIZE", "8"),
        "PITCHPREDICT_WARM_ON_STARTUP": "true",
        "PITCHPREDICT_INITIALIZE_FOR_SNAPSHOT": os.environ.get("INITIALIZE_FOR_SNAPSHOT", "true"),
        "HOME": "/tmp",
        "XDG_CACHE_HOME": "/tmp/.cache",
        "HF_HOME": "/tmp/huggingface",
        "HUGGINGFACE_HUB_CACHE": "/tmp/huggingface/hub",
        "MPLCONFIGDIR": "/tmp/matplotlib",
        "TORCH_HOME": "/tmp/torch",
        "PYBASEBALL_CACHE": "/tmp/pybaseball-cache",
        "PITCHPREDICT_MODEL_DIR": "/tmp/pitchpredict-model",
        "PITCHPREDICT_XLSTM_PATH": "/opt/pitchpredict-xlstm",
        "PITCHPREDICT_CACHE_DIR": "/tmp/pitchpredict-cache",
        "PITCHPREDICT_LOG_DIR": "/tmp/pitchpredict-logs",
    }
)
print(json.dumps({"Variables": variables}, separators=(",", ":")))
PY

aws lambda put-function-concurrency \
  --function-name "${MODEL_LAMBDA_FUNCTION_NAME}" \
  --reserved-concurrent-executions "${MODEL_LAMBDA_RESERVED_CONCURRENCY}" >/dev/null

aws lambda update-function-configuration \
  --function-name "${MODEL_LAMBDA_FUNCTION_NAME}" \
  --architectures "${lambda_architecture}" \
  --timeout "${MODEL_LAMBDA_TIMEOUT_SECONDS}" \
  --memory-size "${MODEL_LAMBDA_MEMORY_MB}" \
  --ephemeral-storage Size=512 \
  --snap-start ApplyOn="${snapstart_apply_on}" \
  --environment "file://${env_file}" >/dev/null

aws lambda wait function-updated --function-name "${MODEL_LAMBDA_FUNCTION_NAME}"

aws lambda update-function-code \
  --function-name "${MODEL_LAMBDA_FUNCTION_NAME}" \
  --image-uri "${image_uri}" >/dev/null

aws lambda wait function-updated --function-name "${MODEL_LAMBDA_FUNCTION_NAME}"

publish_file="$(mktemp)"
publish_error_file="$(mktemp)"
if aws lambda publish-version \
  --function-name "${MODEL_LAMBDA_FUNCTION_NAME}" \
  --description "Model image ${image_uri}" \
  > "${publish_file}" 2> "${publish_error_file}"; then
  version="$(python3 - "${publish_file}" <<'PY'
from __future__ import annotations

import json
import sys

with open(sys.argv[1], "r", encoding="utf-8") as handle:
    print(json.load(handle)["Version"])
PY
)"
elif grep -Eqi "version.*exists|already exists|no changes" "${publish_error_file}"; then
  version="$(aws lambda get-alias \
    --function-name "${MODEL_LAMBDA_FUNCTION_NAME}" \
    --name "${MODEL_LAMBDA_ALIAS}" \
    --query FunctionVersion \
    --output text 2>/dev/null || true)"
  if [ -z "${version}" ] || [ "${version}" = "None" ]; then
    version="$(aws lambda list-versions-by-function \
      --function-name "${MODEL_LAMBDA_FUNCTION_NAME}" \
      --query 'Versions[?Version!=`$LATEST`][-1].Version' \
      --output text)"
  fi
else
  cat "${publish_error_file}" >&2
  exit 1
fi
rm -f "${publish_file}" "${publish_error_file}"

if [ -z "${version}" ] || [ "${version}" = "None" ]; then
  echo "Could not resolve a published model Lambda version." >&2
  exit 1
fi

if [ "${snapstart_enabled}" -eq 1 ]; then
  echo "Waiting for SnapStart snapshot on ${MODEL_LAMBDA_FUNCTION_NAME}:${version}"
  version_state=""
  optimization_status=""
  for _ in $(seq 1 90); do
    read -r version_state optimization_status <<< "$(aws lambda get-function-configuration \
      --function-name "${MODEL_LAMBDA_FUNCTION_NAME}" \
      --qualifier "${version}" \
      --query '[State,SnapStart.OptimizationStatus]' \
      --output text)"
    if [ "${version_state}" = "Active" ] && [ "${optimization_status}" = "On" ]; then
      break
    fi
    if [ "${version_state}" = "Failed" ]; then
      aws lambda get-function-configuration \
        --function-name "${MODEL_LAMBDA_FUNCTION_NAME}" \
        --qualifier "${version}" >&2
      exit 1
    fi
    sleep 10
  done
  if [ "${version_state}" != "Active" ] || [ "${optimization_status}" != "On" ]; then
    echo "SnapStart snapshot did not become ready. State=${version_state:-unknown} Optimization=${optimization_status:-unknown}" >&2
    exit 1
  fi
fi

if aws lambda get-alias --function-name "${MODEL_LAMBDA_FUNCTION_NAME}" --name "${MODEL_LAMBDA_ALIAS}" >/dev/null 2>&1; then
  if aws lambda get-provisioned-concurrency-config \
    --function-name "${MODEL_LAMBDA_FUNCTION_NAME}" \
    --qualifier "${MODEL_LAMBDA_ALIAS}" >/dev/null 2>&1; then
    aws lambda delete-provisioned-concurrency-config \
      --function-name "${MODEL_LAMBDA_FUNCTION_NAME}" \
      --qualifier "${MODEL_LAMBDA_ALIAS}" >/dev/null

    for _ in $(seq 1 30); do
      if ! aws lambda get-provisioned-concurrency-config \
        --function-name "${MODEL_LAMBDA_FUNCTION_NAME}" \
        --qualifier "${MODEL_LAMBDA_ALIAS}" >/dev/null 2>&1; then
        break
      fi
      sleep 2
    done
  fi

  aws lambda delete-alias \
    --function-name "${MODEL_LAMBDA_FUNCTION_NAME}" \
    --name "${MODEL_LAMBDA_ALIAS}" >/dev/null
fi

aws lambda create-alias \
  --function-name "${MODEL_LAMBDA_FUNCTION_NAME}" \
  --name "${MODEL_LAMBDA_ALIAS}" \
  --function-version "${version}" >/dev/null

if [ "${MODEL_LAMBDA_PROVISIONED_CONCURRENCY}" -gt 0 ]; then
  aws lambda put-provisioned-concurrency-config \
    --function-name "${MODEL_LAMBDA_FUNCTION_NAME}" \
    --qualifier "${MODEL_LAMBDA_ALIAS}" \
    --provisioned-concurrent-executions "${MODEL_LAMBDA_PROVISIONED_CONCURRENCY}" >/dev/null

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
    raise SystemExit(f"model alias health check failed: {payload}")

print(f"Model alias is ready: status={status}")
PY

rm -f "${health_file}"
echo "Model Lambda deployed at ${MODEL_LAMBDA_FUNCTION_NAME}:${MODEL_LAMBDA_ALIAS} version ${version}"
