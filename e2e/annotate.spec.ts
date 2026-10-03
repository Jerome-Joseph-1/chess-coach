import { expect, test, type Page } from '@playwright/test';
import { boardSquares, moveList, playButton, winButton } from './board';
import { returningPlayer } from './notes';

test.use({ serviceWorkers: 'block' });
// These tests are about key positions: opening notes would stop autoplay on the way there.
test.beforeEach(({ page }) => returningPlayer(page));

async function openBoard(page: Page) {
  await page.goto('./#/play/italian/1400');
  await expect(playButton(page)).toBeVisible();
  await expect(page.locator('.cm-chessboard .piece')).toHaveCount(32);
  return boardSquares(page);
}

async function rightDrag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up({ button: 'right' });
}

test('a right-drag draws an arrow, drawing it again removes it, a left click clears', async ({ page }) => {
  const at = await openBoard(page);
  const arrows = page.locator('.cm-chessboard .arrow-draw-green');

  await rightDrag(page, at('b1'), at('c3'));
  await expect(arrows).toHaveCount(1);
  await rightDrag(page, at('b1'), at('c3'));
  await expect(arrows).toHaveCount(0);

  await rightDrag(page, at('b1'), at('c3'));
  await rightDrag(page, at('g1'), at('f3'));
  await expect(arrows).toHaveCount(2);
  await page.mouse.click(at('a4').x, at('a4').y);
  await expect(arrows).toHaveCount(0);
});

test('modifier keys pick the colour and a right-click on one square draws a circle', async ({ page }) => {
  const at = await openBoard(page);

  await page.keyboard.down('Shift');
  await rightDrag(page, at('d2'), at('d4'));
  await page.keyboard.up('Shift');
  await expect(page.locator('.cm-chessboard .arrow-draw-red')).toHaveCount(1);

  await page.mouse.move(at('e4').x, at('e4').y);
  await page.mouse.down({ button: 'right' });
  await page.mouse.up({ button: 'right' });
  await expect(page.locator('.cm-chessboard .marker-draw-green')).toHaveCount(1);
});

test('drawings do not block moving a piece, and playing a move clears them', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('cc.settings.v1', JSON.stringify({ depthOverride: 3 })));
  await page.goto('./#/play/italian/1400');
  await playButton(page).click();
  await winButton(page).click();
  await expect(page.getByText('Your move', { exact: true })).toBeVisible();
  const at = await boardSquares(page);

  const drawn = page.locator('.cm-chessboard .arrow-draw-green');
  await rightDrag(page, at('b1'), at('c3'));
  await expect(drawn).toHaveCount(1);
  await page.mouse.click(at('d4').x, at('d4').y);
  await expect(page.locator('.cm-chessboard .marker-dot').first()).toBeVisible();
  await page.mouse.click(at('e5').x, at('e5').y);
  await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible();
  await expect(drawn).toHaveCount(0);
  await expect(moveList(page).last()).not.toHaveText('');
});
