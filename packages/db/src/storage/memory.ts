import type { Storage, StoredRecord } from "./types";

export class MemoryStorage implements Storage {
  constructor(
    private readonly records = new Map<string, StoredRecord>(),
    private readonly now = () => Date.now(),
  ) {}
  async read<T>(key: string): Promise<StoredRecord<T> | null> {
    const record = this.records.get(key);
    if (
      !record ||
      (record.expiresAt !== undefined && record.expiresAt <= this.now() / 1000)
    )
      return null;
    return structuredClone(record) as StoredRecord<T>;
  }
  async write<T>(
    record: StoredRecord<T>,
    expectedRevision: number | null,
  ): Promise<boolean> {
    const current = this.records.get(record.key);
    const active =
      current &&
      (current.expiresAt === undefined || current.expiresAt > this.now() / 1000)
        ? current
        : undefined;
    if (
      expectedRevision === null
        ? Boolean(active)
        : active?.revision !== expectedRevision
    )
      return false;
    this.records.set(record.key, structuredClone(record));
    return true;
  }
}
