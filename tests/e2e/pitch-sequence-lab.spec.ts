import { expect, test, type Page } from "@playwright/test";
import type { GameSummary } from "@pitch/domain";

test("reaches the next-pitch cockpit entry flow", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Predict the next pitch. Reveal the result." })).toBeVisible();
  await expect(page.getByText(/Start a real Mets replay/i)).toHaveCount(0);
  await expect(page.getByText("Reads")).toBeVisible();
  await expect(page.getByText("Shows")).toBeVisible();
  await expect(page.getByText("Scores")).toBeVisible();
  await expect(page.getByRole("link", { name: /GitHub Repository/i })).toHaveAttribute(
    "href",
    "https://github.com/saulrichardson/pitch-prediction-app-serverless"
  );
  await expect(page.getByText(/Model card/i)).toBeVisible();
  await expect(page.getByText("Forecast is locked before reveal.")).toBeVisible();
  await expect(page.getByText("Actual pitch is compared to the read.")).toBeVisible();
  await expect(page.getByText("Game context updates for the next pitch.")).toBeVisible();
  await expect(page.getByText("One loop, pitch by pitch.")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Start Mets Replay/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Manual Situation/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Try Alternate Pitch/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Generate Next Pitch/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Compare Branches/ })).toHaveCount(0);
});

test("one game-step button alternates reveal and advance", async ({ page }) => {
  await page.goto("/");
  const latest = await latestMetsGame(page);
  await page.getByRole("button", { name: /Start Mets Replay/ }).click();

  await expect(page.getByText("Expected Pitch", { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("game-date")).toContainText(`Game date ${formatOfficialDate(latest.game.officialDate)}`);
  await expect(page.getByTestId("game-date")).toContainText(latest.game.status);
  await expect(page.getByTestId("state-read")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Full forecast from this game state" })).toBeVisible();
  await expect(page.getByTestId("state-mode")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Back/ })).toBeDisabled();
  await expect(page.getByRole("button", { name: /Reload/ })).toHaveCount(0);
  await expect(page.getByText("Read strength")).toHaveCount(0);
  await expect(page.getByText("Model Detail")).toBeVisible();
  await expect(page.getByText(/Most Likely Next Pitch/i)).toBeVisible();
  await expect(page.getByText("Velo read")).toBeVisible();
  await expect(page.getByText("Horizontal")).toBeVisible();
  await expect(page.getByText("Height")).toBeVisible();
  await expect(page.getByText("Possible Next Pitches")).toBeVisible();
  await expect(page.getByText("Pitch Mix", { exact: true })).toBeVisible();
  await expect(page.getByText("Location Density", { exact: true })).toBeVisible();
  await expect(page.getByText("Result Forecast", { exact: true })).toBeVisible();
  await expect(page.getByText("Next Count Forecast", { exact: true })).toBeVisible();
  await expect(page.getByText("PA Forecast", { exact: true })).toBeVisible();
  await expect(page.getByText("Expected pitches remaining")).toBeVisible();
  await expect(page.getByText("Ready to reveal")).toBeVisible();
  const countBeforeReveal = await page.getByTestId("state-count").locator("strong").innerText();
  const outsBeforeReveal = await page.getByTestId("state-outs").locator("strong").innerText();
  const scoreBeforeReveal = await page.getByTestId("state-score").locator("strong").innerText();
  const pitchBeforeReveal = await page.getByTestId("state-pitch").locator("strong").innerText();
  await expect(page.getByRole("button", { name: /Reveal Actual/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Next Pitch$/ })).toHaveCount(0);

  await page.getByRole("button", { name: /Reveal Actual/ }).click();
  await expect(page.getByText("Actual Pitch").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "Full forecast from this game state" })).toBeVisible();
  await expect(page.getByText("Actual fit")).toHaveCount(0);
  await expect(page.getByText("Loc miss")).toBeVisible();
  await expect(page.getByTestId("state-count").locator("strong")).toHaveText(countBeforeReveal);
  await expect(page.getByTestId("state-outs").locator("strong")).toHaveText(outsBeforeReveal);
  await expect(page.getByTestId("state-score").locator("strong")).toHaveText(scoreBeforeReveal);
  await expect(page.getByTestId("state-pitch").locator("strong")).toHaveText(pitchBeforeReveal);
  await expect(page.getByRole("button", { name: /^Next Pitch$/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Reveal Actual/ })).toHaveCount(0);

  await page.getByRole("button", { name: /^Next Pitch$/ }).click();
  await expect(page.getByRole("button", { name: /Reveal Actual/ })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Last Pitch")).toBeVisible();
  await expect(page.getByTestId("state-read")).toHaveCount(0);
  await expect(page.getByText("Ready to reveal")).toBeVisible();
  await expect(page.getByTestId("state-pitch").locator("strong")).not.toHaveText(pitchBeforeReveal);
  await expect(page.getByRole("button", { name: /Manual Situation/ })).toHaveCount(0);
});

