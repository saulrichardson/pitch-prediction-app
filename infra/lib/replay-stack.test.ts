import { describe, expect, it } from "vitest";
import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { PitchSequenceServerlessStack } from "./pitch-sequence-serverless-stack";

describe("prepared replay web infrastructure", () => {
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
});
