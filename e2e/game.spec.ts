import { expect, test, type Page, type Route } from '@playwright/test';
import {
  continueAfterPause,
  continueButton,
  lookingBackLine,
  moveList,
  pauseButton,
  playButton,
  previousKeyButton,
  stepBackButton,
  stepForwardButton,
} from './board';

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

test('the controls are three round buttons around Play, with nothing to step back to yet', async ({ page }) => {
  await page.goto(PLAY_URL);
  await expect(playButton(page)).toBeVisible();

  for (const button of [previousKeyButton(page), stepBackButton(page), stepForwardButton(page)]) {
    const box = (await button.boundingBox())!;
    expect([box.width, box.height]).toEqual([44, 44]);
    expect(await button.evaluate((el) => el.textContent)).toBe('');
  }
  await expect(previousKeyButton(page)).toBeDisabled();
  await expect(stepBackButton(page)).toBeDisabled();
  await expect(stepForwardButton(page)).toBeEnabled();
  await expect(lookingBackLine(page)).toHaveText('');
});

test('nothing moves until Play is tapped', async ({ page }) => {
  await page.goto(PLAY_URL);
  await expect(playButton(page)).toBeVisible();
  const played = await moveList(page).count();

  await page.waitForTimeout(1200);
  await expect(moveList(page)).toHaveCount(played);
});

test('the main button keeps its place when it turns into Pause', async ({ page }) => {
  await page.goto(PLAY_URL);
  const board = (await page.locator('.board-host').boundingBox())!;
  const before = (await playButton(page).boundingBox())!;
  expect(before.y).toBeGreaterThanOrEqual(board.y + board.height);
  const first = (await previousKeyButton(page).boundingBox())!;
  const last = (await stepForwardButton(page).boundingBox())!;
  expect(first.x).toBeCloseTo(16, 0);
  expect(last.x + last.width).toBeCloseTo(page.viewportSize()!.width - 16, 0);

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
  await page.getByRole('button', { name: 'Show solution' }).click();
  const played = await moveList(page).count();

  await continueAfterPause(page);
  await expect.poll(() => moveList(page).count()).toBeGreaterThanOrEqual(played + 2);
  await expect(page.getByText(FIRST_KEY_POSITION)).toBeVisible({ timeout: RUN_MS });
  await expect(page.locator('.game-pill')).toHaveText(/^Key position 2 of \d+$/);
});

test('Next move plays one scripted move per tap and walks into the first key position', async ({ page }) => {
  await page.goto(PLAY_URL);
  const played = await moveList(page).count();

  await stepForwardButton(page).click();
  await expect(moveList(page)).toHaveCount(played + 1);
  await page.waitForTimeout(1200);
  await expect(moveList(page)).toHaveCount(played + 1);

  await stepForwardButton(page).click();
  await stepForwardButton(page).click();
  await expect(page.getByText(FIRST_KEY_POSITION)).toBeVisible();
  await expect(moveList(page).last()).toHaveText('Nxe4');
});

test('after a key position the user can stop, look back, step on, continue and try it again', async ({ page }) => {
  await page.goto(PLAY_URL);
  await playButton(page).click();
  await expect(page.getByText(FIRST_KEY_POSITION)).toBeVisible({ timeout: RUN_MS });
  await page.getByRole('button', { name: "Yes, something's going on" }).click();
  await page.getByRole('button', { name: 'Show solution' }).click();
  const played = await moveList(page).count();
  await continueAfterPause(page);
  await expect.poll(() => moveList(page).count()).toBeGreaterThanOrEqual(played + 2);

  await pauseButton(page).click();
  await expect(playButton(page)).toBeVisible();
  const board = await page.locator('.board-host').boundingBox();
  await expect(lookingBackLine(page)).toHaveText('');
  await stepBackButton(page).click();
  await stepBackButton(page).click();
  const looking = lookingBackLine(page);
  await expect(looking).toHaveText(/^Move \d+ of \d+ · you are looking back$/);
  await expect(continueButton(page)).toBeVisible();
  await expect(playButton(page)).toHaveCount(0);
  expect(await page.locator('.board-host').boundingBox()).toEqual(board);
  const twoBack = await looking.textContent();
  const [, shown, total] = twoBack!.match(/^Move (\d+) of (\d+)/)!.map(Number);
  expect(shown).toBe(total - 2);

  await stepForwardButton(page).click();
  await expect(looking).toHaveText(`Move ${shown + 1} of ${total} · you are looking back`);
  await stepBackButton(page).click();
  await expect(looking).toHaveText(twoBack!);

  await continueButton(page).click();
  await expect(looking).toHaveText('');
  await expect(pauseButton(page)).toBeVisible();
  await expect.poll(() => moveList(page).count()).toBeGreaterThan(total);

  await previousKeyButton(page).click();
  await expect(page.getByText(FIRST_KEY_POSITION)).toBeVisible();
  await expect(page.locator('.game-pill')).toHaveText('Practice');
  await page.getByRole('button', { name: "Yes, something's going on" }).click();
  await page.getByRole('button', { name: 'Show solution' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.locator('.pause-sheet')).toHaveCount(0);
  await expect(continueButton(page)).toBeVisible();
  await expect(page.locator('.game-pill')).toHaveText(/^Key position 2 of \d+$/);
  const live = await moveList(page).count();
  await page.waitForTimeout(1500);
  await expect(moveList(page)).toHaveCount(live);
  await continueButton(page).click();
  await expect(pauseButton(page)).toBeVisible();
  await expect.poll(() => moveList(page).count()).toBeGreaterThan(live);
});

test('a short quiet game plays to its end and waits for Finish', async ({ page }) => {
  await playQuietGame(page, 6);
  await playButton(page).click();

  const finish = page.getByRole('button', { name: 'Finish' });
  await expect(finish).toBeVisible({ timeout: RUN_MS });
  await expect(page.getByText(/^That is the end of this game\./)).toBeVisible();
  await expect(page).not.toHaveURL(/#\/recap$/);
  await finish.click();
  await expect(page).toHaveURL(/#\/recap$/);
});
