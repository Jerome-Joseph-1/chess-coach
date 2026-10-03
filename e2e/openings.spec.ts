import { expect, test, type Page, type Route } from '@playwright/test';
import { coachLine, playButton } from './board';

const PLAY_URL = './#/play/italian/1400';
const START_NOTE = 'italian:e4 e5 Nf3 Nc6 Bc4';
const WAITING = "Press Play and I'll stop at the next key position.";
const RUN_MS = 15_000;

test.use({ serviceWorkers: 'block' });

const noteName = (page: Page) => page.locator('.coach-line-name');

async function seedNotesSeen(page: Page, notesSeen: Record<string, number>) {
  await page.addInitScript((seen) => localStorage.setItem('cc.progress.v1', JSON.stringify({ v: 1, notesSeen: seen })), notesSeen);
}

const seenCount = (page: Page, id: string) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem('cc.progress.v1') ?? '{}').notesSeen?.[key] ?? 0, id);

/** Serves the fixture game with no key positions, so autoplay runs through the opening unprompted. */
async function playQuietGame(page: Page) {
  const serve = async (route: Route, edit: (data: any) => void) => {
    const data = await (await route.fetch()).json();
    edit(data);
    await route.fulfill({ json: data });
  };
  await page.route('**/content/italian-1400/games/*.json', (route) =>
    serve(route, (game) => {
      game.turns = game.turns.map((t: any) => ({ ...t, label: 'gray' }));
    }),
  );
  await page.goto(PLAY_URL);
}

test('the opening position is explained under the name of the opening, and counted once', async ({ page }) => {
  await page.goto(PLAY_URL);
  await expect(playButton(page)).toBeVisible();
  await expect(noteName(page)).toHaveText('Italian Game');
  await expect(coachLine(page)).toHaveText(/^3\.Bc4 aims the bishop at f7/);
  expect(await seenCount(page, START_NOTE)).toBe(1);
});

test('autoplay stops on a new note, and Continue plays on to the next one', async ({ page }) => {
  await playQuietGame(page);
  await playButton(page).click();
  await expect(noteName(page)).toHaveText('Two Knights Defence', { timeout: RUN_MS });
  await expect(coachLine(page)).toHaveText(/^3\.\.\.Nf6 hits e4/);
  // The game waits for the user to read it, with the button to press ringed.
  const main = page.locator('.game-main');
  await expect(main).toHaveText('Continue');
  await expect(main).toHaveClass(/is-nudge/);
  expect(await seenCount(page, 'two-knights')).toBe(1);
  await main.click();
  await expect(noteName(page)).toHaveText('Two Knights: 4.d4', { timeout: RUN_MS });
  await expect(coachLine(page)).toHaveText(/^4\.d4 opens the centre/);
  await expect(main).toHaveText('Continue');
});

test('a note read once is shown in full a second time', async ({ page }) => {
  await seedNotesSeen(page, { [START_NOTE]: 1 });
  await page.goto(PLAY_URL);
  await expect(coachLine(page)).toHaveText(/^3\.Bc4 aims the bishop at f7/);
  expect(await seenCount(page, START_NOTE)).toBe(2);
});

test('after two viewings only the name of the variation shows, over the usual line', async ({ page }) => {
  await seedNotesSeen(page, { [START_NOTE]: 2 });
  await page.goto(PLAY_URL);
  await expect(playButton(page)).toBeVisible();
  await expect(noteName(page)).toHaveText('Italian Game');
  await expect(coachLine(page)).toHaveText(WAITING);
  expect(await seenCount(page, START_NOTE)).toBe(2);
  // The name and the line fit the panel: your player bar stays in view.
  await expect(page.locator('.game-panel')).not.toHaveClass(/has-note/);
  await expect(page.locator('.game-player.is-you')).toBeInViewport();
});

test('a note takes at most three lines and never covers the board or the dock', async ({ page }) => {
  await page.goto(PLAY_URL);
  await expect(coachLine(page)).toHaveText(/^3\.Bc4/);
  // Let the panel settle into its place over the player bar.
  await page.waitForTimeout(500);
  const board = (await page.locator('.board-host').boundingBox())!;
  const panel = (await page.locator('.game-panel').boundingBox())!;
  const dock = (await page.locator('.game-slot > .dock').boundingBox())!;
  const note = (await coachLine(page).boundingBox())!;
  const lineHeight = await coachLine(page).evaluate((p) => parseFloat(getComputedStyle(p).lineHeight));
  expect(panel.y).toBeGreaterThanOrEqual(board.y + board.height - 0.5);
  expect(note.y + note.height).toBeLessThanOrEqual(dock.y + 0.5);
  expect(Math.round(note.height / lineHeight)).toBeLessThanOrEqual(3);
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
});

test('the Course tab lists the variations met with their plans', async ({ page }) => {
  await page.goto('./#/course');
  const section = page.getByRole('region', { name: 'Variations met' });
  await expect(section).toContainText('Play a few games to meet the main lines.');

  await seedNotesSeen(page, { 'two-knights-ng5': 2, 'giuoco-piano-c3': 1, 'two-knights-ng5:d5': 2 });
  await page.reload();
  await expect(section.locator('.variation')).toHaveText([/^Giuoco Piano: 4\.c3\s*4\.c3 prepares d4/, /^Two Knights: 4\.Ng5\s*4\.Ng5 hits f7 twice/]);
  await expect(section.locator('.section-note')).toHaveText(/^2 of \d+$/);
});

test('About credits the opening names', async ({ page }) => {
  await page.goto('./#/about');
  const credit = page.locator('.credit', { has: page.getByRole('link', { name: 'Opening names', exact: true }) });
  await expect(credit).toContainText('lichess-org/chess-openings');
  await expect(credit.locator('.tag')).toHaveText('CC0');
});
