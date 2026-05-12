import { z } from "zod";
import { emptyBases } from "@pitch/domain";
import { createManual } from "@/lib/timeline-service";
import { badRequest, ok, readJson, serverError } from "@/lib/http";
import { withSession } from "@/lib/route-params";
import { lookupMlbPlayer } from "@/lib/mlb-service";
import { toClientTimeline } from "@/lib/timeline-dto";

const manualSchema = z.object({
  pitcherName: z.string().min(1).default("Kodai Senga"),
  batterName: z.string().min(1).default("Ketel Marte"),
  balls: z.number().int().min(0).max(3).default(0),
  strikes: z.number().int().min(0).max(2).default(0),
  outs: z.number().int().min(0).max(2).default(0),
  inning: z.number().int().min(1).default(1),
  awayScore: z.number().int().default(0),
  homeScore: z.number().int().default(0),
  firstBase: z.boolean().default(false),
  secondBase: z.boolean().default(false),
  thirdBase: z.boolean().default(false)
});

export async function POST(request: Request) {
  try {
    const session = await withSession();
    const parsed = manualSchema.safeParse(await readJson(request, { optional: true }));
    if (!parsed.success) return badRequest("Manual situation fields are invalid.");
    const data = parsed.data;
    const [pitcher, batter] = await Promise.all([
      lookupMlbPlayer(data.pitcherName, "pitcher"),
      lookupMlbPlayer(data.batterName, "batter")
    ]);
    const timeline = await createManual(session.workspaceId, {
        gameDate: new Date().toISOString().slice(0, 10),
        pitchHistory: [],
        matchup: {
          pitcherId: pitcher.id,
          pitcherName: pitcher.name,
          pitcherHand: pitcher.hand,
          batterId: batter.id,
          batterName: batter.name,
          batterSide: batter.hand
        },
        state: {
          inning: data.inning,
          half: "top",
          count: { balls: data.balls as 0 | 1 | 2 | 3, strikes: data.strikes as 0 | 1 | 2 },
          outs: data.outs as 0 | 1 | 2,
          bases: {
            ...emptyBases,
            first: data.firstBase,
            second: data.secondBase,
            third: data.thirdBase
          },
          awayScore: data.awayScore,
          homeScore: data.homeScore
        }
      });
    return ok({ timeline: toClientTimeline(timeline) });
  } catch (error) {
    return serverError(error);
  }
}
