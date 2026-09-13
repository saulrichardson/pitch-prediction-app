import { expect, it } from "vitest";
import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { CostControlsStack } from "./cost-controls-stack";

it("keeps the guard independent, narrowly scoped, retained and monitored", () => {
  const template = Template.fromStack(
    new CostControlsStack(new cdk.App(), "CostTest", {
      env: { account: "123456789012", region: "us-east-1" },
    }),
  );
  template.hasResource("AWS::SSM::Parameter", {
    DeletionPolicy: "Retain",
    Properties: {
      Name: "/pitch-replay/cost-control",
      Value: '{"status":"armed"}',
    },
  });
  template.hasResourceProperties("AWS::Lambda::Function", {
    FunctionName: "pitch-replay-cost-control",
    ReservedConcurrentExecutions: 1,
    MemorySize: 256,
  });
  template.hasResourceProperties("AWS::Events::Rule", {
    ScheduleExpression: "rate(1 hour)",
  });
  template.resourceCountIs("AWS::CloudWatch::Alarm", 4);
  const policies = JSON.stringify(template.findResources("AWS::IAM::Policy"));
  expect(policies).toContain("lambda:DeleteProvisionedConcurrencyConfig");
  expect(policies).toContain("lambda:PutFunctionConcurrency");
  expect(policies).toContain("cloudfront:UpdateDistribution");
  expect(policies).not.toContain("lambda:DeleteFunction");
  expect(policies).not.toContain("dynamodb:");
  expect(policies).not.toContain("s3:");
  expect(policies).not.toContain('"Resource":"*"');
  const topicPolicy = JSON.stringify(
    template.findResources("AWS::SNS::TopicPolicy"),
  );
  expect(topicPolicy).toContain("budgets.amazonaws.com");
  expect(topicPolicy).toContain("aws:SourceAccount");
  expect(topicPolicy).toContain("aws:SourceArn");
});
