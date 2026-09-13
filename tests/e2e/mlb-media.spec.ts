import { expect, test } from "@playwright/test";

test("slow or unavailable portraits never block replay and team marks follow the theme", async ({
  page,
}, testInfo) => {
  if (testInfo.project.name === "phone")
    await page.setViewportSize({ width: 320, height: 740 });
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
  } finally {
    releasePhotos();
  }
});
