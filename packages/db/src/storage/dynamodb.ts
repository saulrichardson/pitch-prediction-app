import crypto from "node:crypto";
import { BatchWriteCommand, DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import type {
  GameReplay,
  GameSummary,
  PitchEvent,
  PredictionRequest,
  PredictionResponse,
  Timeline,
  TimelineStartJob
} from "@pitch/domain";
import { getDynamoDbClient, getDynamoTableName } from "../client";
import { memory } from "./memory";
import type { Storage } from "./types";

let dynamoDocumentClient: DynamoDBDocumentClient | null = null;

export class DynamoDbStorage implements Storage {
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
        gamePk: timeline.game.gamePk,
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

  async saveTimelineStartJob(job: TimelineStartJob): Promise<TimelineStartJob> {
    const { client, tableName } = dynamoRuntime();
    await client.send(new PutCommand({
      TableName: tableName,
      Item: {
        pk: timelineStartJobPk(job.id),
        sk: "METADATA",
        entityType: "timeline_start_job",
        jobId: job.id,
        workspaceId: job.workspaceId,
        gamePk: job.gamePk,
        status: job.status,
        timelineId: job.timelineId,
        payload: job,
        expiresAt: ttlFromNow(2)
      }
    }));
    memory.timelineStartJobs.set(job.id, job);
    return job;
  }

  async getTimelineStartJob(id: string, workspaceId?: string): Promise<TimelineStartJob | null> {
    const cached = memory.timelineStartJobs.get(id);
    if (cached && (!workspaceId || cached.workspaceId === workspaceId)) return cached;

    const { client, tableName } = dynamoRuntime();
    const row = await client.send(new GetCommand({
      TableName: tableName,
      Key: { pk: timelineStartJobPk(id), sk: "METADATA" }
    }));
    const job = row.Item?.payload as TimelineStartJob | undefined;
    if (!job || (workspaceId && job.workspaceId !== workspaceId)) return null;
    memory.timelineStartJobs.set(id, job);
    return job;
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
    if (timeline.actualPitches.length > 0) return timeline;
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
  return { ...timeline, actualPitches: [] };
}

function gamePk(gamePkValue: string) {
  return `GAME#${gamePkValue}`;
}

function timelinePk(timelineId: string) {
  return `TIMELINE#${timelineId}`;
}

function timelineStartJobPk(jobId: string) {
  return `TIMELINE_START_JOB#${jobId}`;
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
