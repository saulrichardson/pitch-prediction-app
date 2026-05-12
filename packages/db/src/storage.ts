import crypto from "node:crypto";
import { BatchWriteCommand, DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { asc, eq, sql } from "drizzle-orm";
import type {
  GameReplay,
  GameSummary,
  PitchEvent,
  PredictionRequest,
  PredictionResponse,
  Timeline
} from "@pitch/domain";
import { auditEvents, branchPitchEvents, games, manualSituations, pitchEvents, plateAppearances, players, predictionRuns, timelines } from "./schema";
import { getDynamoDbClient, getDynamoTableName, getReadyDb, getStorageMode } from "./client";

export interface Storage {
  saveReplay(replay: GameReplay, raw?: unknown): Promise<GameReplay>;
  getReplay(gamePk: string): Promise<GameReplay | null>;
  saveTimeline(timeline: Timeline): Promise<Timeline>;
  getTimeline(id: string, workspaceId: string): Promise<Timeline | null>;
  savePredictionRun(run: {
    timelineId: string;
    pitchMoment: number;
    request: PredictionRequest;
    response: PredictionResponse;
  }): Promise<void>;
  audit(event: { workspaceId?: string; timelineId?: string; action: string; payload: unknown }): Promise<void>;
}

const memory = {
  replays: new Map<string, GameReplay>(),
  timelines: new Map<string, Timeline>(),
  predictions: [] as unknown[],
  audit: [] as unknown[]
};

class MemoryStorage implements Storage {
  async saveReplay(replay: GameReplay): Promise<GameReplay> {
    memory.replays.set(replay.game.gamePk, replay);
    return replay;
  }

  async getReplay(gamePk: string): Promise<GameReplay | null> {
    return memory.replays.get(gamePk) ?? null;
  }

  async saveTimeline(timeline: Timeline): Promise<Timeline> {
    memory.timelines.set(timeline.id, timeline);
    return timeline;
  }

  async getTimeline(id: string, workspaceId: string): Promise<Timeline | null> {
    const timeline = memory.timelines.get(id);
    return timeline?.workspaceId === workspaceId ? timeline : null;
  }

  async savePredictionRun(run: { timelineId: string; pitchMoment: number; request: PredictionRequest; response: PredictionResponse }): Promise<void> {
    memory.predictions.push({ ...run, createdAt: new Date().toISOString() });
  }

  async audit(event: { workspaceId?: string; timelineId?: string; action: string; payload: unknown }): Promise<void> {
    memory.audit.push({ ...event, createdAt: new Date().toISOString() });
  }
}

class PostgresStorage implements Storage {
  async saveReplay(replay: GameReplay, raw?: unknown): Promise<GameReplay> {
    const db = await getReadyDb();
    if (!db) return new MemoryStorage().saveReplay(replay);
    await db
      .insert(games)
      .values({ ...gameValues(replay.game), raw: raw as never })
      .onConflictDoUpdate({
        target: games.gamePk,
        set: { ...gameValues(replay.game), raw: raw as never, updatedAt: new Date() }
      });
    const playerValues = playersFromReplay(replay);
    if (playerValues.length > 0) {
      await db
        .insert(players)
        .values(playerValues)
        .onConflictDoUpdate({
          target: players.playerId,
          set: { name: sql`excluded.name`, handedness: sql`excluded.handedness` }
        });
    }
    const paValues = plateAppearancesFromReplay(replay);
    if (paValues.length > 0) {
      await db
        .insert(plateAppearances)
        .values(paValues)
        .onConflictDoNothing();
    }
    if (replay.pitches.length > 0) {
      await db
        .insert(pitchEvents)
        .values(replay.pitches.map((pitch) => pitchEventValues(replay.game.gamePk, pitch)))
        .onConflictDoUpdate({
          target: pitchEvents.id,
          set: {
            pitchType: sql`excluded.pitch_type`,
            result: sql`excluded.result`,
            payload: sql`excluded.payload`
          }
        });
    }
    memory.replays.set(replay.game.gamePk, replay);
    return replay;
  }

  async getReplay(gamePk: string): Promise<GameReplay | null> {
    const cached = memory.replays.get(gamePk);
    if (cached) return cached;
    const db = await getReadyDb();
    if (!db) return null;
    const gameRows = await db.select().from(games).where(eq(games.gamePk, gamePk)).limit(1);
    const game = gameRows[0];
    if (!game) return null;
    const eventRows = await db.select().from(pitchEvents).where(eq(pitchEvents.gamePk, gamePk)).orderBy(asc(pitchEvents.gamePitchIndex));
    if (eventRows.length === 0) return null;
    const replay: GameReplay = {
      game: {
        gamePk: game.gamePk,
        label: game.label,
        officialDate: game.officialDate,
        awayTeam: game.awayTeam,
        homeTeam: game.homeTeam,
        awayScore: game.awayScore,
        homeScore: game.homeScore,
        status: game.status
      },
      pitches: eventRows.map((row) => row.payload as PitchEvent)
    };
    memory.replays.set(gamePk, replay);
    return replay;
  }

  async saveTimeline(timeline: Timeline): Promise<Timeline> {
    const db = await getReadyDb();
    if (!db) return new MemoryStorage().saveTimeline(timeline);
    await db
      .insert(timelines)
      .values({
        id: timeline.id,
        workspaceId: timeline.workspaceId,
        mode: timeline.mode,
        gamePk: timeline.game?.gamePk ?? null,
        payload: timeline as never
      })
      .onConflictDoUpdate({
        target: timelines.id,
        set: { payload: timeline as never, updatedAt: new Date() }
      });
    const branchValues = timeline.branches.flatMap((branch) =>
      branch.pitches.map((pitch) => ({
        id: pitch.id,
        timelineId: timeline.id,
        branchId: branch.id,
        payload: pitch as never
      }))
    );
    if (branchValues.length > 0) {
      await db
        .insert(branchPitchEvents)
        .values(branchValues)
        .onConflictDoUpdate({
          target: branchPitchEvents.id,
          set: { payload: sql`excluded.payload` }
        });
    }
    if (timeline.manualSituation) {
      await db
        .insert(manualSituations)
        .values({
          id: timeline.id,
          workspaceId: timeline.workspaceId,
          payload: timeline.manualSituation as never
        })
        .onConflictDoNothing();
    }
    memory.timelines.set(timeline.id, timeline);
    return timeline;
  }

  async getTimeline(id: string, workspaceId: string): Promise<Timeline | null> {
    const cached = memory.timelines.get(id);
    if (cached?.workspaceId === workspaceId) return cached;
    const db = await getReadyDb();
    if (!db) return null;
    const rows = await db.select().from(timelines).where(eq(timelines.id, id)).limit(1);
    const timeline = rows[0]?.payload as Timeline | undefined;
    if (!timeline || timeline.workspaceId !== workspaceId) return null;
    memory.timelines.set(id, timeline);
    return timeline;
  }

  async savePredictionRun(run: { timelineId: string; pitchMoment: number; request: PredictionRequest; response: PredictionResponse }): Promise<void> {
    const db = await getReadyDb();
    if (!db) return new MemoryStorage().savePredictionRun(run);
    await db
      .insert(predictionRuns)
      .values({
        id: run.response.id,
        timelineId: run.timelineId,
        pitchMoment: run.pitchMoment,
        modelVersion: run.response.modelVersion,
        request: run.request as never,
        response: run.response as never
      })
      .onConflictDoUpdate({
        target: predictionRuns.id,
        set: {
          request: sql`excluded.request`,
          response: sql`excluded.response`
        }
      });
    memory.predictions.push({ ...run, createdAt: new Date().toISOString() });
  }

  async audit(event: { workspaceId?: string; timelineId?: string; action: string; payload: unknown }): Promise<void> {
    memory.audit.push({ ...event, createdAt: new Date().toISOString() });
    const db = await getReadyDb();
    if (!db) return;
    await db.insert(auditEvents).values({
      id: crypto.randomUUID(),
      workspaceId: event.workspaceId ?? null,
      timelineId: event.timelineId ?? null,
      action: event.action,
      payload: event.payload as never
    });
  }
}

let storage: Storage | null = null;
let dynamoDocumentClient: DynamoDBDocumentClient | null = null;

export function getStorage(): Storage {
  if (!storage) {
    const mode = getStorageMode();
    if (mode === "postgres") storage = new PostgresStorage();
    else if (mode === "dynamodb") storage = new DynamoDbStorage();
    else storage = new MemoryStorage();
  }
  return storage;
}

class DynamoDbStorage implements Storage {
  async saveReplay(replay: GameReplay): Promise<GameReplay> {
    const { client, tableName } = dynamoRuntime();
    const pk = gamePk(replay.game.gamePk);
    await client.send(new PutCommand({
      TableName: tableName,
      Item: {
        pk,
        sk: "META",
        entityType: "game",
        gamePk: replay.game.gamePk,
        payload: replay.game,
        expiresAt: ttlFromNow(30)
      }
    }));

    for (const batch of chunks(replay.pitches, 25)) {
      await batchWriteAll(client, tableName, batch.map((pitch) => ({
        PutRequest: {
          Item: {
            pk,
            sk: pitchSk(pitch.gamePitchIndex),
            entityType: "pitch",
            gamePk: replay.game.gamePk,
            paId: pitch.paId,
            payload: pitch,
            expiresAt: ttlFromNow(30)
          }
        }
      })));
    }

    memory.replays.set(replay.game.gamePk, replay);
    return replay;
  }

  async getReplay(gamePkValue: string): Promise<GameReplay | null> {
    const cached = memory.replays.get(gamePkValue);
    if (cached) return cached;

    const { client, tableName } = dynamoRuntime();
    const pk = gamePk(gamePkValue);
    const meta = await client.send(new GetCommand({
      TableName: tableName,
      Key: { pk, sk: "META" }
    }));
    const game = meta.Item?.payload as GameSummary | undefined;
    if (!game) return null;

    const pitches: PitchEvent[] = [];
    let exclusiveStartKey: Record<string, unknown> | undefined;
    do {
      const page = await client.send(new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "#pk = :pk AND begins_with(#sk, :pitchPrefix)",
        ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
        ExpressionAttributeValues: { ":pk": pk, ":pitchPrefix": "PITCH#" },
        ExclusiveStartKey: exclusiveStartKey
      }));
      pitches.push(...(page.Items ?? []).map((item) => item.payload as PitchEvent));
      exclusiveStartKey = page.LastEvaluatedKey as Record<string, unknown> | undefined;
    } while (exclusiveStartKey);

    if (pitches.length === 0) return null;
    pitches.sort((left, right) => left.gamePitchIndex - right.gamePitchIndex);
    const replay = { game, pitches };
    memory.replays.set(gamePkValue, replay);
    return replay;
  }

  async saveTimeline(timeline: Timeline): Promise<Timeline> {
    const { client, tableName } = dynamoRuntime();
    await client.send(new PutCommand({
      TableName: tableName,
      Item: {
        pk: timelinePk(timeline.id),
        sk: "METADATA",
        entityType: "timeline",
        timelineId: timeline.id,
        workspaceId: timeline.workspaceId,
        gamePk: timeline.game?.gamePk ?? null,
        payload: compactTimeline(timeline),
        expiresAt: ttlFromNow(7)
      }
    }));
    memory.timelines.set(timeline.id, timeline);
    return timeline;
  }

  async getTimeline(id: string, workspaceId: string): Promise<Timeline | null> {
    const cached = memory.timelines.get(id);
    if (cached?.workspaceId === workspaceId) return cached;

    const { client, tableName } = dynamoRuntime();
    const row = await client.send(new GetCommand({
      TableName: tableName,
      Key: { pk: timelinePk(id), sk: "METADATA" }
    }));
    const compact = row.Item?.payload as Timeline | undefined;
    if (!compact || compact.workspaceId !== workspaceId) return null;
    const timeline = await this.hydrateTimeline(compact);
    memory.timelines.set(id, timeline);
    return timeline;
  }

  async savePredictionRun(run: { timelineId: string; pitchMoment: number; request: PredictionRequest; response: PredictionResponse }): Promise<void> {
    const { client, tableName } = dynamoRuntime();
    await client.send(new PutCommand({
      TableName: tableName,
      Item: {
        pk: timelinePk(run.timelineId),
        sk: `PREDICTION#${String(run.pitchMoment).padStart(5, "0")}#${run.response.id}`,
        entityType: "prediction",
        timelineId: run.timelineId,
        pitchMoment: run.pitchMoment,
        modelVersion: run.response.modelVersion,
        request: run.request,
        response: run.response,
        expiresAt: ttlFromNow(14),
        createdAt: new Date().toISOString()
      }
    }));
    memory.predictions.push({ ...run, createdAt: new Date().toISOString() });
  }

  async audit(event: { workspaceId?: string; timelineId?: string; action: string; payload: unknown }): Promise<void> {
    const createdAt = new Date().toISOString();
    memory.audit.push({ ...event, createdAt });
    const { client, tableName } = dynamoRuntime();
    await client.send(new PutCommand({
      TableName: tableName,
      Item: {
        pk: auditPk(event.workspaceId),
        sk: `${createdAt}#${crypto.randomUUID()}`,
        entityType: "audit",
        workspaceId: event.workspaceId ?? null,
        timelineId: event.timelineId ?? null,
        action: event.action,
        payload: event.payload,
        expiresAt: ttlFromNow(14),
        createdAt
      }
    }));
  }

  private async hydrateTimeline(timeline: Timeline): Promise<Timeline> {
    if (timeline.actualPitches.length > 0 || !timeline.game?.gamePk) return timeline;
    const replay = await this.getReplay(timeline.game.gamePk);
    if (!replay) {
      throw new Error(`Cached replay ${timeline.game.gamePk} was not found for timeline ${timeline.id}.`);
    }
    return { ...timeline, actualPitches: replay.pitches };
  }
}

