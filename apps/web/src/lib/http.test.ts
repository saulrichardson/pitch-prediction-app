import { describe, expect, it } from "vitest";
import { HttpError, readJsonObject } from "./http";

describe("readJsonObject", () => {
  it("returns an empty object for optional empty bodies", async () => {
    await expect(readJsonObject(new Request("http://test.local", { method: "POST" }), { optional: true })).resolves.toEqual({});
  });

  it("accepts JSON objects", async () => {
    const request = new Request("http://test.local", {
      method: "POST",
      body: JSON.stringify({ returnToActual: true })
    });

    await expect(readJsonObject(request, { optional: true })).resolves.toEqual({ returnToActual: true });
  });

  it("rejects null and arrays as bad request objects instead of throwing TypeError", async () => {
    await expectObjectError(null);
    await expectObjectError([]);
  });
});

async function expectObjectError(body: unknown) {
  const request = new Request("http://test.local", {
    method: "POST",
    body: JSON.stringify(body)
  });

  await expect(readJsonObject(request, { optional: true })).rejects.toMatchObject({
    status: 400,
    code: "invalid_json_object"
  } satisfies Partial<HttpError>);
}
