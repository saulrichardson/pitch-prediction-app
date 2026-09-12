import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { PostgresStorage } from "./postgres";

describe.skipIf(!process.env.TEST_POSTGRES_URL)(
  "PostgreSQL storage against a migrated database",
  () => {
    it("resolves concurrent writes atomically and recreates expired sessions", async () => {
      process.env.STORAGE_MODE = "postgres";
      process.env.DATABASE_URL = process.env.TEST_POSTGRES_URL;
      process.env.DATABASE_SSL = "false";
      const a = new PostgresStorage();
      const b = new PostgresStorage();
      const key = `test:${randomUUID()}`;
      expect(
        await a.write({ key, revision: 0, value: { step: 0 } }, null),
      ).toBe(true);
      const results = await Promise.all([
        a.write({ key, revision: 1, value: { step: 1 } }, 0),
        b.write({ key, revision: 1, value: { step: 2 } }, 0),
      ]);
      expect(results.filter(Boolean)).toHaveLength(1);
      expect((await b.read(key))?.revision).toBe(1);
      expect(
        await b.write(
          { key, revision: 2, value: { step: 0 }, expiresAt: 1 },
          1,
        ),
      ).toBe(true);
      expect(await a.read(key)).toBeNull();
      expect(
        await a.write({ key, revision: 0, value: { step: 0 } }, null),
      ).toBe(true);
      expect((await b.read<{ step: number }>(key))?.value.step).toBe(0);
    });
  },
);
