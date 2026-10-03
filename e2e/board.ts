import { expect, type Page } from '@playwright/test';

export async function boardSquares(page: Page) {
  const box = (await page.locator('.board-host').boundingBox())!;
  const size = box.width / 8;
  return (square: string) => ({
    x: box.x + (square.charCodeAt(0) - 97 + 0.5) * size,
    y: box.y + (8 - Number(square[1]) + 0.5) * size,
  });
}

export async function tapSquare(page: Page, square: string) {
  const at = await boardSquares(page);
  await page.touchscreen.tap(at(square).x, at(square).y);
}

export async function tapSquares(page: Page, from: string, to: string) {
  const at = await boardSquares(page);
  // The board ignores a pick-up while a piece is still sliding, so tap again until the legal moves show.
  await expect(async () => {
    await page.touchscreen.tap(at(from).x, at(from).y);
    await expect(page.locator('.cm-chessboard .marker-dot').first()).toBeVisible({ timeout: 400 });
  }).toPass();
  await page.touchscreen.tap(at(to).x, at(to).y);
}

export const playButton = (page: Page) => page.getByRole('button', { name: 'Play', exact: true });
export const pauseButton = (page: Page) => page.getByRole('button', { name: 'Pause', exact: true });
export const moveList = (page: Page) => page.locator('.game-moves li');

/** Taps Continue on a key position's sheet and waits for the game to move on by itself. */
export async function continueAfterPause(page: Page) {
  const played = await moveList(page).count();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(moveList(page).nth(played)).toBeVisible();
}
