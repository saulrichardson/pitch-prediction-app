import { DescribeTableCommand, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

export type StorageMode = "memory" | "postgres" | "dynamodb";

let cachedDb: ReturnType<typeof drizzle<typeof schema>> | null = null;
let cachedPool: pg.Pool | null = null;
let cachedDynamoDbClient: DynamoDBClient | null = null;

export function getStorageMode(): StorageMode {
  const mode = process.env.STORAGE_MODE;
  if (mode === "memory" || mode === "postgres" || mode === "dynamodb")
    return mode;
  if (!mode) {
    throw new Error(
      "STORAGE_MODE is required. Use STORAGE_MODE=memory for local/demo storage, STORAGE_MODE=dynamodb for serverless durable storage, or STORAGE_MODE=postgres for durable PostgreSQL storage.",
    );
  }
  throw new Error(
    `STORAGE_MODE must be either "memory", "dynamodb", or "postgres". Received "${mode}".`,
  );
}

export function getDatabaseUrl(): string | null {
  const mode = getStorageMode();
  if (mode === "memory" || mode === "dynamodb") return null;
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const secretJson = process.env.DATABASE_SECRET_JSON;
  if (!secretJson) {
    throw new Error(
      "DATABASE_URL or DATABASE_SECRET_JSON is required when STORAGE_MODE=postgres.",
    );
  }

  const secret = parseDatabaseSecret(secretJson);
  const database = secret.dbname ?? "pitch_sequence_lab";
  const port = secret.port ?? 5432;
  return `postgresql://${encodeURIComponent(secret.username)}:${encodeURIComponent(secret.password)}@${secret.host}:${port}/${database}`;
}

export function getDb() {
  if (getStorageMode() !== "postgres") return null;
  const pool = getPool();
  if (!pool) return null;

  if (!cachedDb) {
    cachedDb = drizzle(pool, { schema });
  }
  return cachedDb;
}

export async function getReadyDb() {
  const db = getDb();
  if (!db) return null;
  return db;
}

export function getDynamoTableName(): string | null {
  const mode = getStorageMode();
  if (mode !== "dynamodb") return null;
  const tableName = process.env.DYNAMODB_TABLE_NAME;
  if (!tableName) {
    throw new Error(
      "DYNAMODB_TABLE_NAME is required when STORAGE_MODE=dynamodb.",
    );
  }
  return tableName;
}

export function getDynamoDbClient(): DynamoDBClient | null {
  if (getStorageMode() !== "dynamodb") return null;
  cachedDynamoDbClient ??= new DynamoDBClient({});
  return cachedDynamoDbClient;
}

export async function checkDynamoDb(): Promise<boolean> {
  const client = getDynamoDbClient();
  const tableName = getDynamoTableName();
  if (!client || !tableName) return false;
  await client.send(new DescribeTableCommand({ TableName: tableName }));
  return true;
}

function getPool(): pg.Pool | null {
  if (getStorageMode() !== "postgres") return null;
  const url = getDatabaseUrl();
  if (!url) return null;

  if (!cachedPool) {
    cachedPool = new Pool({
      connectionString: url,
      max: 5,
      connectionTimeoutMillis: 5000,
      statement_timeout: 5000,
      ssl: shouldUseSsl(url) ? { rejectUnauthorized: false } : undefined,
    });
  }
  return cachedPool;
}

function parseDatabaseSecret(secretJson: string): {
  username: string;
  password: string;
  host: string;
  port?: number;
  dbname?: string;
  dbInstanceIdentifier?: string;
} {
  let secret: {
    username?: string;
    password?: string;
    host?: string;
    port?: number;
    dbname?: string;
    dbInstanceIdentifier?: string;
  };
  try {
    secret = JSON.parse(secretJson) as typeof secret;
  } catch (error) {
    throw new Error("DATABASE_SECRET_JSON must be valid JSON.", {
      cause: error,
    });
  }
  if (!secret.username || !secret.password || !secret.host) {
    throw new Error(
      "DATABASE_SECRET_JSON must include username, password, and host when STORAGE_MODE=postgres.",
    );
  }
  return secret as {
    username: string;
    password: string;
    host: string;
    port?: number;
    dbname?: string;
    dbInstanceIdentifier?: string;
  };
}

function shouldUseSsl(url: string): boolean {
  if (process.env.DATABASE_SSL === "false") return false;
  if (process.env.DATABASE_SSL === "true") return true;
  return (
    process.env.NODE_ENV === "production" || url.includes(".rds.amazonaws.com")
  );
}
