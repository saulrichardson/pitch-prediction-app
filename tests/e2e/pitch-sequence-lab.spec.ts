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
  await expect(page.locator(".forecast")).toHaveText(forecast, {
    useInnerText: true,
  });
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
  await expect(page.locator(".forecast")).toHaveText(forecast, {
    useInnerText: true,
  });
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

test("About dismisses with Escape or an outside action without interrupting the replay", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start replay", exact: true }).click();
  const about = page.locator(".about summary");
  const modelCard = page.getByRole("link", { name: "Model card" });
  await about.click();
  await expect(modelCard).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(modelCard).not.toBeVisible();
  await expect(about).toBeFocused();
  await about.click();
  await page.getByRole("button", { name: "Reveal pitch", exact: true }).click();
  await expect(modelCard).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Next pitch", exact: true }),
  ).toBeEnabled();
  await expect(page.locator(".pitch-progress")).toContainText("Pitch 1 / 4");
});

test("small-screen controls stay reachable through reveal, details, and completion", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "phone",
    "The narrowest phone layout has its own interaction check.",
  );
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/");
  await page.getByRole("button", { name: "Start replay", exact: true }).click();
  const reveal = page.getByRole("button", {
    name: "Reveal pitch",
    exact: true,
  });
  await expect(reveal).toBeVisible();
  const initial = (await reveal.boundingBox())!;
  expect(initial.x).toBeGreaterThanOrEqual(20);
  expect(initial.x + initial.width).toBeLessThanOrEqual(300);
  expect(initial.y + initial.height).toBeLessThanOrEqual(640);
  for (let index = 0; index < 4; index++) {
    await reveal.click();
    const next = page.getByRole("button", {
      name: index === 3 ? "Replay again" : "Next pitch",
      exact: true,
    });
    await expect(next).toBeEnabled();
    expect(Math.abs((await next.boundingBox())!.y - initial.y)).toBeLessThan(2);
    if (index === 0) {
      await page.getByText("Explore the forecast", { exact: true }).click();
      await page.locator(".methodology").scrollIntoViewIfNeeded();
      expect(Math.abs((await next.boundingBox())!.y - initial.y)).toBeLessThan(
        2,
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.getByText("Explore the forecast", { exact: true }).click();
    }
    if (index < 3) await next.click();
  }
  await page.getByRole("button", { name: "Replay again", exact: true }).click();
  await expect(reveal).toBeEnabled();
  expect(Math.abs((await reveal.boundingBox())!.y - initial.y)).toBeLessThan(2);
});
