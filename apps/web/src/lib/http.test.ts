import { describe, expect, it } from "vitest";
import { HttpError, readJsonObject, assertSameOrigin, readJson } from "./http";

describe("public replay request boundary", () => {
  it("uses the viewer host forwarded by CloudFront", () => {
    expect(() =>
      assertSameOrigin(
        new Request("https://origin.lambda-url.us-east-1.on.aws/", {
          headers: {
            origin: "https://baseball.saulrichardson.io",
            "x-forwarded-host": "baseball.saulrichardson.io",
          },
        }),
      ),
    ).not.toThrow();
    for (const origin of ["https://other.example", "null", "not a URL"])
      expect(() =>
        assertSameOrigin(
          new Request("https://baseball.saulrichardson.io", {
            headers: { origin },
          }),
        ),
      ).toThrow();
  });
  it("rejects oversized or malformed JSON without invoking product logic", async () => {
    for (const body of ["not-json", "x".repeat(5000)])
      await expect(
        readJson(new Request("https://example.com", { method: "POST", body })),
      ).rejects.toMatchObject({ status: 400 });
  });
});

describe("readJsonObject", () => {
  it("returns an empty object for optional empty bodies", async () => {
    await expect(
      readJsonObject(new Request("http://test.local", { method: "POST" }), {
        optional: true,
      }),
    ).resolves.toEqual({});
  });

  it("accepts JSON objects", async () => {
    const request = new Request("http://test.local", {
      method: "POST",
      body: JSON.stringify({ option: true }),
    });

    await expect(readJsonObject(request, { optional: true })).resolves.toEqual({
      option: true,
    });
  });

  it("rejects null and arrays as bad request objects instead of throwing TypeError", async () => {
    await expectObjectError(null);
    await expectObjectError([]);
  });
});

async function expectObjectError(body: unknown) {
  const request = new Request("http://test.local", {
    method: "POST",
    body: JSON.stringify(body),
  });

  await expect(
    readJsonObject(request, { optional: true }),
  ).rejects.toMatchObject({
    status: 400,
    code: "invalid_json_object",
  } satisfies Partial<HttpError>);
}