function dynamoRuntime() {
  const baseClient = getDynamoDbClient();
  const tableName = getDynamoTableName();
  if (!baseClient || !tableName) {
    throw new Error("DynamoDB storage is not configured.");
  }
  dynamoDocumentClient ??= DynamoDBDocumentClient.from(baseClient, {
    marshallOptions: { removeUndefinedValues: true }
  });
  return { client: dynamoDocumentClient, tableName };
}

function compactTimeline(timeline: Timeline): Timeline {
  if (!timeline.game?.gamePk) return timeline;
  return { ...timeline, actualPitches: [] };
}

function gamePk(gamePkValue: string) {
  return `GAME#${gamePkValue}`;
}

function timelinePk(timelineId: string) {
  return `TIMELINE#${timelineId}`;
}

function auditPk(workspaceId?: string) {
  return `AUDIT#${workspaceId ?? "global"}`;
}

function pitchSk(gamePitchIndex: number) {
  return `PITCH#${String(gamePitchIndex).padStart(6, "0")}`;
}

function ttlFromNow(days: number) {
  return Math.floor(Date.now() / 1000) + days * 24 * 60 * 60;
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

async function batchWriteAll(client: DynamoDBDocumentClient, tableName: string, requests: Array<Record<string, unknown>>) {
  let pending = requests;
  for (let attempt = 0; pending.length > 0 && attempt < 5; attempt += 1) {
    const response = await client.send(new BatchWriteCommand({
      RequestItems: { [tableName]: pending as never }
    }));
    pending = (response.UnprocessedItems?.[tableName] ?? []) as Array<Record<string, unknown>>;
    if (pending.length > 0) {
      await new Promise((resolve) => setTimeout(resolve, 50 * 2 ** attempt));
    }
  }
  if (pending.length > 0) {
    throw new Error(`DynamoDB did not process ${pending.length} replay pitch writes after retries.`);
  }
}

function gameValues(game: GameSummary) {
  return {
    gamePk: game.gamePk,
    label: game.label,
    officialDate: game.officialDate,
    awayTeam: game.awayTeam,
    homeTeam: game.homeTeam,
    awayScore: game.awayScore,
    homeScore: game.homeScore,
    status: game.status
  };
}

function playersFromReplay(replay: GameReplay) {
  const rows = new Map<string, { playerId: string; name: string; handedness: string | null }>();
  for (const pitch of replay.pitches) {
    rows.set(pitch.matchup.pitcherId, {
      playerId: pitch.matchup.pitcherId,
      name: pitch.matchup.pitcherName,
      handedness: pitch.matchup.pitcherHand
    });
    rows.set(pitch.matchup.batterId, {
      playerId: pitch.matchup.batterId,
      name: pitch.matchup.batterName,
      handedness: pitch.matchup.batterSide
    });
  }
  return Array.from(rows.values());
}

function plateAppearancesFromReplay(replay: GameReplay) {
  const rows = new Map<string, {
    id: string;
    gamePk: string;
    inning: number;
    half: string;
    pitcherId: string;
    batterId: string;
    raw: null;
  }>();
  for (const pitch of replay.pitches) {
    rows.set(pitch.paId, {
      id: pitch.paId,
      gamePk: replay.game.gamePk,
      inning: pitch.preState.inning,
      half: pitch.preState.half,
      pitcherId: pitch.matchup.pitcherId,
      batterId: pitch.matchup.batterId,
      raw: null
    });
  }
  return Array.from(rows.values());
}

function pitchEventValues(gamePk: string, pitch: PitchEvent) {
  return {
    id: pitch.id,
    gamePk,
    paId: pitch.paId,
    gamePitchIndex: pitch.gamePitchIndex,
    source: pitch.source,
    pitchType: pitch.pitchType,
    result: pitch.result,
    payload: pitch as never
  };
}
