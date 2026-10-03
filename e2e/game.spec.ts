import { expect, test, type Page, type Route } from '@playwright/test';
import { boardSquares, tapSquares } from './board';

const PLAY_URL = './#/play/italian/1400';

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

const moves = (page: Page) => page.locator('.game-moves li');
const yourMove = (page: Page) => page.getByText('Your move', { exact: true });

test('shows the game screen at phone width', async ({ page }) => {
  await page.goto(PLAY_URL);
  await expect(yourMove(page)).toBeVisible();

  await expect(page.getByRole('heading', { name: 'Italian Game' })).toBeVisible();
  await expect(page.locator('.game-pill')).toHaveText(/^Key position 1 of \d+$/);
  await expect(page.getByText('Rated 1400')).toBeVisible();
  await expect(page.getByText('Black', { exact: true })).toBeVisible();
  await expect(page.getByText('You', { exact: true })).toBeVisible();
  await expect(moves(page).last()).toHaveText('Nf6');
  await expect(page.locator('.cm-chessboard .piece')).toHaveCount(32);

  const width = page.viewportSize()!.width;
  expect((await page.locator('.board-host').boundingBox())!.width).toBeCloseTo(width - 32, 0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const back = (await page.getByRole('button', { name: 'Back' }).boundingBox())!;
  expect([back.width, back.height]).toEqual([40, 40]);
});

test('a tap shows the legal moves and a scripted move is kept', async ({ page }) => {
  await page.goto(PLAY_URL);
  await expect(yourMove(page)).toBeVisible();
  const at = await boardSquares(page);

  await page.touchscreen.tap(at('d2').x, at('d2').y);
  await expect(page.locator('.cm-chessboard .marker-dot')).toHaveCount(2);
  await page.touchscreen.tap(at('d4').x, at('d4').y);

  await expect(page.getByText('Black is thinking…')).toBeVisible();
  await expect(moves(page).last()).toHaveText('Nxe4');
  await expect(moves(page).nth(-2)).toHaveText(/d4$/);
  await expect(page.locator('.cm-chessboard .marker-last-move')).toHaveCount(2);
});

test('a drag moves a piece too', async ({ page }) => {
  await page.goto(PLAY_URL);
  await expect(yourMove(page)).toBeVisible();
  const at = await boardSquares(page);

  await page.mouse.move(at('d2').x, at('d2').y);
  await page.mouse.down();
  await page.mouse.move(at('d4').x, at('d4').y, { steps: 6 });
  await page.mouse.up();

  await expect(moves(page).last()).toHaveText('Nxe4');
});

test('another move goes back and a losing move can be shown', async ({ page }) => {
  await playQuietGame(page);
  await expect(yourMove(page)).toBeVisible();

  await tapSquares(page, 'd2', 'd3');
  await expect(yourMove(page)).toBeVisible();
  await expect(moves(page).last()).toHaveText('Nf6');
  await expect(page.getByRole('button', { name: 'Show me' })).toHaveCount(0);

  await tapSquares(page, 'd2', 'd4');
  await expect(moves(page).last()).toHaveText('Nxe4');
  await expect(yourMove(page)).toBeVisible();
  await tapSquares(page, 'd4', 'e5');
  await expect(moves(page).last()).toHaveText('d6');
  await expect(yourMove(page)).toBeVisible();

  await tapSquares(page, 'f3', 'g5');
  await expect(moves(page).last()).toHaveText('d6');
  const showMe = page.getByRole('button', { name: 'Show me' });
  await showMe.click();
  await expect(showMe).toHaveCount(0);

  await page.getByRole('button', { name: 'Back to my move' }).click();
  await expect(yourMove(page)).toBeVisible();
  await expect(showMe).toBeVisible();
  await expect(page.locator('.cm-chessboard .piece')).toHaveCount(30);
  await expect(page.locator('.cm-chessboard .marker-last-move')).toHaveCount(2);
});

test('a short quiet game runs to the recap', async ({ page }) => {
  await playQuietGame(page, 6);
  await expect(yourMove(page)).toBeVisible();

  await tapSquares(page, 'd2', 'd4');
  await expect(yourMove(page)).toBeVisible();
  await tapSquares(page, 'd4', 'e5');
  await expect(yourMove(page)).toBeVisible();
  await tapSquares(page, 'e1', 'g1');

  await expect(page).toHaveURL(/#\/recap$/);
});
