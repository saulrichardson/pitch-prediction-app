// Account-wide spend is conservative: this app stops even if another service
// caused the overage. Only this app's resources can be changed by the guard.
export const costPolicy = {
  monthlyBudgetName: "My Monthly Cost Budget",
  monthlyLimitUsd: 50,
  monthlyWarningsUsd: [25, 40],
  dailyBudgetName: "Daily Cost Spike Budget",
  dailyLimitUsd: 2,
  stateParameter: "/pitch-replay/cost-control",
  functionName: "pitch-replay-cost-control",
  applicationFunctions: [
    "pitch-sequence-serverless-web",
    "pitch-sequence-game-preparation",
    "pitch-sequence-serverless-model-lambda",
  ],
} as const;

export type CostState =
  | { status: "armed" }
  | {
      status: "tripped";
      trippedAt: string;
      actualUsd: number;
      notifiedAt?: string;
    };

export function parseCostState(raw: string): CostState {
  const value = JSON.parse(raw);
  if (value?.status === "armed") return { status: "armed" };
  if (
    value?.status === "tripped" &&
    typeof value.trippedAt === "string" &&
    Number.isFinite(Date.parse(value.trippedAt)) &&
    typeof value.actualUsd === "number" &&
    Number.isFinite(value.actualUsd) &&
    value.actualUsd >= 0 &&
    (value.notifiedAt === undefined ||
      (typeof value.notifiedAt === "string" &&
        Number.isFinite(Date.parse(value.notifiedAt))))
  )
    return value as CostState;
  throw new Error(
    "Invalid cost-control state; inspect the retained parameter before deployment.",
  );
}

export function validateSpend(
  amount: string | undefined,
  unit: string | undefined,
): number {
  const value = amount?.trim() ? Number(amount) : NaN;
  if (unit !== "USD" || !Number.isFinite(value) || value < 0)
    throw new Error("AWS Budgets did not return a valid actual USD spend.");
  return value;
}

export interface CostControlPorts {
  readState(): Promise<CostState>;
  readActualSpend(): Promise<number>;
  saveState(state: CostState): Promise<void>;
  stopFunction(name: string): Promise<void>;
  stopPublicTraffic(): Promise<void>;
  notifyShutdown(
    state: Extract<CostState, { status: "tripped" }>,
  ): Promise<void>;
  now(): string;
}

export async function enforceCostLimit(
  ports: CostControlPorts,
  dryRun = false,
) {
  const previous = await ports.readState();
  // A latched stop survives month rollover and billing API outages.
  const actualUsd =
    previous.status === "tripped"
      ? previous.actualUsd
      : await ports.readActualSpend();
  if (!Number.isFinite(actualUsd) || actualUsd < 0)
    throw new Error("Invalid actual spend; no shutdown decision was made.");
  const shouldStop =
    previous.status === "tripped" || actualUsd >= costPolicy.monthlyLimitUsd;
  if (dryRun || !shouldStop)
    return { dryRun, shouldStop, actualUsd, state: previous.status };

  const state: Extract<CostState, { status: "tripped" }> =
    previous.status === "tripped"
      ? previous
      : { status: "tripped", actualUsd, trippedAt: ports.now() };
  if (previous.status === "armed") await ports.saveState(state);

  // Attempt every independent stop even if one API is temporarily unavailable.
  // SNS/Lambda retries and the hourly rule repeat these idempotent operations.
  const results = await Promise.allSettled([
    ...costPolicy.applicationFunctions.map((name) => ports.stopFunction(name)),
    ports.stopPublicTraffic(),
  ]);
  const failures = results.filter((r) => r.status === "rejected");
  if (failures.length)
    throw new AggregateError(
      failures.map((r) => r.reason),
      "Cost shutdown is incomplete; retry required.",
    );
  if (!state.notifiedAt) {
    await ports.notifyShutdown(state);
    await ports.saveState({ ...state, notifiedAt: ports.now() });
  }
  return { dryRun: false, shouldStop: true, actualUsd, state: "tripped" };
}
