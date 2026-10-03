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
