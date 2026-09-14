import type { Storage } from "@pitch/db";

export const callerPreparationLimits = {
  dailyGames: 4,
  monthlyGames: 20,
} as const;

type CallerPreparationRecord = {
  total: number;
  days: Record<string, string[]>;
};

export type CallerPreparationDecision =
  | { allowed: true; alreadyReserved: boolean }
  | { allowed: false; retryAt: string };

export async function reserveCallerPreparation(
  storage: Storage,
  callerId: string,
  gamePk: string,
  now = new Date(),
): Promise<CallerPreparationDecision> {
  if (!/^[a-f0-9]{64}$/.test(callerId))
    throw new Error("Preparation caller identity must be a SHA-256 digest.");

  const month = now.toISOString().slice(0, 7);
  const day = now.toISOString().slice(0, 10);
  const key = `preparation-caller:${month}:${callerId}`;

  for (let attempt = 0; attempt < 6; attempt++) {
    const record = await storage.read<CallerPreparationRecord>(key);
    const current = record?.value ?? { total: 0, days: {} };
    const games = current.days[day] ?? [];
    if (games.includes(gamePk)) return { allowed: true, alreadyReserved: true };

    const monthly = current.total >= callerPreparationLimits.monthlyGames;
    if (monthly || games.length >= callerPreparationLimits.dailyGames)
      return {
        allowed: false,
        retryAt: (monthly ? nextMonth(now) : nextDay(now)).toISOString(),
      };

    if (
      await storage.write(
        {
          key,
          revision: (record?.revision ?? -1) + 1,
          value: {
            total: current.total + 1,
            days: { ...current.days, [day]: [...games, gamePk] },
          },
          expiresAt: Math.floor(nextMonth(now).getTime() / 1000) + 86400,
        },
        record?.revision ?? null,
      )
    )
      return { allowed: true, alreadyReserved: false };
  }

  throw new Error(
    "Concurrent preparation requests prevented caller-budget reservation.",
  );
}

function nextDay(now: Date) {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  );
}

function nextMonth(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}
