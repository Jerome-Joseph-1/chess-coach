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

test('stage 1: spot it, step through the line and come back to the position', async ({ page }) => {
  await atStage(page, 1);
  await reachFirstPause(page);
  await expect(page.getByText('Step 1 of 1')).toBeVisible();
  await expectBoardUncovered(page);

  await page.getByRole('button', { name: "Yes, something's going on" }).click();
  const back = page.getByRole('button', { name: 'Back to the position' });
  await expect(back).toBeVisible();
  await expect(back).toBeDisabled();
  await expectBoardUncovered(page);

  await page.getByRole('button', { name: 'Next move' }).click();
  await expect(back).toBeEnabled();
  await back.click();
  await expect(back).toBeDisabled();

  await continueAfterPause(page);
  await expect(moveList(page).filter({ hasText: /^d6$/ })).toBeVisible();
});

test('stage 3: point to the piece, then play the move', async ({ page }) => {
  await atStage(page, 3);
  await reachFirstPause(page);
  await expect(page.getByText('Step 1 of 3')).toBeVisible();

  await page.getByRole('button', { name: "Yes, something's going on" }).click();
  await expect(page.getByText('Which piece matters most?')).toBeVisible();
  await expectBoardUncovered(page);
  await tapSquare(page, 'd4');

  await expect(page.getByText("What's your move?")).toBeVisible();
  await expectBoardUncovered(page);
  await tapSquares(page, 'd4', 'e5');

  await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible();
  await expect(page.getByText('You spotted it and found the move')).toBeVisible();
  await expectBoardUncovered(page);
});

test('a quiet answer on a key position shows what was there', async ({ page }) => {
  await atStage(page, 1);
  await reachFirstPause(page);
  await page.getByRole('button', { name: 'No, nothing special' }).click();
  await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible();
  await expectBoardUncovered(page);
});
