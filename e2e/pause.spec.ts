import { expect, test, type Page } from '@playwright/test';
import { continueAfterPause, moveList, playButton, tapSquare, tapSquares } from './board';

test.use({ serviceWorkers: 'block' });

async function atStage(page: Page, stage: number) {
  await page.addInitScript((depth) => {
    localStorage.setItem('cc.settings.v1', JSON.stringify({ depthOverride: depth }));
  }, stage);
}

/** Taps Play, after which the fixture game moves itself up to its first key position. */
async function reachFirstPause(page: Page) {
  await page.goto('./#/play/italian/1400');
  await playButton(page).click();
  await expect(page.getByText('Is something important happening?')).toBeVisible({ timeout: 15_000 });
}

async function expectBoardUncovered(page: Page) {
  const board = (await page.locator('.board-host').boundingBox())!;
  const sheet = (await page.locator('.pause-sheet').boundingBox())!;
  expect(sheet.y).toBeGreaterThanOrEqual(board.y + board.height - 1);
  expect(sheet.y + sheet.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1);
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
}

test('stage 1: spot it, then the line plays itself and the game moves on', async ({ page }) => {
  await atStage(page, 1);
  await reachFirstPause(page);
  await expect(page.getByText('Step 1 of 1')).toBeVisible();
  await expectBoardUncovered(page);

  await page.getByRole('button', { name: "Yes, something's going on" }).click();
  const caption = page.locator('.stepper-caption');
  await expect(caption).not.toBeEmpty();
  const first = await caption.textContent();
  await expect(caption).not.toHaveText(first!, { timeout: 4000 });
  await expectBoardUncovered(page);

  await page.getByRole('button', { name: 'Previous move' }).click();
  await page.waitForTimeout(800);
  const stopped = await caption.textContent();
  await page.waitForTimeout(2000);
  await expect(caption).toHaveText(stopped!);
  await expect(page.getByRole('button', { name: 'Watch again' })).toBeVisible();

  await continueAfterPause(page);
  await expect(moveList(page).filter({ hasText: /dxe5$/ })).toBeVisible();
});

test('stage 3: point to the piece, then play the move', async ({ page }) => {
  await atStage(page, 3);
  await reachFirstPause(page);
  await expect(page.getByText('Step 1 of 3')).toBeVisible();

  await page.getByRole('button', { name: "Yes, something's going on" }).click();
  await expect(page.getByText('Tap the piece that matters most')).toBeVisible();
  await expectBoardUncovered(page);
  await tapSquare(page, 'd4');

  await expect(page.getByText('Your move', { exact: true })).toBeVisible();
  await expectBoardUncovered(page);
  await tapSquares(page, 'd4', 'e5');

  await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible();
  await expect(page.getByText('You spotted it and found the move')).toBeVisible();
  await expectBoardUncovered(page);
});

test('stage 3: hints show the piece, then the move', async ({ page }) => {
  await atStage(page, 3);
  await reachFirstPause(page);
  await page.getByRole('button', { name: "Yes, something's going on" }).click();
  await page.getByRole('button', { name: 'Hint' }).click();
  await tapSquare(page, 'd4');

  await expect(page.getByText('Your move', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Hint' }).click();
  await expect(page.getByText('Move the highlighted piece.')).toBeVisible();
  await page.getByRole('button', { name: 'Show the move' }).click();
  await expect(page.getByText('Play the move shown.')).toBeVisible();
  await tapSquares(page, 'd4', 'e5');

  await expect(page.getByText('Solved with a hint')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible();
});

test('a quiet answer on a key position shows what was there', async ({ page }) => {
  await atStage(page, 1);
  await reachFirstPause(page);
  await page.getByRole('button', { name: 'No, nothing special' }).click();
  await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible();
  await expectBoardUncovered(page);
});
