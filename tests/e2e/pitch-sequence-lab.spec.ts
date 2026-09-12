import { expect, test } from "@playwright/test";

test("a complete replay stays stable through reveal, navigation, refresh and restart", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start replay" }).click();
  const primary = page.getByRole("button", {
    name: "Reveal pitch",
    exact: true,
  });
  await expect(primary).toBeVisible();
  const before = await primary.boundingBox();
  expect(before!.y + before!.height).toBeLessThanOrEqual(
    page.viewportSize()!.height,
  );
  const forecast = await page.locator(".forecast").innerText();
  await primary.click();
  await expect(page.locator(".actual-main h2")).toHaveText("Changeup");
  const next = page.getByRole("button", { name: "Next pitch", exact: true });
  const after = await next.boundingBox();
  expect(Math.abs(after!.y - before!.y)).toBeLessThan(2);
  await page.getByRole("button", { name: "Back one replay step" }).click();
  await expect(primary).toBeVisible();
  await expect(page.locator(".forecast")).toHaveText(forecast);
  await primary.click();
  await next.click();
  await expect(page.locator(".pitch-progress")).toContainText("2");
  await page.reload();
  await expect(page.locator(".pitch-progress")).toContainText("2");
  for (let i = 1; i < 4; i++) {
    await primary.click();
    if (i < 3) await next.click();
  }
  await expect(
    page.getByRole("region", { name: "At-bat summary" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Strikeout" })).toBeVisible();
  await page.getByRole("button", { name: "Replay again" }).click();
  await expect(primary).toBeVisible();
  await expect(page.locator(".forecast")).toHaveText(forecast);
});

test("the forecast reveals detail on demand without horizontal overflow", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start replay" }).click();
  await expect(page.locator(".methodology")).not.toBeVisible();
  await page.getByText("Explore the forecast", { exact: true }).click();
  await expect(page.locator(".methodology")).toBeVisible();
  await expect(page.getByText("<1%", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("a revealed marker stays at its pitch location throughout the fade", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start replay" }).click();
  await page.addStyleTag({
    content: ".plot-actual { animation-duration: 4s !important; }",
  });
  await page.getByRole("button", { name: "Reveal pitch" }).click();
  const position = await page.locator(".plot-actual").evaluate((element) => {
    const marker = element as unknown as SVGGElement;
    const animation = marker.getAnimations()[0];
    if (!animation)
      throw new Error("The marker reveal animation did not start.");
    animation.pause();
    animation.currentTime = 2000;
    const expected = marker.transform.baseVal.consolidate()!.matrix;
    const actual = new DOMMatrixReadOnly(getComputedStyle(marker).transform);
    return {
      x: actual.e,
      y: actual.f,
      expectedX: expected.e,
      expectedY: expected.f,
    };
  });
  expect(position.x).toBeCloseTo(position.expectedX, 2);
  expect(position.y).toBeCloseTo(position.expectedY, 2);
});

test("a lost response settles from the saved cursor without a duplicate advance", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start replay" }).click();
  await expect(
    page.getByRole("button", { name: "Reveal pitch" }),
  ).toBeVisible();
  let lost = false;
  await page.route("**/api/replays/*", async (route) => {
    if (route.request().method() === "POST" && !lost) {
      lost = true;
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await page.getByRole("button", { name: "Reveal pitch" }).click();
  await expect(page.getByRole("button", { name: "Next pitch" })).toBeEnabled();
  await expect(page.locator(".pitch-progress")).toContainText("1");
  await page.reload();
  await expect(page.getByRole("button", { name: "Next pitch" })).toBeEnabled();
});

test("an offline action can be retried after reconnection", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start replay" }).click();
  await expect(
    page.getByRole("button", { name: "Reveal pitch" }),
  ).toBeVisible();
  await context.setOffline(true);
  await page.getByRole("button", { name: "Reveal pitch" }).click();
  await expect(page.getByRole("button", { name: "Try again" })).toBeEnabled();
  await expect(page.locator(".pitch-progress")).toContainText("1");
  await context.setOffline(false);
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("button", { name: "Next pitch" })).toBeEnabled();
});
