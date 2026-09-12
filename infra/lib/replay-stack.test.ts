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
    const policies = JSON.stringify(template.findResources("AWS::IAM::Policy"));
    expect(policies).not.toContain("lambda:InvokeFunction");
    template.hasResourceProperties("AWS::Lambda::Function", {
      Timeout: 30,
      Environment: { Variables: { STORAGE_MODE: "dynamodb" } },
    });
    const functions = JSON.stringify(
      template.findResources("AWS::CloudFront::Function"),
    );
    expect(functions).toContain("x-forwarded-host");
    expect(
      JSON.stringify(template.findResources("AWS::Lambda::Function")),
    ).not.toContain("MODEL_BACKEND");
  });
});
