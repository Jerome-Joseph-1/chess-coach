import { expect, test, type Page, type Route } from '@playwright/test';
import { continueAfterPause, moveList, pauseButton, playButton } from './board';

const PLAY_URL = './#/play/italian/1400';
const FIRST_KEY_POSITION = 'Is something important happening?';
const RUN_MS = 15_000;

test.use({ serviceWorkers: 'block' });

/** Serves the fixture set with no pauses, optionally cut to its first `plies` moves, so the game runs unprompted. */
async function playQuietGame(page: Page, plies = Infinity) {
  const serve = async (route: Route, edit: (data: any) => void) => {
    const data = await (await route.fetch()).json();
    edit(data);
    await route.fulfill({ json: data });
  };
  await page.route('**/content/italian-1400/index.json', (route) =>
    serve(route, (set) => set.games.forEach((g: any) => (g.moves = g.moves.slice(0, plies)))),
  );
  await page.route('**/content/italian-1400/games/*.json', (route) =>
    serve(route, (game) => {
      game.moves = game.moves.slice(0, plies);
      game.turns = game.turns.filter((t: any) => t.ply < plies).map((t: any) => ({ ...t, label: 'gray' }));
    }),
  );
  await page.goto(PLAY_URL);
}

test('shows the game screen at phone width, waiting for play', async ({ page }) => {
  await page.goto(PLAY_URL);
  await expect(playButton(page)).toBeVisible();

  await expect(page.getByRole('heading', { name: 'Italian Game' })).toBeVisible();
  await expect(page.locator('.game-pill')).toHaveText(/^Key position 1 of \d+$/);
  await expect(page.getByText('Rated 1400')).toBeVisible();
  await expect(page.getByText('Black', { exact: true })).toBeVisible();
  await expect(page.getByText('You', { exact: true })).toBeVisible();
  await expect(moveList(page).last()).toHaveText(/Bc4$/);
  await expect(page.locator('.cm-chessboard .piece')).toHaveCount(32);

  const width = page.viewportSize()!.width;
  expect((await page.locator('.board-host').boundingBox())!.width).toBeCloseTo(width - 32, 0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
  const back = (await page.getByRole('button', { name: 'Back' }).boundingBox())!;
  expect([back.width, back.height]).toEqual([40, 40]);
});

test('nothing moves until Play is tapped', async ({ page }) => {
  await page.goto(PLAY_URL);
  await expect(playButton(page)).toBeVisible();
  const played = await moveList(page).count();

  await page.waitForTimeout(1200);
  await expect(moveList(page)).toHaveCount(played);
});

test('the pill keeps its place when it turns into Pause', async ({ page }) => {
  await page.goto(PLAY_URL);
  const board = (await page.locator('.board-host').boundingBox())!;
  const before = (await playButton(page).boundingBox())!;
  expect(before.y).toBeGreaterThanOrEqual(board.y + board.height);
  expect(before.width).toBeCloseTo(page.viewportSize()!.width - 32, 0);

  await playButton(page).click();
  await expect(pauseButton(page)).toBeVisible();
  expect(await pauseButton(page).boundingBox()).toEqual(before);
  expect(await page.locator('.board-host').boundingBox()).toEqual(board);
});

test('Play moves both sides up to the first key position without a tap on the board', async ({ page }) => {
  await page.goto(PLAY_URL);
  await playButton(page).click();

  await expect(page.getByText(FIRST_KEY_POSITION)).toBeVisible({ timeout: RUN_MS });
  await expect(moveList(page).last()).toHaveText('Nxe4');
  await expect(moveList(page).nth(-2)).toHaveText(/d4$/);
  await expect(playButton(page)).toHaveCount(0);
  await expect(pauseButton(page)).toHaveCount(0);
});

test('Pause stops the moves and Play carries on from there', async ({ page }) => {
  await page.goto(PLAY_URL);
  await playButton(page).click();
  await pauseButton(page).click();
  await expect(playButton(page)).toBeVisible();

  const played = await moveList(page).count();
  await page.waitForTimeout(1500);
  await expect(moveList(page)).toHaveCount(played);
  await expect(page.getByText(FIRST_KEY_POSITION)).toHaveCount(0);

  await playButton(page).click();
  await expect(pauseButton(page)).toBeVisible();
  await expect.poll(() => moveList(page).count()).toBeGreaterThan(played);
  await expect(page.getByText(FIRST_KEY_POSITION)).toBeVisible({ timeout: RUN_MS });
});

test('after a key position the game plays on by itself to the next one', async ({ page }) => {
  await page.goto(PLAY_URL);
  await playButton(page).click();
  await expect(page.getByText(FIRST_KEY_POSITION)).toBeVisible({ timeout: RUN_MS });
  await page.getByRole('button', { name: "Yes, something's going on" }).click();
  const played = await moveList(page).count();

  await continueAfterPause(page);
  await expect.poll(() => moveList(page).count()).toBeGreaterThanOrEqual(played + 2);
  await expect(page.getByText(FIRST_KEY_POSITION)).toBeVisible({ timeout: RUN_MS });
  await expect(page.locator('.game-pill')).toHaveText(/^Key position 2 of \d+$/);
});

test('a short quiet game runs to the recap', async ({ page }) => {
  await playQuietGame(page, 6);
  await playButton(page).click();

  await expect(page).toHaveURL(/#\/recap$/, { timeout: RUN_MS });
});
