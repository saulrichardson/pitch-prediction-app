import {
  LambdaClient,
  GetAliasCommand,
  GetFunctionUrlConfigCommand,
  GetProvisionedConcurrencyConfigCommand,
} from "@aws-sdk/client-lambda";
import {
  CloudFrontClient,
  GetDistributionCommand,
} from "@aws-sdk/client-cloudfront";
import { setTimeout as delay } from "node:timers/promises";

const FunctionName = "pitch-sequence-serverless-web";
const Qualifier = "live";
const lambda = new LambdaClient({});
const distributionId = process.env.WEB_DISTRIBUTION_ID;
if (!distributionId) throw new Error("WEB_DISTRIBUTION_ID is required.");
const [alias, url, distribution] = await Promise.all([
  lambda.send(new GetAliasCommand({ FunctionName, Name: Qualifier })),
  lambda.send(new GetFunctionUrlConfigCommand({ FunctionName, Qualifier })),
  new CloudFrontClient({}).send(
    new GetDistributionCommand({ Id: distributionId }),
  ),
]);
if (
  !alias.FunctionVersion ||
  !/^\d+$/.test(alias.FunctionVersion) ||
  url.AuthType !== "AWS_IAM" ||
  !url.FunctionArn?.endsWith(":live") ||
  !url.FunctionUrl
)
  throw new Error(
    "The web alias must target a published version with an IAM Function URL.",
  );
const config = distribution.Distribution?.DistributionConfig;
if (!config?.Enabled || distribution.Distribution?.Status !== "Deployed")
  throw new Error("CloudFront is not deployed and enabled.");
const origin = config.Origins?.Items?.find(
  (item) => item.Id === config.DefaultCacheBehavior?.TargetOriginId,
);
if (
  origin?.DomainName !== new URL(url.FunctionUrl).hostname ||
  !origin?.OriginAccessControlId
)
  throw new Error(
    "CloudFront is bypassing the warm alias or its origin access control.",
  );
if (
  config.CacheBehaviors?.Items?.find(
    (item) => item.PathPattern === "/api/replays",
  )?.TargetOriginId !== origin.Id
)
  throw new Error("The summary API is bypassing the warm origin.");

for (let attempt = 0; attempt < 90; attempt++) {
  const capacity = await lambda.send(
    new GetProvisionedConcurrencyConfigCommand({ FunctionName, Qualifier }),
  );
  if (capacity.RequestedProvisionedConcurrentExecutions !== 1)
    throw new Error("Expected exactly one warm web instance.");
  if (
    capacity.Status === "READY" &&
    capacity.AllocatedProvisionedConcurrentExecutions === 1
  ) {
    console.log(
      `Warm web verified: version ${alias.FunctionVersion}, one READY instance, CloudFront routes through live alias with OAC.`,
    );
    process.exit(0);
  }
  if (capacity.Status === "FAILED")
    throw new Error(`Warm web failed: ${capacity.StatusReason}`);
  await delay(5_000);
}
throw new Error("Warm web did not become READY within 450 seconds.");
