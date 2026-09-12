export type StoredRecord<T = unknown> = {
  key: string;
  revision: number;
  value: T;
  expiresAt?: number;
};
export interface Storage {
  read<T>(key: string): Promise<StoredRecord<T> | null>;
  /** null means create-only; otherwise atomically replace exactly that revision. */
  write<T>(
    record: StoredRecord<T>,
    expectedRevision: number | null,
  ): Promise<boolean>;
}
