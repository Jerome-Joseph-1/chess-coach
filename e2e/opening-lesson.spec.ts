import { expect, test, type Page } from '@playwright/test';
import { continueButton, rememberCard, tapSquares } from './board';

// The test course's slow plan lesson: its example is Bb3 at ply 13 of game 0002, its practice d3 at ply 11,
// where Ne2 holds as well but is not the plan.
test.use({ serviceWorkers: 'block' });

const bubble = (page: Page) => page.locator('.coach-bubble').first();
const pieceOn = (page: Page, square: string) => page.locator(`.cm-chessboard .pieces g[data-square='${square}']`);

test('teaches the slow plan: intro, worked example, practice that asks for the plan move, summary', async ({ page }) => {
  await page.goto('./#/lesson/italian/italian-slow');
  await expect(page.getByRole('heading', { name: 'The slow plan', level: 1 })).toBeVisible();
  await expect(page.getByText('How to play it')).toBeVisible();
  await expect(page.locator('.lesson-spot li')).toHaveCount(3);

  await page.getByRole('button', { name: 'Show me an example' }).click();
  await expect(bubble(page)).toContainText("Your pawn on e4 and Black's pawn on e5 block each other.");
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(bubble(page)).toContainText('Here the plan is to put your bishop on b3.');
  await expect(bubble(page)).toContainText('Your move: play it.');
  await tapSquares(page, 'c4', 'b3');
  await expect(bubble(page)).toContainText('from b3 it still aims at f7', { timeout: 10_000 });
  await expect(page.locator('.cm-chessboard .arrow-best')).toHaveCount(1);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(rememberCard(page)).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.pattern-label')).toHaveText('The slow plan');
  await continueButton(page).click();

  await expect(page.getByText('Practice 1 of 1')).toBeVisible();
  await expect(page.getByText('Your move: play the slow plan.')).toBeVisible();
  await tapSquares(page, 'c3', 'e2');
  await expect(page.getByText(/^Good move, but the plan here is/)).toBeVisible();
  await expect(pieceOn(page, 'c3')).toHaveAttribute('data-piece', 'wn');
  await expect(pieceOn(page, 'e2')).toHaveCount(0);
  await tapSquares(page, 'd2', 'd3');
  await expect(page.getByText('You found the move')).toBeVisible();
  await continueButton(page).click();

  await expect(page.getByRole('heading', { name: '1 of 1' })).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('cc.progress.v1')!).lessons.italian['italian-slow']);
  expect(saved.drills).toEqual([{ key: 'italian-1400/italian-1400-0002:11', correct: true, at: expect.any(Number) }]);
});
