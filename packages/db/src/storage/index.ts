import { getStorageMode } from "../client";
import { DynamoDbStorage } from "./dynamodb";
import { MemoryStorage } from "./memory";
import { PostgresStorage } from "./postgres";
import type { Storage } from "./types";

let storage: Storage | null = null;

export function getStorage(): Storage {
  if (!storage) {
    const mode = getStorageMode();
    if (mode === "postgres") storage = new PostgresStorage();
    else if (mode === "dynamodb") storage = new DynamoDbStorage();
    else storage = new MemoryStorage();
  }
  return storage;
}

export type { Storage } from "./types";
