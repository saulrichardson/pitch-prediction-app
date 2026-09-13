import { expect, test } from "@playwright/test";

test("slow or unavailable portraits never block replay and team marks follow the theme", async ({
  page,
}, testInfo) => {
  if (testInfo.project.name === "phone")
    await page.setViewportSize({ width: 320, height: 740 });
  // A cold CDN previously sent one logo request per team to a Lambda limited
  // to ten concurrent requests. The interface must carry its own small marks.
  let separateLogoRequests = 0;
  await page.route("**/_next/static/media/*.svg", async (route) => {
    separateLogoRequests += 1;
    await route.abort("failed");
  });
  let releasePhotos = () => {};
  const pendingPhotos = new Promise<void>((resolve) => {
    releasePhotos = resolve;
  });
  await page.route("https://img.mlbstatic.com/**", async (route) => {
    await pendingPhotos;
    await route.abort("failed");
  });
  try {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(
      page.locator(".featured-matchup .player-portrait img"),
    ).toHaveCount(2);
    const start = page.getByRole("button", {
      name: "Start replay",
      exact: true,
    });
    const bounds = await start.boundingBox();
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(
      page.viewportSize()!.height,
    );
    await start.click();
    await page
      .getByRole("button", { name: "Reveal pitch", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Next pitch", exact: true }),
    ).toBeEnabled();
    await expect(page.locator(".actual-main h2")).toHaveText("Changeup");

    releasePhotos();
    await expect(page.locator(".matchup-player .portrait-initials")).toHaveText(
      ["JJ", "FL"],
    );
    const logo = page.locator(".scoreboard .team-mark").last();
    const lightSource = await logo.locator("img").getAttribute("src");
    const darkSource = await logo.locator("source").getAttribute("srcset");
    expect(lightSource).not.toBe(darkSource);
    await expect
      .poll(() =>
        logo.locator("img").evaluate((img: HTMLImageElement) => img.currentSrc),
      )
      .toBe(new URL(lightSource!, page.url()).href);
    await page.emulateMedia({ colorScheme: "dark" });
    await expect
      .poll(() =>
        logo.locator("img").evaluate((img: HTMLImageElement) => img.currentSrc),
      )
      .toBe(new URL(darkSource!, page.url()).href);
    await expect
      .poll(() =>
        page
          .locator(".scoreboard .team-mark img")
          .evaluateAll((images: HTMLImageElement[]) =>
            images.every((img) => img.complete && img.naturalWidth > 0),
          ),
      )
      .toBe(true);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.getByRole("button", { name: "Next pitch", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Reveal pitch", exact: true }),
    ).toBeEnabled();
    // A decode failure must leave the phone scoreboard identifiable.
    await page
      .locator(".scoreboard .team-mark img")
      .first()
      .dispatchEvent("error");
    await expect(page.locator(".scoreboard .team-mark-fallback")).toHaveText(
      "NYM",
    );
    await page.getByRole("button", { name: "Games", exact: true }).click();
    await expect(
      page.locator(".game-list .team-mark img").first(),
    ).toBeVisible();
    await expect
      .poll(() =>
        page
          .locator(".game-list .team-mark img")
          .evaluateAll(
            (images: HTMLImageElement[]) =>
              images.length > 0 &&
              images.every((img) => img.complete && img.naturalWidth > 0),
          ),
      )
      .toBe(true);
    expect(separateLogoRequests).toBe(0);
  } finally {
    releasePhotos();
  }
});