test("back button undoes reveal and advance steps", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Start Mets Replay/ }).click();

  const backButton = page.getByRole("button", { name: /Back/ });

  await expect(page.getByText("Ready to reveal")).toBeVisible({ timeout: 20_000 });
  await expect(backButton).toBeDisabled();

  await page.getByRole("button", { name: /Reveal Actual/ }).click();
  await expect(page.getByRole("button", { name: /^Next Pitch$/ })).toBeVisible({ timeout: 20_000 });
  await expect(backButton).toBeEnabled();

  await backButton.click();
  await expect(page.getByRole("button", { name: /Reveal Actual/ })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Ready to reveal")).toBeVisible();
  await expect(page.getByTestId("state-pitch").locator("strong")).toHaveText("P1");
  await expect(backButton).toBeDisabled();

  await page.getByRole("button", { name: /Reveal Actual/ }).click();
  await expect(page.getByRole("button", { name: /^Next Pitch$/ })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: /^Next Pitch$/ }).click();
  await expect(page.getByRole("button", { name: /Reveal Actual/ })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("state-pitch").locator("strong")).toHaveText("P2");
  await expect(backButton).toBeEnabled();

  await backButton.click();
  await expect(page.getByRole("button", { name: /^Next Pitch$/ })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Loc miss")).toBeVisible();
  await expect(page.getByTestId("state-pitch").locator("strong")).toHaveText("P1");
});

test("reveal keeps the header on the current pitch until a PA-ending advance", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Predict the next pitch. Reveal the result." })).toBeVisible();
  const latest = await latestMetsGame(page);

  await page.getByRole("button", { name: /Start Mets Replay/ }).click();
  await expect(page.getByText("Ready to reveal")).toBeVisible({ timeout: 20_000 });

  let foundNewAtBat = false;
  for (let index = 0; index < 40; index += 1) {
    const pitchBeforeReveal = await page.getByTestId("state-pitch").locator("strong").innerText();
    const countBeforeReveal = await page.getByTestId("state-count").locator("strong").innerText();
    const outsBeforeReveal = await page.getByTestId("state-outs").locator("strong").innerText();
    const scoreBeforeReveal = await page.getByTestId("state-score").locator("strong").innerText();
    const basesBeforeReveal = await page.getByTestId("state-bases").locator(".mini-bases").getAttribute("aria-label");
    const matchupBeforeReveal = compactText(await page.getByTestId("top-matchup").innerText());

    await page.getByRole("button", { name: /Reveal Actual/ }).click();
    await expect(page.getByRole("button", { name: /^Next Pitch$/ })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("After pitch")).toBeVisible();
    await expect.poll(async () => compactText(await page.getByTestId("top-matchup").innerText())).toBe(matchupBeforeReveal);
    await expect(page.getByTestId("state-count").locator("strong")).toHaveText(countBeforeReveal);
    await expect(page.getByTestId("state-outs").locator("strong")).toHaveText(outsBeforeReveal);
    await expect(page.getByTestId("state-score").locator("strong")).toHaveText(scoreBeforeReveal);
    await expect(page.getByTestId("state-bases").locator(".mini-bases")).toHaveAttribute("aria-label", basesBeforeReveal ?? "");

    await page.getByRole("button", { name: /^Next Pitch$/ }).click();
    await expect(page.getByRole("button", { name: /Reveal Actual/ })).toBeVisible({ timeout: 20_000 });
    const matchupAfterAdvance = compactText(await page.getByTestId("top-matchup").innerText());
    if (matchupAfterAdvance !== matchupBeforeReveal) {
      foundNewAtBat = true;
      await expect(page.getByTestId("state-pitch").locator("strong")).not.toHaveText(pitchBeforeReveal);
      await expect(page.getByText("Ready to reveal")).toBeVisible();
      await expect(page.getByTestId("game-date")).toContainText(`Game date ${formatOfficialDate(latest.game.officialDate)}`);
      break;
    }
  }

  expect(foundNewAtBat, "replay should reach a new at-bat within the first 40 pitches").toBe(true);
});

async function latestMetsGame(page: Page): Promise<{ game: GameSummary }> {
  const latestResponse = await page.request.get("/api/games/mets/latest");
  expect(latestResponse.ok()).toBeTruthy();
  return latestResponse.json() as Promise<{ game: GameSummary }>;
}

function formatOfficialDate(officialDate: string): string {
  const [year, month, day] = officialDate.split("-").map(Number);
  const date = year && month && day ? new Date(Date.UTC(year, month - 1, day)) : new Date(officialDate);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  }).format(date);
}

function compactText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
