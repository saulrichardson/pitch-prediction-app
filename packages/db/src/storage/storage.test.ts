import { describe, expect, it, vi } from "vitest";
import { MemoryStorage } from "./memory";
import { DynamoDbStorage } from "./dynamodb";
import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";

describe("storage contract", () => {
  it("isolates values and expires sessions before physical deletion", async () => {
    let now = 1000;
    const db = new MemoryStorage(new Map(), () => now);
    const value = { step: 0 };
    await db.write({ key: "session", revision: 0, value, expiresAt: 2 }, null);
    value.step = 9;
    expect((await db.read<{ step: number }>("session"))?.value.step).toBe(0);
    expect(await db.write({ key: "session", revision: 1, value }, null)).toBe(
      false,
    );
    now = 3000;
    expect(await db.read("session")).toBeNull();
    expect(await db.write({ key: "session", revision: 0, value }, null)).toBe(
      true,
    );
  });
  it("reads authoritative DynamoDB state across independent instances and conditionally writes", async () => {
    const records = new Map<string, Record<string, unknown>>();
    const send = vi.fn(async (command: GetCommand | PutCommand) => {
      if (command instanceof GetCommand) {
        expect(command.input.ConsistentRead).toBe(true);
        return { Item: records.get(String(command.input.Key?.pk)) };
      }
      const input = command.input;
      const key = String(input.Item?.pk);
      const current = records.get(key);
      const expected = input.ExpressionAttributeValues?.[":revision"];
      if (
        expected === undefined
          ? Boolean(current)
          : current?.revision !== expected
      ) {
        const error = new Error();
        error.name = "ConditionalCheckFailedException";
        throw error;
      }
      records.set(key, input.Item!);
      return {};
    });
    const a = new DynamoDbStorage({ send } as never, "test");
    const b = new DynamoDbStorage({ send } as never, "test");
    await a.write({ key: "session", revision: 0, value: { step: 0 } }, null);
    await b.read("session");
    await a.write({ key: "session", revision: 1, value: { step: 1 } }, 0);
    expect((await b.read<{ step: number }>("session"))?.value.step).toBe(1);
    expect(
      await b.write({ key: "session", revision: 1, value: { step: 2 } }, 0),
    ).toBe(false);
    expect(send).toHaveBeenCalledTimes(5);
  });
});
