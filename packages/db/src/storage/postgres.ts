import { eq, sql } from "drizzle-orm";
import { getReadyDb } from "../client";
import { replayRecords } from "../schema";
import type { Storage, StoredRecord } from "./types";

export class PostgresStorage implements Storage {
  async read<T>(key: string): Promise<StoredRecord<T> | null> {
    const db = await this.database();
    const [row] = await db
      .select()
      .from(replayRecords)
      .where(eq(replayRecords.key, key))
      .limit(1);
    if (
      !row ||
      (row.expiresAt !== null && row.expiresAt <= Math.floor(Date.now() / 1000))
    )
      return null;
    return {
      key,
      revision: row.revision,
      value: row.value as T,
      ...(row.expiresAt === null ? {} : { expiresAt: row.expiresAt }),
    };
  }
  async write<T>(
    record: StoredRecord<T>,
    expectedRevision: number | null,
  ): Promise<boolean> {
    const db = await this.database();
    const values = {
      key: record.key,
      revision: record.revision,
      value: record.value,
      expiresAt: record.expiresAt ?? null,
    };
    if (expectedRevision === null) {
      const rows = await db
        .insert(replayRecords)
        .values(values)
        .onConflictDoUpdate({
          target: replayRecords.key,
          set: values,
          setWhere: sql`${replayRecords.expiresAt} <= ${Math.floor(Date.now() / 1000)}`,
        })
        .returning({ key: replayRecords.key });
      return rows.length === 1;
    }
    const rows = await db
      .update(replayRecords)
      .set(values)
      .where(
        sql`${replayRecords.key} = ${record.key} AND ${replayRecords.revision} = ${expectedRevision} AND (${replayRecords.expiresAt} IS NULL OR ${replayRecords.expiresAt} > ${Math.floor(Date.now() / 1000)})`,
      )
      .returning({ key: replayRecords.key });
    return rows.length === 1;
  }
  private async database() {
    const db = await getReadyDb();
    if (!db) throw new Error("PostgreSQL is not configured.");
    return db;
  }
}
