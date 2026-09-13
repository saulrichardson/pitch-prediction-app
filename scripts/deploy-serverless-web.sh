#!/usr/bin/env bash
set -euo pipefail

AWS_REGION="${AWS_REGION:-us-east-1}"
AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-$AWS_REGION}"
export AWS_REGION AWS_DEFAULT_REGION

account_id="$(aws sts get-caller-identity --query Account --output text)"
export COST_ACCOUNT_ID="${account_id}"
node --import tsx scripts/check-cost-control.ts

ECR_REPOSITORY_NAME="${ECR_REPOSITORY_NAME:-pitch-prediction-app}"
SERVERLESS_WEB_IMAGE_TAG="${SERVERLESS_WEB_IMAGE_TAG:-serverless-$(git rev-parse --short=12 HEAD)}"
SERVERLESS_WEB_LATEST_TAG="${SERVERLESS_WEB_LATEST_TAG:-serverless-latest}"
SERVERLESS_WEB_RESERVED_CONCURRENCY="${SERVERLESS_WEB_RESERVED_CONCURRENCY:-10}"
CLOUDFRONT_ALLOWED_COUNTRIES="${CLOUDFRONT_ALLOWED_COUNTRIES:-US}"
CUSTOM_DOMAIN_NAME="${CUSTOM_DOMAIN_NAME:-baseball.saulrichardson.io}"
ACM_CERTIFICATE_ARN="${ACM_CERTIFICATE_ARN:-arn:aws:acm:us-east-1:492205018164:certificate/62136baf-0216-4c9a-acbc-7e6e1694b0f0}"
export ECR_REPOSITORY_NAME SERVERLESS_WEB_IMAGE_TAG SERVERLESS_WEB_RESERVED_CONCURRENCY
export CLOUDFRONT_ALLOWED_COUNTRIES CUSTOM_DOMAIN_NAME ACM_CERTIFICATE_ARN

# Fail before changing the web deployment when no complete replay is available.
STORAGE_MODE=dynamodb DYNAMODB_TABLE_NAME="${DYNAMODB_TABLE_NAME:-pitch-sequence-serverless-state}" \
  npm run publish:replay -- --check

registry="${account_id}.dkr.ecr.${AWS_REGION}.amazonaws.com"
image_uri="${registry}/${ECR_REPOSITORY_NAME}:${SERVERLESS_WEB_IMAGE_TAG}"
latest_uri="${registry}/${ECR_REPOSITORY_NAME}:${SERVERLESS_WEB_LATEST_TAG}"

echo "Building and pushing serverless web image ${image_uri}"

aws ecr describe-repositories --repository-names "${ECR_REPOSITORY_NAME}" >/dev/null 2>&1 \
  || aws ecr create-repository --repository-name "${ECR_REPOSITORY_NAME}" >/dev/null

lifecycle_policy='{"rules":[{"rulePriority":1,"description":"Expire untagged images after 1 day","selection":{"tagStatus":"untagged","countType":"sinceImagePushed","countUnit":"days","countNumber":1},"action":{"type":"expire"}},{"rulePriority":2,"description":"Keep the 2 most recent tagged images","selection":{"tagStatus":"tagged","tagPatternList":["*"],"countType":"imageCountMoreThan","countNumber":2},"action":{"type":"expire"}}]}'
aws ecr put-lifecycle-policy \
  --repository-name "${ECR_REPOSITORY_NAME}" \
  --lifecycle-policy-text "${lifecycle_policy}" >/dev/null

aws ecr get-login-password --region "${AWS_REGION}" \
  | docker login --username AWS --password-stdin "${registry}" >/dev/null

# Lambda requires a single-platform image manifest. Loading then pushing avoids
# publishing an OCI image index with provenance attestations.
docker buildx build \
  --platform linux/amd64 \
  --provenance=false \
  --sbom=false \
  -f Dockerfile.web-lambda \
  -t "${image_uri}" \
  -t "${latest_uri}" \
  --load \
  .

docker push "${image_uri}"
docker push "${latest_uri}"

# Publish the exact container's prerendered document and hashed assets first.
# The distribution switches its document URI only after every upload succeeds.
# Old hashes and documents remain available to open tabs and rollback releases.
assets_dir="$(mktemp -d)"
assets_container="$(docker create "${image_uri}")"
trap 'docker rm "${assets_container}" >/dev/null 2>&1 || true; rm -rf "${assets_dir}"' EXIT
docker cp "${assets_container}:/app/apps/web/.next/static" "${assets_dir}/static"
docker cp "${assets_container}:/app/apps/web/.next/server/app/index.html" "${assets_dir}/index.html"
docker cp "${assets_container}:/app/apps/web/public/favicon.svg" "${assets_dir}/favicon.svg"
test -s "${assets_dir}/index.html"

distribution_id="$(aws cloudformation describe-stack-resources --stack-name PitchSequenceServerlessStack \
  --query "StackResources[?ResourceType=='AWS::CloudFront::Distribution'].PhysicalResourceId | [0]" --output text)"
test -n "${distribution_id}" && test "${distribution_id}" != "None"
# Authorize this existing distribution before its new origin starts serving.
npm --workspace @pitch/infra run deploy:assets -- --parameters "DistributionId=${distribution_id}"
assets_bucket="$(aws cloudformation describe-stacks --stack-name PitchReplayWebAssetsStack \
  --query "Stacks[0].Outputs[?OutputKey=='BucketName'].OutputValue | [0]" --output text)"
test -n "${assets_bucket}" && test "${assets_bucket}" != "None"
aws s3 sync "${assets_dir}/static/" "s3://${assets_bucket}/_next/static/" \
  --cache-control 'public,max-age=31536000,immutable' --only-show-errors
aws s3 cp "${assets_dir}/index.html" "s3://${assets_bucket}/releases/${SERVERLESS_WEB_IMAGE_TAG}/index.html" \
  --content-type 'text/html; charset=utf-8' \
  --cache-control 'public,max-age=0,s-maxage=31536000' --only-show-errors
aws s3 cp "${assets_dir}/favicon.svg" "s3://${assets_bucket}/releases/${SERVERLESS_WEB_IMAGE_TAG}/favicon.svg" \
  --content-type 'image/svg+xml' \
  --cache-control 'public,max-age=0,s-maxage=31536000' --only-show-errors

echo "Deploying PitchSequenceServerlessStack with image ${SERVERLESS_WEB_IMAGE_TAG}"
node --import tsx scripts/check-cost-control.ts
npm --workspace @pitch/infra run deploy:serverless -- --parameters "DistributionId=${distribution_id}"
WEB_DISTRIBUTION_ID="${distribution_id}" node --import tsx scripts/verify-warm-web.ts

echo "Serverless web Lambda deployed from ${SERVERLESS_WEB_IMAGE_TAG}"
