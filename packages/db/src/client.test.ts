import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDatabaseUrl, getDynamoTableName, getStorageMode } from "./client";

const savedEnv = { ...process.env };

describe("database client storage mode", () => {
  beforeEach(() => {
    process.env = { ...savedEnv };
    delete process.env.STORAGE_MODE;
    delete process.env.DATABASE_URL;
    delete process.env.DATABASE_SECRET_JSON;
    delete process.env.DYNAMODB_TABLE_NAME;
  });

  afterEach(() => {
    process.env = { ...savedEnv };
  });

  it("requires an explicit storage mode", () => {
    expect(() => getStorageMode()).toThrow("STORAGE_MODE is required");
    expect(() => getDatabaseUrl()).toThrow("STORAGE_MODE is required");
  });

  it("accepts explicit memory mode without database configuration", () => {
    process.env.STORAGE_MODE = "memory";

    expect(getStorageMode()).toBe("memory");
    expect(getDatabaseUrl()).toBeNull();
  });

  it("accepts explicit DynamoDB mode with a table name", () => {
    process.env.STORAGE_MODE = "dynamodb";
    process.env.DYNAMODB_TABLE_NAME = "pitch-sequence-serverless-state";

    expect(getStorageMode()).toBe("dynamodb");
    expect(getDatabaseUrl()).toBeNull();
    expect(getDynamoTableName()).toBe("pitch-sequence-serverless-state");
  });

  it("requires a table name in DynamoDB mode", () => {
    process.env.STORAGE_MODE = "dynamodb";

    expect(() => getDynamoTableName()).toThrow("DYNAMODB_TABLE_NAME is required");
  });

  it("rejects unsupported storage modes", () => {
    process.env.STORAGE_MODE = "sqlite";

    expect(() => getStorageMode()).toThrow("STORAGE_MODE must be either");
  });

  it("requires database configuration in postgres mode", () => {
    process.env.STORAGE_MODE = "postgres";

    expect(() => getDatabaseUrl()).toThrow("DATABASE_URL or DATABASE_SECRET_JSON is required");
  });

  it("uses DATABASE_URL in postgres mode", () => {
    process.env.STORAGE_MODE = "postgres";
    process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/pitch_sequence_lab";

    expect(getDatabaseUrl()).toBe("postgresql://user:pass@localhost:5432/pitch_sequence_lab");
  });

  it("builds a connection URL from DATABASE_SECRET_JSON in postgres mode", () => {
    process.env.STORAGE_MODE = "postgres";
    process.env.DATABASE_SECRET_JSON = JSON.stringify({
      username: "pitch_admin",
      password: "secret pass",
      host: "db.example.com",
      port: 5433,
      dbname: "pitch_sequence_lab"
    });

    expect(getDatabaseUrl()).toBe("postgresql://pitch_admin:secret%20pass@db.example.com:5433/pitch_sequence_lab");
  });

  it("rejects malformed database secrets in postgres mode", () => {
    process.env.STORAGE_MODE = "postgres";
    process.env.DATABASE_SECRET_JSON = JSON.stringify({ username: "pitch_admin" });

    expect(() => getDatabaseUrl()).toThrow("DATABASE_SECRET_JSON must include username, password, and host");
  });
});
