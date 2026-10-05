import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";
import { getDynamoDbClient, getDynamoTableName } from "../client";
import type { Storage, StoredRecord } from "./types";

type DocumentClient = Pick<DynamoDBDocumentClient, "send">;
export class DynamoDbStorage implements Storage {
  private readonly client: DocumentClient;
  private readonly tableName: string;
  private nextReadAt = 0;
  private nextWriteAt = 0;

  /** Leave headroom below the table's 25 read / 10 write unit spending caps. */
  private async reserveCapacity(kind: "read" | "write", units: number) {
    const field = kind === "read" ? "nextReadAt" : "nextWriteAt";
    const time = Date.now();
    const start = Math.max(time, this[field]);
    this[field] = start + units * (kind === "read" ? 50 : 150);
    if (start > time)
      await new Promise((resolve) => setTimeout(resolve, start - time));
  }
  constructor(
    client?: DocumentClient,
    tableName?: string,
    private readonly now = () => Date.now(),
  ) {
    const base = client ? null : getDynamoDbClient();
    const table = tableName ?? getDynamoTableName();
    if ((!client && !base) || !table)
      throw new Error("DynamoDB storage is not configured.");
    this.client =
      client ??
      DynamoDBDocumentClient.from(base!, {
        marshallOptions: { removeUndefinedValues: true },
      });
    this.tableName = table;
  }
  async read<T>(key: string): Promise<StoredRecord<T> | null> {
    await this.reserveCapacity("read", 1);
    const { Item } = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { pk: `REPLAY#${key}`, sk: "RECORD" },
        ConsistentRead: true,
      }),
    );
    if (
      !Item ||
      (Item.expiresAt !== undefined && Item.expiresAt <= this.now() / 1000)
    )
      return null;
    return {
      key,
      revision: Item.revision,
      value: Item.value,
      ...(Item.expiresAt === undefined ? {} : { expiresAt: Item.expiresAt }),
    };
  }
  async write<T>(
    record: StoredRecord<T>,
    expectedRevision: number | null,
  ): Promise<boolean> {
    const item = { pk: `REPLAY#${record.key}`, sk: "RECORD", ...record };
    const units = Math.ceil(
      (Buffer.byteLength(JSON.stringify(item)) + 64) / 1024,
    );
    await this.reserveCapacity("write", units);
    try {
      await this.client.send(
        new PutCommand({
          TableName: this.tableName,
          Item: item,
          ConditionExpression:
            expectedRevision === null
              ? "attribute_not_exists(pk) OR expiresAt <= :now"
              : "revision = :revision AND (attribute_not_exists(expiresAt) OR expiresAt > :now)",
          ExpressionAttributeValues: {
            ":now": Math.floor(this.now() / 1000),
            ...(expectedRevision === null
              ? {}
              : { ":revision": expectedRevision }),
          },
        }),
      );
      return true;
    } catch (error) {
      if (
        error instanceof Error &&
        error.name === "ConditionalCheckFailedException"
      )
        return false;
      throw error;
    }
  }
}
