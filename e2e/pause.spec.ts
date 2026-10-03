import { expect, test, type Page } from '@playwright/test';
import { continueAfterPause, moveList, playButton, tapSquares } from './board';

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

test('stage 1: spot it, play it, and the game moves on by itself', async ({ page }) => {
  await atStage(page, 1);
  await reachFirstPause(page);
  await expect(page.getByText('Step 1 of 2')).toBeVisible();
  await expectBoardUncovered(page);

  await page.getByRole('button', { name: "Yes, something's going on" }).click();
  await expect(page.getByText('Step 2 of 2')).toBeVisible();
  await expect(page.getByText('Your move', { exact: true })).toBeVisible();
  await expect(page.getByText('Play the best move on the board.')).toBeVisible();
  await expectBoardUncovered(page);

  await tapSquares(page, 'd4', 'e5');
  await expect(page.getByText('You spotted it and found the move')).toBeVisible();
  await expectBoardUncovered(page);
  await continueAfterPause(page);
  await expect(moveList(page).filter({ hasText: /dxe5$/ })).toBeVisible();
});

test('a wrong answer at the spot step is only an error, and the user can pick again', async ({ page }) => {
  await atStage(page, 3);
  await reachFirstPause(page);

  await page.getByRole('button', { name: 'No, nothing special' }).click();
  await expect(page.getByText('Not quite. Look again.')).toBeVisible();
  await expect(page.getByText('Is something important happening?')).toBeVisible();
  await expect(page.getByRole('button', { name: "Yes, something's going on" })).toBeEnabled();

  await page.getByRole('button', { name: "Yes, something's going on" }).click();
  await expect(page.getByText('Your move', { exact: true })).toBeVisible();
});

test('a wrong move is only an error and the piece goes back; the right one finishes it', async ({ page }) => {
  await atStage(page, 3);
  await reachFirstPause(page);
  await page.getByRole('button', { name: "Yes, something's going on" }).click();
  await expect(page.getByText('Your move', { exact: true })).toBeVisible();

  for (let attempt = 0; attempt < 2; attempt++) {
    await tapSquares(page, 'a2', 'a3');
    await expect(page.getByText('Not quite. Try again.')).toBeVisible();
    await expect(page.getByText('Your move', { exact: true })).toBeVisible();
  }
  await expect(page.getByRole('button', { name: 'Hint' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Show solution' })).toBeVisible();

  await tapSquares(page, 'd4', 'e5');
  await expect(page.getByText('You spotted it and found the move')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible();
});

test('hints name the pattern, then show the piece, then the move, and the user still plays it', async ({ page }) => {
  await atStage(page, 3);
  await reachFirstPause(page);
  await page.getByRole('button', { name: "Yes, something's going on" }).click();
  await expect(page.getByText('Your move', { exact: true })).toBeVisible();

  const sub = page.locator('.pause-sub');
  const before = await sub.textContent();
  await page.getByRole('button', { name: 'Hint' }).click();
  await expect(sub).not.toHaveText(before!);
  await expect(page.getByRole('button', { name: 'Hint', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Show the piece' }).click();
  await expect(page.getByText('Move the highlighted piece.')).toBeVisible();
  await page.getByRole('button', { name: 'Show the move' }).click();
  await expect(page.getByText('Play the move shown.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Show the move' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Show solution' })).toBeVisible();
  await tapSquares(page, 'd4', 'e5');

  await expect(page.getByText('Solved with a hint')).toBeVisible();
  await expect(page.locator('.pause-pattern')).not.toBeEmpty();
  await expect(page.locator('.pause-remember')).toContainText('Remember');
  await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible();
});

test('show solution goes to the line playing itself, scored as missed', async ({ page }) => {
  await atStage(page, 1);
  await reachFirstPause(page);
  await page.getByRole('button', { name: "Yes, something's going on" }).click();
  await page.getByRole('button', { name: 'Show solution' }).click();

  await expect(page.getByText('Missed it')).toBeVisible();
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

test('no button in the sheet has an icon or an emoji in its label', async ({ page }) => {
  await atStage(page, 3);
  await reachFirstPause(page);
  const labels = () => page.locator('.pause-sheet button').allTextContents();
  const plain = /^[A-Za-z' ,.?]*$/;

  expect((await labels()).every((text) => plain.test(text))).toBe(true);
  await page.getByRole('button', { name: "Yes, something's going on" }).click();
  await expect(page.getByRole('button', { name: 'Show solution' })).toBeVisible();
  expect(await labels()).toEqual(['Hint', 'Show solution']);
  await page.getByRole('button', { name: 'Show solution' }).click();
  await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible();
  expect((await labels()).every((text) => plain.test(text))).toBe(true);
});
