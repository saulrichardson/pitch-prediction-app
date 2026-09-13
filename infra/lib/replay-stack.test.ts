import { describe, expect, it } from "vitest";
import * as cdk from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { runInNewContext } from "node:vm";
import { PitchSequenceServerlessStack } from "./pitch-sequence-serverless-stack";
import { WebAssetsStack } from "./web-assets-stack";
import { PitchSequenceModelStack } from "./pitch-sequence-model-stack";

describe("prepared replay web infrastructure", () => {
  it("routes the API through the alias that owns one warm instance", () => {
    const template = Template.fromStack(
      new PitchSequenceServerlessStack(new cdk.App(), "WarmTest", {
        env: { account: "123456789012", region: "us-east-1" },
      }),
    );
    template.hasResourceProperties("AWS::Lambda::Function", {
      FunctionName: "pitch-sequence-serverless-web",
      MemorySize: 2048,
      ReservedConcurrentExecutions: 10,
    });
    const [aliasId, alias] = Object.entries(
      template.findResources("AWS::Lambda::Alias"),
    )[0];
    expect(alias.Properties.Name).toBe("live");
    expect(alias.Properties.ProvisionedConcurrencyConfig).toEqual({
      ProvisionedConcurrentExecutions: 1,
    });
    expect(JSON.stringify(alias.Properties.FunctionVersion)).toContain(
      "CurrentVersion",
    );
    template.resourceCountIs("AWS::Lambda::Url", 1);
    const [urlId, url] = Object.entries(
      template.findResources("AWS::Lambda::Url"),
    )[0];
    expect(url.Properties.Qualifier).toBe("live");
    expect(url.Properties.AuthType).toBe("AWS_IAM");
    expect(url.DependsOn).toContain(aliasId);
    const [distribution] = Object.values(
      template.findResources("AWS::CloudFront::Distribution"),
    );
    const config = distribution.Properties.DistributionConfig;
    const origin = config.Origins.find(
      (item: { Id: string }) =>
        item.Id === config.DefaultCacheBehavior.TargetOriginId,
    );
    expect(JSON.stringify(origin.DomainName)).toContain(urlId);
    const permissions = Object.values(
      template.findResources("AWS::Lambda::Permission"),
    );
    const invoke = permissions.find(
      (p) => p.Properties.Action === "lambda:InvokeFunction",
    );
    expect(JSON.stringify(invoke?.Properties.FunctionName)).toContain(aliasId);
    expect(invoke?.Properties.InvokedViaFunctionUrl).toBe(true);
    const invokeUrl = permissions.find(
      (p) => p.Properties.Action === "lambda:InvokeFunctionUrl",
    );
    expect(JSON.stringify(invokeUrl?.Properties.FunctionName)).toContain(urlId);
    for (const permission of [invoke, invokeUrl]) {
      expect(permission?.Properties.Principal).toBe("cloudfront.amazonaws.com");
      expect(JSON.stringify(permission?.Properties.SourceArn)).toContain(
        "distribution/",
      );
      expect(JSON.stringify(permission?.Properties.SourceArn)).toContain(
        "DistributionId",
      );
    }
    const permissionIds = Object.entries(
      template.findResources("AWS::Lambda::Permission"),
    )
      .filter(
        ([, resource]) =>
          resource.Properties.Principal === "cloudfront.amazonaws.com",
      )
      .map(([id]) => id);
    expect(distribution.DependsOn).toEqual(
      expect.arrayContaining(permissionIds),
    );
  });
  it("keeps inference out of the web role and preserves origin ownership", () => {
    const stack = new PitchSequenceServerlessStack(
      new cdk.App(),
      "ReplayTest",
      { env: { account: "123456789012", region: "us-east-1" } },
    );
    const template = Template.fromStack(stack);
    const policies = template.findResources("AWS::IAM::Policy");
    const webPolicies = JSON.stringify(
      Object.fromEntries(
        Object.entries(policies).filter(([id]) => id.startsWith("WebFunction")),
      ),
    );
    expect(webPolicies).toContain("dynamodb:GetItem");
    expect(webPolicies).not.toContain("lambda:InvokeFunction");
    template.hasResourceProperties("AWS::Lambda::Function", {
      Timeout: 30,
      Environment: { Variables: { STORAGE_MODE: "dynamodb" } },
    });
    const functions = JSON.stringify(
      template.findResources("AWS::CloudFront::Function"),
    );
    expect(functions).toContain("x-forwarded-host");
    template.hasResourceProperties("AWS::DynamoDB::Table", {
      StreamSpecification: { StreamViewType: "NEW_IMAGE" },
    });
    template.hasResourceProperties("AWS::Lambda::Function", {
      FunctionName: "pitch-sequence-game-preparation",
      Timeout: 540,
      ReservedConcurrentExecutions: 1,
    });
    const mappings = JSON.stringify(
      template.findResources("AWS::Lambda::EventSourceMapping"),
    );
    expect(mappings).toContain("game-job:");
    expect(mappings).toContain("queued");
    expect(mappings).not.toContain("session:");
    const workerPolicies = JSON.stringify(
      Object.fromEntries(
        Object.entries(policies).filter(([id]) =>
          id.startsWith("PrepareGameFunction"),
        ),
      ),
    );
    expect(workerPolicies).toContain("dynamodb:LeadingKeys");
    expect(workerPolicies).not.toContain("REPLAY#session:");
    expect(workerPolicies).not.toContain("REPLAY#featured");
  });

  it("serves release assets privately while caching only the public summary API", () => {
    const template = Template.fromStack(
      new PitchSequenceServerlessStack(new cdk.App(), "CacheTest", {
        env: { account: "123456789012", region: "us-east-1" },
      }),
    );
    const [distribution] = Object.values(
      template.findResources("AWS::CloudFront::Distribution"),
    );
    const config = distribution.Properties.DistributionConfig;
    const behaviors = Object.fromEntries(
      config.CacheBehaviors.map((b: { PathPattern: string }) => [
        b.PathPattern,
        b,
      ]),
    );
    expect(Object.keys(behaviors).sort()).toEqual([
      "/",
      "/_next/static/*",
      "/api/replays",
      "/favicon.svg",
    ]);
    expect(config.DefaultCacheBehavior.CachePolicyId).toBe(
      "4135ea2d-6df8-44a3-9df3-4b5a84be39ad",
    );
    expect(behaviors["/"].TargetOriginId).toEqual(
      behaviors["/_next/static/*"].TargetOriginId,
    );
    expect(behaviors["/"].TargetOriginId).not.toEqual(
      config.DefaultCacheBehavior.TargetOriginId,
    );
    expect(behaviors["/api/replays"].TargetOriginId).toEqual(
      config.DefaultCacheBehavior.TargetOriginId,
    );
    expect(behaviors["/api/replays"].CachedMethods).toEqual(["GET", "HEAD"]);
    expect(behaviors["/api/replays"].FunctionAssociations).toEqual(
      config.DefaultCacheBehavior.FunctionAssociations,
    );
    template.hasResourceProperties("AWS::CloudFront::CachePolicy", {
      CachePolicyConfig: {
        MinTTL: 0,
        DefaultTTL: 0,
        MaxTTL: 30,
        ParametersInCacheKeyAndForwardedToOrigin: {
          CookiesConfig: { CookieBehavior: "none" },
        },
      },
    });
    const release = Object.entries(
      template.findResources("AWS::CloudFront::Function"),
    ).find(([id]) => id.startsWith("ReleaseDocument"))![1];
    const rewrite = runInNewContext(
      `${release.Properties.FunctionCode}; handler`,
    );
    const request = {
      uri: "/",
      querystring: { replay: { value: "saved-edition" } },
    };
    expect(rewrite({ request }).uri).toMatch(/^\/releases\/[^/]+\/index.html$/);
    expect(request.querystring.replay.value).toBe("saved-edition");
    expect(rewrite({ request: { uri: "/favicon.svg" } }).uri).toMatch(
      /^\/releases\/[^/]+\/favicon.svg$/,
    );
  });

  it("retains a private asset bucket independently of application releases", () => {
    const template = Template.fromStack(
      new WebAssetsStack(new cdk.App(), "AssetsTest", {
        env: { account: "123456789012", region: "us-east-1" },
      }),
    );
    template.hasResource("AWS::S3::Bucket", {
      DeletionPolicy: "Retain",
      UpdateReplacePolicy: "Retain",
      Properties: {
        BucketName: "pitch-replay-assets-123456789012-us-east-1",
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true,
          BlockPublicPolicy: true,
          IgnorePublicAcls: true,
          RestrictPublicBuckets: true,
        },
        OwnershipControls: {
          Rules: [{ ObjectOwnership: "BucketOwnerEnforced" }],
        },
        BucketEncryption: {
          ServerSideEncryptionConfiguration: [
            { ServerSideEncryptionByDefault: { SSEAlgorithm: "AES256" } },
          ],
        },
      },
    });
    template.hasResourceProperties("AWS::S3::BucketPolicy", {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Effect: "Deny",
            Condition: { Bool: { "aws:SecureTransport": "false" } },
          }),
          Match.objectLike({
            Effect: "Allow",
            Principal: { Service: "cloudfront.amazonaws.com" },
            Action: "s3:GetObject",
            Condition: { StringEquals: { "AWS:SourceArn": Match.anyValue() } },
          }),
        ]),
      },
    });
    expect(
      JSON.stringify(template.findResources("AWS::S3::BucketPolicy")),
    ).toContain("DistributionId");
  });

  it("retains a pinned model version while preparation can still use it", () => {
    const template = Template.fromStack(
      new PitchSequenceModelStack(new cdk.App(), "ModelTest", {
        env: { account: "123456789012", region: "us-east-1" },
      }),
    );
    template.hasResource("AWS::Lambda::Version", {
      DeletionPolicy: "Retain",
      UpdateReplacePolicy: "Retain",
    });
    template.hasResourceProperties("AWS::Lambda::Function", {
      Environment: {
        Variables: { OMP_NUM_THREADS: "1", MKL_NUM_THREADS: "1" },
      },
    });
  });
});
