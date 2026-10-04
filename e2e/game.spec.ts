import { expect, test, type Page, type Route } from '@playwright/test';
import {
  SPOT_QUESTION,
  coachLine,
  continueAfterPause,
  continueButton,
  moveList,
  pauseButton,
  playButton,
  previousKeyButton,
  stepBackButton,
  stepForwardButton,
  winButton,
} from './board';
import { returningPlayer } from './notes';

const PLAY_URL = './#/play/italian/1400';
const LOOKING_BACK = /^Move \d+ of \d+ · you are looking back$/;
const RUN_MS = 15_000;

test.use({ serviceWorkers: 'block' });
// The opening notes have their own checks; here the coach's line reports the game.
test.beforeEach(({ page }) => returningPlayer(page));

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
  await expect(page.locator('.game-sub')).toHaveText(/^Key positions · 0 of \d+$/);
  await expect(page.locator('.game-player.is-opponent')).toContainText('Black1400');
  await expect(page.getByText('You', { exact: true })).toBeVisible();
  await expect(moveList(page).last()).toHaveText(/Bc4$/);
  await expect(moveList(page).last()).toHaveAttribute('aria-current', 'step');
  await expect(page.locator('.cm-chessboard .piece')).toHaveCount(32);
  await expect(coachLine(page)).toHaveText("Press Play and I'll stop at the next key position.");

  // The board fills the width inside the 16px gutters when the screen is tall enough, and stays centred when it is not.
  const { width, height } = page.viewportSize()!;
  const board = (await page.locator('.board-host').boundingBox())!;
  expect(board.width).toBeLessThanOrEqual(width - 32);
  expect(board.x).toBeCloseTo((width - board.width) / 2, 0);
  if (height >= 740) expect(board.width).toBeCloseTo(width - 32, 0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
  const back = (await page.getByRole('button', { name: 'Back' }).boundingBox())!;
  expect([back.width, back.height]).toEqual([44, 44]);
  const dock = (await page.locator('.dock').boundingBox())!;
  expect(dock.y + dock.height).toBeCloseTo(height, 0);
});

test('the dock has two round buttons around Play and a quiet row above, with nothing to step back to yet', async ({ page }) => {
  await page.goto(PLAY_URL);
  await expect(playButton(page)).toBeVisible();

  for (const button of [stepBackButton(page), stepForwardButton(page)]) {
    const box = (await button.boundingBox())!;
    expect([box.width, box.height]).toEqual([52, 52]);
    expect(await button.evaluate((el) => el.textContent)).toBe('');
  }
  await expect(previousKeyButton(page)).toHaveText('Previous key position');
  await expect(previousKeyButton(page)).toBeDisabled();
  await expect(previousKeyButton(page)).toHaveCSS('opacity', '0.4');
  await expect(page.getByRole('button', { name: 'Analyse', exact: true })).toBeEnabled();
  await expect(stepBackButton(page)).toBeDisabled();
  await expect(stepForwardButton(page)).toBeEnabled();
  await expect(coachLine(page)).not.toHaveText(LOOKING_BACK);
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
  const first = (await stepBackButton(page).boundingBox())!;
  const last = (await stepForwardButton(page).boundingBox())!;
  expect(first.x).toBeCloseTo(16, 0);
  expect(last.x + last.width).toBeCloseTo(page.viewportSize()!.width - 16, 0);

  await playButton(page).click();
  await expect(pauseButton(page)).toBeVisible();
  // Read once the press has sprung back.
  await expect.poll(() => pauseButton(page).boundingBox()).toEqual(before);
  expect(await page.locator('.board-host').boundingBox()).toEqual(board);
});

test('Play moves both sides up to the first key position without a tap on the board', async ({ page }) => {
  await page.goto(PLAY_URL);
  await playButton(page).click();

  await expect(page.getByText(SPOT_QUESTION)).toBeVisible({ timeout: RUN_MS });
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
  await expect(page.getByText(SPOT_QUESTION)).toHaveCount(0);

  await playButton(page).click();
  await expect(pauseButton(page)).toBeVisible();
  await expect.poll(() => moveList(page).count()).toBeGreaterThan(played);
  await expect(page.getByText(SPOT_QUESTION)).toBeVisible({ timeout: RUN_MS });
});

