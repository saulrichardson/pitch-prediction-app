import { BudgetsClient, DescribeBudgetCommand } from "@aws-sdk/client-budgets";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import {
  costPolicy,
  parseCostState,
  validateSpend,
} from "../infra/lib/cost-policy";

// Fail closed before builds, stack updates, or restoring any compute capacity.
const accountId = process.env.COST_ACCOUNT_ID;
if (!accountId) throw new Error("COST_ACCOUNT_ID is required.");
const ssm = new SSMClient({});
const budgets = new BudgetsClient({ region: "us-east-1" });
const parameter = await ssm.send(
  new GetParameterCommand({ Name: costPolicy.stateParameter }),
);
const state = parseCostState(parameter.Parameter?.Value ?? "");
if (state.status === "tripped")
  throw new Error(
    "Deployment blocked: the monthly cost stop is latched. Follow docs/records/2026-09-13-warm-web-cost-controls.md before restoring service.",
  );
const { Budget: budget } = await budgets.send(
  new DescribeBudgetCommand({
    AccountId: accountId,
    BudgetName: costPolicy.monthlyBudgetName,
  }),
);
if (
  budget?.TimeUnit !== "MONTHLY" ||
  budget.BudgetType !== "COST" ||
  Object.keys(budget.CostFilters ?? {}).length ||
  budget.FilterExpression ||
  Number(budget.BudgetLimit?.Amount) !== costPolicy.monthlyLimitUsd ||
  budget.BudgetLimit?.Unit !== "USD"
)
  throw new Error(
    "Deployment requires the account-wide $50 monthly cost budget. Run scripts/configure-cost-budgets.ts.",
  );
const actual = validateSpend(
  budget.CalculatedSpend?.ActualSpend?.Amount,
  budget.CalculatedSpend?.ActualSpend?.Unit,
);
if (actual >= costPolicy.monthlyLimitUsd)
  throw new Error(
    `Deployment blocked: monthly spend is $${actual.toFixed(2)}.`,
  );
console.log(
  `Cost controls armed: $${actual.toFixed(2)} reported against the $50 monthly limit.`,
);
