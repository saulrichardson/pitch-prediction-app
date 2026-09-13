import { BudgetsClient, DescribeBudgetCommand } from "@aws-sdk/client-budgets";
import {
  CloudFrontClient,
  GetDistributionConfigCommand,
  UpdateDistributionCommand,
} from "@aws-sdk/client-cloudfront";
import {
  LambdaClient,
  ListProvisionedConcurrencyConfigsCommand,
  DeleteProvisionedConcurrencyConfigCommand,
  GetFunctionConcurrencyCommand,
  PutFunctionConcurrencyCommand,
} from "@aws-sdk/client-lambda";
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
import {
  SSMClient,
  GetParameterCommand,
  PutParameterCommand,
} from "@aws-sdk/client-ssm";
import { setTimeout as delay } from "node:timers/promises";
import {
  costPolicy,
  enforceCostLimit,
  parseCostState,
  validateSpend,
} from "../lib/cost-policy";

const budgets = new BudgetsClient({ region: "us-east-1" });
const lambda = new LambdaClient({});
const cloudfront = new CloudFrontClient({});
const ssm = new SSMClient({});
const sns = new SNSClient({});

export async function stopLambda(client: LambdaClient, name: string) {
  let marker: string | undefined;
  do {
    const page = await client.send(
      new ListProvisionedConcurrencyConfigsCommand({
        FunctionName: name,
        Marker: marker,
      }),
    );
    for (const config of page.ProvisionedConcurrencyConfigs ?? []) {
      const qualifier = config.FunctionArn?.split(":").at(-1);
      if (!qualifier || qualifier === name)
        throw new Error(`Missing provisioned qualifier for ${name}`);
      await client.send(
        new DeleteProvisionedConcurrencyConfigCommand({
          FunctionName: name,
          Qualifier: qualifier,
        }),
      );
    }
    marker = page.NextMarker;
  } while (marker);

  const concurrency = await client.send(
    new GetFunctionConcurrencyCommand({ FunctionName: name }),
  );
  if (concurrency.ReservedConcurrentExecutions === 0) return;
  // AWS can briefly report the deleted provisioned allocation as still in use.
  for (let attempt = 0; ; attempt++) {
    try {
      await client.send(
        new PutFunctionConcurrencyCommand({
          FunctionName: name,
          ReservedConcurrentExecutions: 0,
        }),
      );
      return;
    } catch (error) {
      if (
        !(error instanceof Error) ||
        error.name !== "InvalidParameterValueException" ||
        !/provisioned/i.test(error.message) ||
        attempt >= 4
      )
        throw error;
      await delay(2_000 * 2 ** attempt);
    }
  }
}

export async function stopDistribution(client: CloudFrontClient, id: string) {
  const current = await client.send(
    new GetDistributionConfigCommand({ Id: id }),
  );
  if (!current.DistributionConfig || !current.ETag)
    throw new Error("CloudFront configuration is missing.");
  if (!current.DistributionConfig.Enabled) return;
  await client.send(
    new UpdateDistributionCommand({
      Id: id,
      IfMatch: current.ETag,
      DistributionConfig: { ...current.DistributionConfig, Enabled: false },
    }),
  );
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

export async function handler(event: { dryRun?: boolean } = {}) {
  // Re-read AWS billing; SNS test messages and message text cannot trigger a stop.
  const result = await enforceCostLimit(
    {
      async readState() {
        const response = await ssm.send(
          new GetParameterCommand({ Name: costPolicy.stateParameter }),
        );
        return parseCostState(response.Parameter?.Value ?? "");
      },
      async readActualSpend() {
        const response = await budgets.send(
          new DescribeBudgetCommand({
            AccountId: required("ACCOUNT_ID"),
            BudgetName: costPolicy.monthlyBudgetName,
          }),
        );
        const budget = response.Budget;
        if (
          budget?.TimeUnit !== "MONTHLY" ||
          budget.BudgetType !== "COST" ||
          Object.keys(budget.CostFilters ?? {}).length ||
          budget.FilterExpression
        )
          throw new Error(
            "The cost guard requires the account-wide monthly cost budget.",
          );
        return validateSpend(
          budget.CalculatedSpend?.ActualSpend?.Amount,
          budget.CalculatedSpend?.ActualSpend?.Unit,
        );
      },
      async saveState(state) {
        await ssm.send(
          new PutParameterCommand({
            Name: costPolicy.stateParameter,
            Type: "String",
            Overwrite: true,
            Value: JSON.stringify(state),
          }),
        );
      },
      stopFunction: (name) => stopLambda(lambda, name),
      stopPublicTraffic: () =>
        stopDistribution(cloudfront, required("DISTRIBUTION_ID")),
      async notifyShutdown(state) {
        await sns.send(
          new PublishCommand({
            TopicArn: required("ALERT_TOPIC_ARN"),
            Subject: "Pitch Replay paused: monthly cost limit reached",
            Message: `AWS reported $${state.actualUsd.toFixed(2)} in monthly account costs. The $50 cost guard removed provisioned concurrency and set all three app functions to zero concurrency. CloudFront is disabling public traffic. Data, images and model snapshots are retained and can still incur storage charges. Billing is delayed, so costs can exceed the threshold. The stop is latched across month rollover; inspect costs and explicitly restore service using the repository runbook.`,
          }),
        );
      },
      now: () => new Date().toISOString(),
    },
    event.dryRun === true,
  );
  console.log(JSON.stringify({ event: "cost-control-check", ...result }));
  return result;
}
