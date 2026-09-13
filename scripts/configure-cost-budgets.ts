import {
  BudgetsClient,
  DescribeBudgetCommand,
  UpdateBudgetCommand,
  DescribeNotificationsForBudgetCommand,
  DescribeSubscribersForNotificationCommand,
  CreateNotificationCommand,
  DeleteNotificationCommand,
  type Notification,
  type Subscriber,
} from "@aws-sdk/client-budgets";
import { costPolicy } from "../infra/lib/cost-policy";

const accountId = process.env.COST_ACCOUNT_ID;
const cutoffTopicArn = process.env.COST_CUTOFF_TOPIC_ARN;
if (
  !accountId ||
  !cutoffTopicArn?.startsWith(`arn:aws:sns:us-east-1:${accountId}:`)
)
  throw new Error(
    "Set COST_ACCOUNT_ID and the deployed COST_CUTOFF_TOPIC_ARN.",
  );
const client = new BudgetsClient({ region: "us-east-1" });
const actual = (amount: number): Notification => ({
  NotificationType: "ACTUAL",
  ComparisonOperator: "GREATER_THAN",
  Threshold: amount,
  ThresholdType: "ABSOLUTE_VALUE",
});
const monthly: Notification[] = [
  ...costPolicy.monthlyWarningsUsd.map(actual),
  actual(costPolicy.monthlyLimitUsd),
  {
    NotificationType: "FORECASTED",
    ComparisonOperator: "GREATER_THAN",
    Threshold: costPolicy.monthlyLimitUsd,
    ThresholdType: "ABSOLUTE_VALUE",
  },
];
const key = (n: Notification) =>
  JSON.stringify([
    n.NotificationType,
    n.ComparisonOperator,
    n.Threshold,
    n.ThresholdType ?? "PERCENTAGE",
  ]);

for (const [name, amount, desired] of [
  [costPolicy.monthlyBudgetName, costPolicy.monthlyLimitUsd, monthly],
  [
    costPolicy.dailyBudgetName,
    costPolicy.dailyLimitUsd,
    [actual(costPolicy.dailyLimitUsd)],
  ],
] as const) {
  const { Budget: budget } = await client.send(
    new DescribeBudgetCommand({ AccountId: accountId, BudgetName: name }),
  );
  if (
    !budget ||
    budget.BudgetType !== "COST" ||
    Object.keys(budget.CostFilters ?? {}).length ||
    budget.FilterExpression
  )
    throw new Error(`Expected existing account-wide cost budget: ${name}`);
  const { Notifications: current = [] } = await client.send(
    new DescribeNotificationsForBudgetCommand({
      AccountId: accountId,
      BudgetName: name,
      MaxResults: 100,
    }),
  );
  const existing = await Promise.all(
    current.map(async (notification) => ({
      notification,
      subscribers:
        (
          await client.send(
            new DescribeSubscribersForNotificationCommand({
              AccountId: accountId,
              BudgetName: name,
              Notification: notification,
              MaxResults: 100,
            }),
          )
        ).Subscribers ?? [],
    })),
  );
  const emails: Subscriber[] = [
    ...new Set(
      existing.flatMap((n) =>
        n.subscribers
          .filter((s) => s.SubscriptionType === "EMAIL")
          .map((s) => s.Address!),
      ),
    ),
  ].map((Address) => ({ SubscriptionType: "EMAIL", Address }));
  if (!emails.length)
    throw new Error(
      `No existing email recipient found for ${name}; refusing to remove alerts.`,
    );
  if (
    existing.some((n) =>
      n.subscribers.some(
        (s) => s.SubscriptionType === "SNS" && s.Address !== cutoffTopicArn,
      ),
    )
  )
    throw new Error(
      `Unexpected existing SNS subscriber on ${name}; inspect before replacing notifications.`,
    );

  await client.send(
    new UpdateBudgetCommand({
      AccountId: accountId,
      NewBudget: {
        BudgetName: name,
        BudgetLimit: { Amount: String(amount), Unit: "USD" },
        BudgetType: budget.BudgetType,
        TimeUnit: budget.TimeUnit,
        CostTypes: budget.CostTypes,
        TimePeriod: budget.TimePeriod,
      },
    }),
  );
  // Install replacements before removing old warnings. AWS permits ten alerts;
  // the initial monthly migration has six old plus four new notifications.
  for (const notification of desired) {
    const subscribers = [
      ...emails,
      ...(name === costPolicy.monthlyBudgetName &&
      notification.NotificationType === "ACTUAL" &&
      notification.Threshold === costPolicy.monthlyLimitUsd
        ? [{ SubscriptionType: "SNS" as const, Address: cutoffTopicArn }]
        : []),
    ];
    const match = existing.find(
      (n) => key(n.notification) === key(notification),
    );
    if (match) {
      if (
        JSON.stringify(
          match.subscribers
            .map((s) => `${s.SubscriptionType}:${s.Address}`)
            .sort(),
        ) !==
        JSON.stringify(
          subscribers.map((s) => `${s.SubscriptionType}:${s.Address}`).sort(),
        )
      )
        throw new Error(
          `Subscriber drift on ${name}; inspect before updating.`,
        );
      continue;
    }
    await client.send(
      new CreateNotificationCommand({
        AccountId: accountId,
        BudgetName: name,
        Notification: notification,
        Subscribers: subscribers,
      }),
    );
  }
  for (const { notification } of existing) {
    if (!desired.some((n) => key(n) === key(notification)))
      await client.send(
        new DeleteNotificationCommand({
          AccountId: accountId,
          BudgetName: name,
          Notification: notification,
        }),
      );
  }
  console.log(
    `${name}: $${amount}, ${desired.length} alerts, existing email recipients preserved.`,
  );
}
