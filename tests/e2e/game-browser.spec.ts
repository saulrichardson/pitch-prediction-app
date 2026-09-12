import { expect, test } from "@playwright/test";
import type { GameCatalog } from "@pitch/domain";

test("keeps an interrupted command with its game while another game is played", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start replay", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Reveal pitch", exact: true }),
  ).toBeEnabled();
  await context.setOffline(true);
  await page.getByRole("button", { name: "Reveal pitch", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Try again", exact: true }),
  ).toBeEnabled();
  await context.setOffline(false);
  await page.getByRole("button", { name: "Games", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Seattle Mariners at Los Angeles Dodgers, open replay",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Reveal pitch", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Next pitch", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Games", exact: true }).click();
  await page
    .getByRole("button", {
      name: "New York Mets at Miami Marlins, open replay",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", { name: "Try again", exact: true }),
  ).toBeEnabled();
  await page.reload();
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Next pitch", exact: true }),
  ).toBeEnabled();
  await expect(page.locator(".pitch-progress")).toContainText("1");
});

test("switches teams and dates while preserving each game's replay cursor", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Start replay", exact: true }).click();
  await page.getByRole("button", { name: "Reveal pitch", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Next pitch", exact: true }),
  ).toBeVisible();
  const original = await page.locator(".forecast").innerText();
  await page.getByRole("button", { name: "Games", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Choose a game." }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Seattle Mariners at Los Angeles Dodgers, open replay",
      exact: true,
    })
    .click();
  await expect(page).toHaveURL(/replay=b{64}/);
  await page.getByRole("button", { name: "Reveal pitch", exact: true }).click();
  await page.getByRole("button", { name: "Next pitch", exact: true }).click();
  await expect(page.locator(".pitch-progress")).toContainText("2");
  await page.getByRole("button", { name: "Games", exact: true }).click();
  await page
    .getByRole("button", {
      name: "New York Mets at Miami Marlins, open replay",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("button", { name: "Next pitch", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".forecast")).toHaveText(original, {
    useInnerText: true,
  });
  await page.getByRole("button", { name: "Games", exact: true }).click();
  const catalog = (await (
    await page.request.get("/api/games")
  ).json()) as GameCatalog;
  const yesterday = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date(`${catalog.window.dates[1]}T12:00:00Z`));
  await page.getByRole("button", { name: yesterday, exact: true }).click();
  await page
    .getByRole("button", {
      name: "Boston Red Sox at New York Yankees, open replay",
      exact: true,
    })
    .click();
  await expect(page).toHaveURL(/replay=c{64}/);
});

test("shows seven days, empty dates, doubleheaders, and unselectable live games without overflow", async ({
  page,
}) => {
  await page.goto("/?browse=1");
  await expect(page.locator(".date-strip button")).toHaveCount(7);
  await expect(
    page.getByRole("button", {
      name: "Seattle Mariners at Los Angeles Dodgers, In Progress",
      exact: true,
    }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", {
      name: "Seattle Mariners at Los Angeles Dodgers, game 2, prepare replay",
      exact: true,
    }),
  ).toBeEnabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.locator(".date-strip button").first().click();
  await expect(
    page.getByRole("heading", { name: "No games on this date." }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "No games on this date." }),
  ).toBeVisible();
  await page.locator(".date-strip button").last().click();
  await expect(
    page.getByRole("button", {
      name: "New York Mets at Miami Marlins, open replay",
      exact: true,
    }),
  ).toBeVisible();
  await page.goto("/?browse=1&date=not-a-date");
  await expect(
    page
      .getByRole("region", { name: "Game browser", exact: true })
      .getByRole("alert"),
  ).toContainText("Choose a date from the last seven days.");
  await page
    .getByRole("button", { name: "Show this week", exact: true })
    .click();
  await expect(page.locator(".date-strip button")).toHaveCount(7);
  await page.goto("/?browse=1&game=not-a-game");
  await expect(
    page.getByRole("region", { name: "Selected game", exact: true }),
  ).toContainText("Choose a listed MLB game.");
  await page
    .getByRole("button", { name: "Back to games", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Selected game", exact: true }),
  ).not.toBeVisible();
});

test("shows durable preparation progress across refresh and opens the completed replay", async ({
  page,
}) => {
  let ready = false;
  await page.route("**/api/games", async (route) => {
    const response = await route.fetch();
    const catalog = (await response.json()) as GameCatalog;
    await route.fulfill({
      response,
      json: {
        ...catalog,
        games: catalog.games.map((game) =>
          game.gamePk === "900002"
            ? { ...game, replay: { status: "available" } }
            : game,
        ),
      },
    });
  });
  await page.route("**/api/games/900002**", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        json: { replay: { status: "queued", completed: 0, total: null } },
      });
      return;
    }
    const response = await route.fetch();
    const body = await response.json();
    await route.fulfill({
      response,
      json: ready
        ? body
        : { ...body, replay: { status: "preparing", completed: 1, total: 4 } },
    });
  });
  await page.goto("/?browse=1");
  await page
    .getByRole("button", {
      name: "Seattle Mariners at Los Angeles Dodgers, prepare replay",
      exact: true,
    })
    .click();
  await expect(
    page.getByText("Preparing pitch 2 of 4.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Seattle Mariners at Los Angeles Dodgers, view preparation",
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("Preparing pitch 2 of 4.", { exact: true }),
  ).toBeVisible();
  ready = true;
  await expect(
    page.getByRole("button", { name: "Reveal pitch", exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(/replay=b{64}/);
});
