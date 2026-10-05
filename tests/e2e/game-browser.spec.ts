import { expect, test } from "@playwright/test";
import type { GameCatalog } from "@pitch/domain";

test("a preparation rejection remains visible after the selected game loads", async ({
  page,
}) => {
  const message = "Daily preparation allowance reached. Try again tomorrow.";
  await page.route("**/api/games/900004", async (route) => {
    if (route.request().method() === "POST")
      await route.fulfill({
        status: 429,
        json: { code: "caller_budget_exceeded", error: message },
      });
    else await route.continue();
  });
  await page.goto("/?browse=1");
  await page
    .getByRole("button", {
      name: "Seattle Mariners at Los Angeles Dodgers, game 2, prepare replay",
      exact: true,
    })
    .click();
  const panel = page.getByRole("region", {
    name: "Selected game",
    exact: true,
  });
  await expect(
    panel.getByRole("heading", { name: "SEA at LAD" }),
  ).toBeVisible();
  await expect(panel).toContainText(message);
  await page
    .getByRole("button", { name: "Back to games", exact: true })
    .click();
  await expect(page.getByText(message)).not.toBeVisible();
});

test("a missing replay stays explicit instead of opening an unrelated feature", async ({
  page,
}) => {
  for (const id of ["e".repeat(64), "not-a-replay"]) {
    await page.goto(`/?replay=${id}`);
    await expect(
      page.getByRole("heading", { name: "Replay unavailable." }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Start replay", exact: true }),
    ).not.toBeVisible();
    await expect(page).toHaveURL(new RegExp(`replay=${id}$`));
    await page.getByRole("button", { name: "Games", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Choose a game." }),
    ).toBeVisible();
  }
});

test("a late missing-session response cannot replace a newly opened game", async ({
  page,
}) => {
  const missing = "e".repeat(64);
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requested!: () => void;
  const started = new Promise<void>((resolve) => {
    requested = resolve;
  });
  let missingStarts = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && request.postData()?.includes(missing))
      missingStarts++;
  });
  await page.route(`**/api/replays/${missing}`, async (route) => {
    requested();
    await blocked;
    await route.fulfill({
      status: 404,
      json: {
        code: "session_not_found",
        error: "Start this replay to continue.",
      },
    });
  });
  await page.goto(`/?replay=${missing}`);
  await started;
  await page.getByRole("button", { name: "Games", exact: true }).click();
  await page
    .getByRole("button", {
      name: "Seattle Mariners at Los Angeles Dodgers, open replay",
      exact: true,
    })
    .click();
  await expect(page).toHaveURL(/replay=b{64}/);
  const response = page.waitForResponse(`**/api/replays/${missing}`);
  release();
  await response;
  // Flush subsequent API work, if any, before checking the saved destination.
  await page.request.get("/ready");
  await expect(page).toHaveURL(/replay=b{64}/);
  expect(missingStarts).toBe(0);
  expect(
    await page.evaluate(() => localStorage.getItem("pitch.replay.v1")),
  ).toBe("b".repeat(64));
});

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
      name: "Atlanta Braves at Los Angeles Dodgers, open replay",
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
      name: "Atlanta Braves at Los Angeles Dodgers, open replay",
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
  await page
    .getByRole("button", {
      name: "Los Angeles Dodgers at San Francisco Giants, open replay",
      exact: true,
    })
    .click();
  await expect(page).toHaveURL(/replay=c{64}/);
});

test("shows only ten completed Dodgers games and rejects unsupported requests", async ({
  page,
}) => {
  await page.goto("/?browse=1");
  await expect(page.locator(".game-list .game-row")).toHaveCount(10);
  await expect(page.getByRole("button", { name: /In Progress/ })).toHaveCount(
    0,
  );
  await expect(page.getByRole("button", { name: /New York Mets/ })).toHaveCount(
    0,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  const catalog = (await (
    await page.request.get("/api/games")
  ).json()) as GameCatalog;
  expect(
    catalog.games.every((game) => game.away.id === 119 || game.home.id === 119),
  ).toBe(true);
  expect(
    (
      await page.request.post("/api/games/900099", {
        data: { date: catalog.date },
        headers: { origin: "http://127.0.0.1:3100" },
      })
    ).status(),
  ).toBe(404);
  await page.reload();
  await expect(page.locator(".game-list .game-row")).toHaveCount(10);
  await page.goto("/?browse=1&game=not-a-game");
  await expect(
    page.getByRole("region", { name: "Selected game", exact: true }),
  ).toContainText("Choose a listed MLB game.");
});

test("shows durable preparation progress across refresh and opens the completed replay", async ({
  page,
}) => {
  let ready = false;
  let preparationRequests = 0;
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
      preparationRequests++;
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
  await page.locator('[data-game-id="900002"]').click();
  await expect(
    page.getByText("Preparing the full game: pitch 2 of 4.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Seattle Mariners at Los Angeles Dodgers, view preparation",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Seattle Mariners at Los Angeles Dodgers, view preparation",
      exact: true,
    })
    .click();
  await expect(
    page.getByText("Preparing the full game: pitch 2 of 4.", { exact: true }),
  ).toBeVisible();
  expect(preparationRequests).toBe(1);
  await page.reload();
  await expect(
    page.getByText("Preparing the full game: pitch 2 of 4.", { exact: true }),
  ).toBeVisible();
  ready = true;
  await expect(
    page.getByRole("button", { name: "Reveal pitch", exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(/replay=b{64}/);
});
