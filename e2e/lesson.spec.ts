import { expect, test, type Page } from '@playwright/test';
import { continueButton, rememberCard, tapSquares } from './board';

// The test course: free pieces teach with game 0001 at ply 19 (Rxe6+) and practise at ply 3 (dxe5);
// traps have an example (the Nxe5 trap, answered by h3) and no practice positions.
test.use({ serviceWorkers: 'block' });

const bubble = (page: Page) => page.locator('.coach-bubble').first();
const showExample = (page: Page) => page.getByRole('button', { name: 'Show me an example' });

async function expectBoardUncovered(page: Page) {
  const [board, sheet] = await page.evaluate(() =>
    ['.board-host', '.pause-sheet'].map((selector) => document.querySelector(selector)!.getBoundingClientRect().toJSON()),
  );
  expect(sheet.y).toBeGreaterThanOrEqual(board.y + board.height - 1);
  expect(sheet.y + sheet.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1);
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
}

async function storedLesson(page: Page, unit: string) {
  return page.evaluate((id) => JSON.parse(localStorage.getItem('cc.progress.v1') ?? '{}').lessons?.italian?.[id], unit);
}

test('goes from the intro through the worked example and practice to the summary', async ({ page }) => {
  await page.goto('./#/lesson/italian/free-piece');
  await expect(page.getByRole('heading', { name: 'Free pieces', level: 1 })).toBeVisible();
  await expect(page.getByText('How to spot it')).toBeVisible();
  await expect(page.locator('.lesson-spot li')).toHaveCount(3);

  await showExample(page).click();
  await expect(page.getByText('Worked example', { exact: true }).first()).toBeVisible();
  await expect(bubble(page)).toContainText('Your rook on e1 attacks the bishop on e6, and nothing guards it.');
  await expect(page.getByRole('img', { name: 'Step 1 of 3' })).toBeVisible();
  await expect(page.locator('.cm-chessboard .marker-focus')).toHaveCount(1);
  await expectBoardUncovered(page);

  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(bubble(page)).toContainText('So Rxe6+ wins it for free.');
  await expect(bubble(page)).toContainText('Your move: take the bishop.');
  await expect(page.locator('.cm-chessboard .arrow-best')).toHaveCount(1);
  await tapSquares(page, 'e1', 'e6');

  await expect(rememberCard(page)).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.pattern-label')).toHaveText('Free piece');
  await expectBoardUncovered(page);
  expect((await storedLesson(page, 'free-piece'))?.learnedAt).toBeUndefined();
  await continueButton(page).click();

  await expect(page.getByText('Practice 1 of 1')).toBeVisible();
  expect((await storedLesson(page, 'free-piece')).learnedAt).toEqual(expect.any(Number));
  await expect(page.locator('.pause-sheet .pattern-label')).toHaveText('Free piece');
  await expect(page.getByText('Play the best move on the board.')).toBeVisible();
  await expectBoardUncovered(page);
  await tapSquares(page, 'd4', 'e5');
  await expect(page.getByText('You found the move')).toBeVisible();
  await continueButton(page).click();

  await expect(page.getByRole('heading', { name: '1 of 1' })).toBeVisible();
  await expect(rememberCard(page)).toBeVisible();
  const saved = await storedLesson(page, 'free-piece');
  expect(saved.doneAt).toEqual(expect.any(Number));
  expect(saved.drills).toEqual([{ key: 'italian-1400/italian-1400-0001:3', correct: true, at: expect.any(Number) }]);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page).toHaveURL(/#\/course$/);
});

test('a wrong move on an asking step goes back, and Show me plays the move', async ({ page }) => {
  await page.goto('./#/lesson/italian/free-piece');
  await showExample(page).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(bubble(page)).toContainText('Your move: take the bishop.');

  await tapSquares(page, 'a2', 'a3');
  await expect(bubble(page)).toContainText('Not quite. Try again.');
  await page.getByRole('button', { name: 'Show me' }).click();
  await expect(rememberCard(page)).toBeVisible({ timeout: 10_000 });

  await page.getByRole('button', { name: 'Previous step' }).click();
  await expect(bubble(page)).toContainText('So Rxe6+ wins it for free.');
  await expect(page.getByRole('button', { name: 'Show me' })).toBeVisible();
});

test('a unit without practice positions goes from the example straight to the summary', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./#/lesson/italian/traps');
  await showExample(page).click();
  await expect(bubble(page)).toContainText('Nxe5 is tempting');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(bubble(page)).toContainText('Your move: play it.');
  await page.getByRole('button', { name: 'Show me' }).click();
  await expect(rememberCard(page)).toBeVisible({ timeout: 10_000 });
  await continueButton(page).click();

  await expect(page.getByText('You will meet this pattern again in your next games.')).toBeVisible();
  const saved = await storedLesson(page, 'traps');
  expect(saved).toMatchObject({ learnedAt: expect.any(Number), doneAt: expect.any(Number), drills: [] });
});

test('the back button returns to the course', async ({ page }) => {
  await page.goto('./#/lesson/italian/free-piece');
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page).toHaveURL(/#\/course$/);
});
