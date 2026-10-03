import { expect, test, type Page } from '@playwright/test';
import { SPOT_QUESTION, continueAfterPause, moveList, playButton, tapSquares, winButton } from './board';
import { returningPlayer } from './notes';

test.use({ serviceWorkers: 'block' });
// These tests are about key positions: opening notes would stop autoplay on the way there.
test.beforeEach(({ page }) => returningPlayer(page));
// The engine's first load and a few searches of about a second each.
test.setTimeout(120_000);

const ENGINE_LOAD_MS = 25_000;
const SEARCH_MS = 10_000;
/** A score as the rows write it: "Best", "Played", "+0.3", "−1.8", "mate in 3", or nothing when the reason says it. */
const ROW_SCORE = /^(Best|Played|[+−]\d+\.\d|0\.0|mate in \d+|)$/;

const caption = (page: Page) => page.locator('.stepper-caption');
const rows = (page: Page) => page.locator('.analysis-row');
const barLabel = (page: Page) => page.locator('.eval-bar-label');

/** Stage 1, reduced motion: the reveal stops on the line's first move, 5. dxe5. */
async function reachReveal(page: Page) {
  await page.addInitScript(() => localStorage.setItem('cc.settings.v1', JSON.stringify({ depthOverride: 1 })));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./#/play/italian/1400');
  await playButton(page).click();
  await expect(page.getByText(SPOT_QUESTION)).toBeVisible({ timeout: 15_000 });
  await winButton(page).click();
  await page.getByRole('button', { name: 'Show solution' }).click();
  await expect(page.getByText('Missed it')).toBeVisible();
  await expect(caption(page)).toContainText('5. dxe5');
}

async function expectRows(page: Page, count = 3, timeout = SEARCH_MS) {
  await expect(rows(page)).toHaveCount(count, { timeout });
  for (const score of await page.locator('.analysis-score').allTextContents()) expect(score).toMatch(ROW_SCORE);
}

async function expectBoardUncovered(page: Page) {
  // Both boxes from one frame: the board may be resizing to the answer layout.
  const [board, sheet] = await page.evaluate(() =>
    ['.board-host', '.pause-sheet'].map((selector) => document.querySelector(selector)!.getBoundingClientRect().toJSON()),
  );
  expect(sheet.y).toBeGreaterThanOrEqual(board.y + board.height - 1);
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
}

test('why this move: the engine weighs the line move against two others, then judges a move for each side', async ({ page }) => {
  await reachReveal(page);

  const asked = Date.now();
  await page.getByRole('button', { name: 'Why this move?' }).click();
  await expect(rows(page).first()).toContainText('dxe5', { timeout: ENGINE_LOAD_MS });
  await expectRows(page);
  test.info().annotations.push({ type: 'first answer, engine load included', description: `${Date.now() - asked} ms` });

  await expect(rows(page).first()).toHaveClass(/is-ref/);
  await expect(page.locator('.cm-chessboard .arrow-best')).toHaveCount(1);
  await expect(page.locator('.cm-chessboard .arrow-mistake')).toHaveCount(2);
  await expect(barLabel(page)).toHaveText(/^([+−]\d+\.\d|0\.0|M\d+)$/);
  await expect(caption(page)).toContainText('dxe5');
  await expect(page.getByRole('button', { name: 'Watch again' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible();
  await expectBoardUncovered(page);

  // White gives up the bishop instead: the bar moves and the verdict measures it against dxe5.
  const before = await barLabel(page).textContent();
  const moved = Date.now();
  await tapSquares(page, 'c4', 'f7');
  await expect(caption(page)).toHaveText(/^(5\. Bxf7\+ .*dxe5|The engine rates 5\. Bxf7\+ .*dxe5)/, { timeout: SEARCH_MS });
  test.info().annotations.push({ type: 'verdict after a move', description: `${Date.now() - moved} ms` });
  await expect(barLabel(page)).not.toHaveText(before!);
  // In check, Black has only two moves.
  await expectRows(page, 2);

  // Then Black answers, and gets a verdict of its own against the engine's best.
  await tapSquares(page, 'e8', 'f7');
  await expect(caption(page)).toHaveText(/5… Kxf7 (is|allows|mates)|The engine rates 5… Kxf7/, { timeout: SEARCH_MS });
  await expectRows(page);

  await page.getByRole('button', { name: 'Previous move' }).click();
  await expect(caption(page)).toContainText('5. Bxf7+');
  await page.getByRole('button', { name: 'Reset' }).click();
  await expect(caption(page)).toContainText('dxe5');

  await page.getByRole('button', { name: 'Back to the line' }).click();
  await expect(caption(page)).toContainText('5. dxe5');
  await expect(page.locator('.eval-bar')).toBeHidden();
  await expect(page.locator('.cm-chessboard .arrow-mistake')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Watch again' })).toBeVisible();

  await continueAfterPause(page);
  await expect(moveList(page).filter({ hasText: /dxe5$/ })).toBeVisible();
});

test('a tapped row plays its line on the board, and the position comes back after', async ({ page }) => {
  await reachReveal(page);
  await page.getByRole('button', { name: 'Why this move?' }).click();
  await expectRows(page, 3, ENGINE_LOAD_MS);

  const alternative = rows(page).nth(1);
  const san = (await alternative.locator('.analysis-san').textContent())!;
  await alternative.click();
  await expect(alternative).toHaveAttribute('aria-pressed', 'true');
  await expect(caption(page)).toContainText(`5. ${san}`);
  await expect(page.getByRole('button', { name: 'Back to the line' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Back to the position' }).click();
  await expect(caption(page)).toContainText('dxe5');
  await expect(page.locator('.cm-chessboard .arrow-mistake')).toHaveCount(2);
});

test('continuing from the engine view hands the board back clean', async ({ page }) => {
  await reachReveal(page);
  await page.getByRole('button', { name: 'Why this move?' }).click();
  await expectRows(page, 3, ENGINE_LOAD_MS);
  await continueAfterPause(page);
  await expect(page.locator('.eval-bar')).toBeHidden();
  await expect(page.locator('.cm-chessboard .arrow-best, .cm-chessboard .arrow-mistake')).toHaveCount(0);
});

test('Analyse on the game screen opens the engine on the board and Done puts the game back', async ({ page }) => {
  await page.goto('./#/play/italian/1400');
  await expect(playButton(page)).toBeVisible();
  const pieces = await page.locator('.cm-chessboard .piece').count();

  await page.getByRole('button', { name: 'Analyse', exact: true }).click();
  // A thin bar runs while the engine thinks, then the lines fade in one after another.
  await expect(page.locator('.analysis-progress')).toBeVisible();
  await expectRows(page, 3, ENGINE_LOAD_MS);
  await expect(rows(page).nth(2)).toHaveCSS('animation-delay', '0.1s');
  await expect(barLabel(page)).not.toBeEmpty();
  await expectBoardUncovered(page);

  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(playButton(page)).toBeVisible();
  await expect(page.locator('.eval-bar')).toBeHidden();
  await expect(page.locator('.cm-chessboard .piece')).toHaveCount(pieces);
});
