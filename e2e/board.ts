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

/** Which square a board mark sits on, from where it is drawn. */
export async function squareOf(page: Page, selector: string): Promise<string> {
  const board = (await page.locator('.board-host').boundingBox())!;
  const mark = (await page.locator(selector).first().boundingBox())!;
  const size = board.width / 8;
  const file = Math.floor((mark.x + mark.width / 2 - board.x) / size);
  const rank = 8 - Math.floor((mark.y + mark.height / 2 - board.y) / size);
  return `${String.fromCharCode(97 + file)}${rank}`;
}

export const playButton = (page: Page) => page.getByRole('button', { name: 'Play', exact: true });
export const pauseButton = (page: Page) => page.getByRole('button', { name: 'Pause', exact: true });
export const continueButton = (page: Page) => page.getByRole('button', { name: 'Continue', exact: true });
export const stepBackButton = (page: Page) => page.getByRole('button', { name: 'Previous move' });
export const stepForwardButton = (page: Page) => page.getByRole('button', { name: 'Next move' });
export const previousKeyButton = (page: Page) => page.getByRole('button', { name: 'Previous key position' });
export const yesButton = (page: Page) => page.getByRole('button', { name: 'Yes', exact: true });
export const noButton = (page: Page) => page.getByRole('button', { name: 'No', exact: true });
export const hintButton = (page: Page) => page.getByRole('button', { name: /^Hint · \d of \d$/ });
export const moveList = (page: Page) => page.locator('.game-moves .game-move');
/** The coach's line under the board, which also says when the board shows an earlier move. */
export const coachLine = (page: Page) => page.locator('.coach-line p');
/** The coach's speech bubble during a key position. */
export const coachBubble = (page: Page) => page.locator('.pause-sheet .coach-bubble');
export const rememberCard = (page: Page) => page.locator('.remember-card');

/** Taps Continue on a key position's panel and waits for the game to move on by itself. */
export async function continueAfterPause(page: Page) {
  const played = await moveList(page).count();
  await continueButton(page).click();
  await expect(moveList(page).nth(played)).toBeVisible();
}