test('after a key position the game plays on by itself to the next one', async ({ page }) => {
  await page.goto(PLAY_URL);
  await playButton(page).click();
  await expect(page.getByText(SPOT_QUESTION)).toBeVisible({ timeout: RUN_MS });
  await winButton(page).click();
  await page.getByRole('button', { name: 'Show solution' }).click();
  const played = await moveList(page).count();

  await continueAfterPause(page);
  await expect(moveList(page).filter({ hasText: /dxe5$/ }).getByRole('img', { name: 'Missed' })).toBeVisible();
  await expect.poll(() => moveList(page).count()).toBeGreaterThanOrEqual(played + 2);
  await expect(page.getByText(SPOT_QUESTION)).toBeVisible({ timeout: RUN_MS });
  await expect(page.locator('.game-sub')).toHaveText(/^Key position 2 of \d+$/);
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
  await expect(page.getByText(SPOT_QUESTION)).toBeVisible();
  await expect(moveList(page).last()).toHaveText('Nxe4');
});

test('after a key position the user can stop, look back, step on, continue and try it again', async ({ page }) => {
  await page.goto(PLAY_URL);
  await playButton(page).click();
  await expect(page.getByText(SPOT_QUESTION)).toBeVisible({ timeout: RUN_MS });
  await winButton(page).click();
  await page.getByRole('button', { name: 'Show solution' }).click();
  const played = await moveList(page).count();
  await continueAfterPause(page);
  await expect.poll(() => moveList(page).count()).toBeGreaterThanOrEqual(played + 2);

  await pauseButton(page).click();
  await expect(playButton(page)).toBeVisible();
  const board = await page.locator('.board-host').boundingBox();
  await expect(coachLine(page)).not.toHaveText(LOOKING_BACK);
  await stepBackButton(page).click();
  await stepBackButton(page).click();
  const looking = coachLine(page);
  await expect(looking).toHaveText(LOOKING_BACK);
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
  await expect(looking).not.toHaveText(LOOKING_BACK);
  await expect(pauseButton(page)).toBeVisible();
  await expect.poll(() => moveList(page).count()).toBeGreaterThan(total);

  await previousKeyButton(page).click();
  await expect(page.getByText(SPOT_QUESTION)).toBeVisible();
  await expect(page.locator('.game-sub')).toHaveText('Practice');
  await winButton(page).click();
  await page.getByRole('button', { name: 'Show solution' }).click();
  await continueButton(page).click();

  await expect(page.locator('.pause-sheet')).toHaveCount(0);
  await expect(continueButton(page)).toBeVisible();
  await expect(page.locator('.game-sub')).toHaveText(/^Key positions · 1 of \d+$/);
  const live = await moveList(page).count();
  await page.waitForTimeout(1500);
  await expect(moveList(page)).toHaveCount(live);
  await continueButton(page).click();
  await expect(pauseButton(page)).toBeVisible();
  await expect.poll(() => moveList(page).count()).toBeGreaterThan(live);
});

test('leaving a game keeps its place: it opens again at the key position left, with the first answer kept', async ({ page }) => {
  await page.goto(PLAY_URL);
  await playButton(page).click();
  await expect(page.getByText(SPOT_QUESTION)).toBeVisible({ timeout: RUN_MS });
  await winButton(page).click();
  await page.getByRole('button', { name: 'Show solution' }).click();
  await continueAfterPause(page);
  await expect(page.locator('.game-sub')).toHaveText(/^Key position 2 of \d+$/, { timeout: RUN_MS });
  await expect(page.getByText(SPOT_QUESTION)).toBeVisible();
  const played = await moveList(page).count();

  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('link', { name: 'Continue your game instead' }).click();

  await expect(page.getByText(SPOT_QUESTION)).toBeVisible();
  await expect(page.locator('.game-sub')).toHaveText(/^Key position 2 of \d+$/);
  await expect(moveList(page)).toHaveCount(played);
  // The second key position also wins material; the move strip shows once it is answered.
  await winButton(page).click();
  await page.getByRole('button', { name: 'Show solution' }).click();
  await continueAfterPause(page);
  await expect(moveList(page).filter({ hasText: /dxe5$/ }).getByRole('img', { name: 'Missed' })).toBeVisible();
  await expect(page.locator('.game-sub')).toHaveText(/^Key positions · 2 of \d+$/);
});

test('the player ahead in material shows by how much', async ({ page }) => {
  await playQuietGame(page, 3);
  await playButton(page).click();
  await expect(page.getByRole('button', { name: 'Finish' })).toBeVisible({ timeout: RUN_MS });
  // 3...Nxe4 took a pawn: Black is a point up.
  const lead = page.locator('.game-player.is-opponent .game-lead');
  await expect(lead).toContainText('Up');
  await expect(lead.locator('.roll-in')).toHaveText('1');
  await expect(lead.locator('.sr-only')).toHaveText('Black is ahead by 1 point of material');
  await expect(page.locator('.game-player.is-you .game-lead')).toBeHidden();
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
