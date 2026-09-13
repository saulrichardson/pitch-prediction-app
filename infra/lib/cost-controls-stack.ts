import * as cdk from "aws-cdk-lib";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as actions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as destinations from "aws-cdk-lib/aws-lambda-destinations";
import * as nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as logs from "aws-cdk-lib/aws-logs";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subscriptions from "aws-cdk-lib/aws-sns-subscriptions";
import * as ssm from "aws-cdk-lib/aws-ssm";
import { Construct } from "constructs";
import path from "node:path";
import { costPolicy } from "./cost-policy";

export class CostControlsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    const distributionId = new cdk.CfnParameter(this, "DistributionId", {
      type: "String",
    });
    const alertEmail = new cdk.CfnParameter(this, "AlertEmail", {
      type: "String",
      noEcho: true,
    });
    const alerts = new sns.Topic(this, "Alerts", {
      topicName: "pitch-replay-operations-alerts",
    });
    alerts.addSubscription(
      new subscriptions.EmailSubscription(alertEmail.valueAsString),
    );
    const cutoff = new sns.Topic(this, "BudgetCutoff", {
      topicName: "pitch-replay-budget-cutoff",
    });
    cutoff.addToResourcePolicy(
      new iam.PolicyStatement({
        principals: [new iam.ServicePrincipal("budgets.amazonaws.com")],
        actions: ["sns:Publish"],
        resources: [cutoff.topicArn],
        conditions: {
          StringEquals: { "aws:SourceAccount": this.account },
          ArnLike: {
            "aws:SourceArn": `arn:${this.partition}:budgets::${this.account}:*`,
          },
        },
      }),
    );
    const state = new ssm.StringParameter(this, "State", {
      parameterName: costPolicy.stateParameter,
      stringValue: JSON.stringify({ status: "armed" }),
      description:
        "Retained monthly cost shutdown latch. Restore only after inspecting account costs.",
    });
    state.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);
    const guard = new nodejs.NodejsFunction(this, "Guard", {
      functionName: costPolicy.functionName,
      entry: path.resolve(import.meta.dirname, "../functions/cost-control.ts"),
      depsLockFilePath: path.resolve(
        import.meta.dirname,
        "../../package-lock.json",
      ),
      runtime: lambda.Runtime.NODEJS_24_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 256,
      timeout: cdk.Duration.minutes(2),
      reservedConcurrentExecutions: 1,
      bundling: { minify: true, externalModules: [] },
      logGroup: new logs.LogGroup(this, "Logs", {
        logGroupName: `/aws/lambda/${costPolicy.functionName}`,
        retention: logs.RetentionDays.ONE_WEEK,
        removalPolicy: cdk.RemovalPolicy.RETAIN,
      }),
      environment: {
        ACCOUNT_ID: this.account,
        DISTRIBUTION_ID: distributionId.valueAsString,
        ALERT_TOPIC_ARN: alerts.topicArn,
      },
      retryAttempts: 2,
      maxEventAge: cdk.Duration.hours(2),
      onFailure: new destinations.SnsDestination(alerts),
    });
    state.grantRead(guard);
    guard.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["ssm:PutParameter"],
        resources: [state.parameterArn],
      }),
    );
    guard.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["budgets:ViewBudget"],
        resources: [
          `arn:${this.partition}:budgets::${this.account}:budget/${costPolicy.monthlyBudgetName}`,
        ],
      }),
    );
    const functionArns = costPolicy.applicationFunctions.map(
      (name) =>
        `arn:${this.partition}:lambda:${this.region}:${this.account}:function:${name}`,
    );
    guard.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "lambda:ListProvisionedConcurrencyConfigs",
          "lambda:GetFunctionConcurrency",
          "lambda:PutFunctionConcurrency",
        ],
        resources: functionArns,
      }),
    );
    guard.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["lambda:DeleteProvisionedConcurrencyConfig"],
        resources: functionArns.flatMap((arn) => [arn, `${arn}:*`]),
      }),
    );
    guard.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "cloudfront:GetDistributionConfig",
          "cloudfront:UpdateDistribution",
        ],
        resources: [
          `arn:${this.partition}:cloudfront::${this.account}:distribution/${distributionId.valueAsString}`,
        ],
      }),
    );
    alerts.grantPublish(guard);
    cutoff.addSubscription(new subscriptions.LambdaSubscription(guard));
    new events.Rule(this, "HourlyCheck", {
      schedule: events.Schedule.rate(cdk.Duration.hours(1)),
      targets: [new targets.LambdaFunction(guard)],
      description:
        "Recheck delayed billing and enforce a latched stop even if a budget notification is missed.",
    });
    const alarmAction = new actions.SnsAction(alerts);
    const failureAlarm = new cloudwatch.Alarm(this, "GuardErrors", {
      alarmName: "pitch-replay-cost-control-failed",
      metric: guard.metricErrors({
        period: cdk.Duration.minutes(5),
        statistic: "Sum",
      }),
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    failureAlarm.addAlarmAction(alarmAction);
    const heartbeat = new cloudwatch.Alarm(this, "GuardHeartbeat", {
      alarmName: "pitch-replay-cost-control-not-running",
      metric: guard.metricInvocations({
        period: cdk.Duration.hours(1),
        statistic: "Sum",
      }),
      threshold: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
      evaluationPeriods: 3,
      treatMissingData: cloudwatch.TreatMissingData.BREACHING,
    });
    heartbeat.addAlarmAction(alarmAction);
    const deliveryFailure = new cloudwatch.Alarm(
      this,
      "CutoffDeliveryFailures",
      {
        alarmName: "pitch-replay-budget-notification-failed",
        metric: cutoff.metricNumberOfNotificationsFailed({
          period: cdk.Duration.minutes(5),
          statistic: "Sum",
        }),
        threshold: 1,
        evaluationPeriods: 1,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      },
    );
    deliveryFailure.addAlarmAction(alarmAction);
    const siteErrors = new cloudwatch.Alarm(this, "SiteErrors", {
      alarmName: "pitch-replay-public-api-errors",
      metric: new cloudwatch.Metric({
        namespace: "AWS/CloudFront",
        metricName: "5xxErrorRate",
        dimensionsMap: {
          DistributionId: distributionId.valueAsString,
          Region: "Global",
        },
        statistic: "Average",
        period: cdk.Duration.minutes(5),
      }),
      threshold: 5,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      alarmDescription:
        "CloudFront returned at least 5% server errors in two consecutive five-minute windows.",
    });
    siteErrors.addAlarmAction(alarmAction);
    new cdk.CfnOutput(this, "AlertTopicArn", { value: alerts.topicArn });
    new cdk.CfnOutput(this, "CutoffTopicArn", { value: cutoff.topicArn });
    new cdk.CfnOutput(this, "GuardFunctionName", { value: guard.functionName });
  }
}
