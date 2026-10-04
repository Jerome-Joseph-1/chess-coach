import { expect, test, type Page } from '@playwright/test';
import { continueButton, hintButton, rememberCard, tapSquares } from './board';

// The test course: free pieces teach with game 0001 at ply 19 (Rxe6+) and practise at ply 3 (dxe5);
// traps have an example (the Nxe5 trap, answered by h3) and no practice positions.
test.use({ serviceWorkers: 'block' });

const bubble = (page: Page) => page.locator('.coach-bubble').first();
const showExample = (page: Page) => page.getByRole('button', { name: 'Show me an example' });

async function expectBoardUncovered(page: Page) {
  const [board, sheet] = await page.evaluate(() =>
    ['.board-host', '.pause-sheet'].map((selector) => document.querySelector(selector)!.getBoundingClientRect().toJSON()),
  );
  expect(sheet.y).toBeGreaterThanOrEqual(board.y + board.height - 1);
  expect(sheet.y + sheet.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1);
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
}

async function storedLesson(page: Page, unit: string) {
  return page.evaluate((id) => JSON.parse(localStorage.getItem('cc.progress.v1') ?? '{}').lessons?.italian?.[id], unit);
}

test('goes from the intro through the worked example and practice to the summary', async ({ page }) => {
  await page.goto('./#/lesson/italian/free-piece');
  await expect(page.getByRole('heading', { name: 'Free pieces', level: 1 })).toBeVisible();
  await expect(page.locator('.game-sub')).toHaveText('Italian Game lesson');
  await expect(page.getByText('How to spot it')).toBeVisible();
  await expect(page.locator('.lesson-spot li')).toHaveCount(3);

  await showExample(page).click();
  await expect(page.getByText('Worked example', { exact: true }).first()).toBeVisible();
  await expect(bubble(page)).toContainText('Your rook on e1 attacks the bishop on e6, and nothing guards it.');
  await expect(page.getByRole('img', { name: 'Step 1 of 3' })).toBeVisible();
  await expect(page.locator('.cm-chessboard .marker-focus')).toHaveCount(1);
  await expectBoardUncovered(page);

  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(bubble(page)).toContainText('So Rxe6+ wins it for free.');
  await expect(bubble(page)).toContainText('Your move: take the bishop.');
  await expect(page.locator('.cm-chessboard .arrow-best')).toHaveCount(1);
  await tapSquares(page, 'e1', 'e6');

  await expect(rememberCard(page)).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.pattern-label')).toHaveText('Free piece');
  await expectBoardUncovered(page);
  expect((await storedLesson(page, 'free-piece'))?.learnedAt).toBeUndefined();
  await continueButton(page).click();

  await expect(page.getByText('Practice 1 of 1')).toBeVisible();
  expect((await storedLesson(page, 'free-piece')).learnedAt).toEqual(expect.any(Number));
  await expect(page.locator('.pause-sheet .pattern-label')).toHaveText('Free piece');
  await expect(page.getByText('Play the best move on the board.')).toBeVisible();
  await expectBoardUncovered(page);
  await tapSquares(page, 'd4', 'e5');
  await expect(page.getByText('You found the move')).toBeVisible();
  await continueButton(page).click();

  await expect(page.getByRole('heading', { name: '1 of 1' })).toBeVisible();
  await expect(rememberCard(page)).toBeVisible();
  const saved = await storedLesson(page, 'free-piece');
  expect(saved.doneAt).toEqual(expect.any(Number));
  expect(saved.drills).toEqual([{ key: 'italian-1400/italian-1400-0001:3', correct: true, at: expect.any(Number) }]);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page).toHaveURL(/#\/course$/);
});

test('a wrong move on an asking step goes back, and Show me plays the move', async ({ page }) => {
  await page.goto('./#/lesson/italian/free-piece');
  await showExample(page).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(bubble(page)).toContainText('Your move: take the bishop.');

  await tapSquares(page, 'a2', 'a3');
  await expect(bubble(page)).toContainText('Not quite. Try again.');
  await page.getByRole('button', { name: 'Show me' }).click();
  await expect(rememberCard(page)).toBeVisible({ timeout: 10_000 });

  await page.getByRole('button', { name: 'Previous step' }).click();
  await expect(bubble(page)).toContainText('So Rxe6+ wins it for free.');
  await expect(page.getByRole('button', { name: 'Show me' })).toBeVisible();
});

test('a unit without practice positions goes from the example straight to the summary', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./#/lesson/italian/traps');
  await showExample(page).click();
  await expect(bubble(page)).toContainText('Nxe5 is tempting');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(bubble(page)).toContainText('Your move: play it.');
  await page.getByRole('button', { name: 'Show me' }).click();
  await expect(rememberCard(page)).toBeVisible({ timeout: 10_000 });
  await continueButton(page).click();

  await expect(page.getByText('You will meet this pattern again in your next games.')).toBeVisible();
  const saved = await storedLesson(page, 'traps');
  expect(saved).toMatchObject({ learnedAt: expect.any(Number), doneAt: expect.any(Number), drills: [] });
});

test('a practice position solved with a hint comes back on Today and is asked again as practice', async ({ page }) => {
  const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('cc.progress.v1')!));
  await page.goto('./#/lesson/italian/free-piece');
  await showExample(page).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await tapSquares(page, 'e1', 'e6');
  await expect(rememberCard(page)).toBeVisible({ timeout: 10_000 });
  await continueButton(page).click();
  await expect(page.getByText('Practice 1 of 1')).toBeVisible();
  await hintButton(page).click();
  await tapSquares(page, 'd4', 'e5');
  await expect(page.getByText('Solved with a hint')).toBeVisible();
  await continueButton(page).click();
  await expect(page.getByRole('heading', { name: '0 of 1' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'To review' })).toContainText('Practice 1');
  const missed = { opening: 'italian', level: 1400, gameId: 'italian-1400-0001', ply: 3, drillSet: 'italian-1400', type: 'pause', box: 0 };
  expect((await stored()).reviews).toEqual([{ ...missed, due: expect.any(Number) }]);

  // A day later it is due.
  await page.evaluate(() => {
    const progress = JSON.parse(localStorage.getItem('cc.progress.v1')!);
    progress.reviews[0].due = Date.now() - 1;
    localStorage.setItem('cc.progress.v1', JSON.stringify(progress));
  });
  await page.goto('./#/');
  await page.reload();
  await page.getByRole('link', { name: 'Review 1 position you missed' }).click();
  await expect(page).toHaveURL(/#\/practice\/italian-1400\/italian-1400-0001\/3$/);
  await expect(page.getByRole('heading', { name: 'Free pieces', level: 1 })).toBeVisible();
  await expect(page.getByText('Play the best move on the board.')).toBeVisible();
  await tapSquares(page, 'd4', 'e5');
  await expect(page.getByText('You found the move')).toBeVisible();
  await continueButton(page).click();

  await expect(page).toHaveURL(/#\/$/);
  const after = await stored();
  expect(after.reviews).toEqual([{ ...missed, box: 1, due: expect.any(Number) }]);
  expect(after.games ?? []).toEqual([]);
  expect(after.moments ?? []).toEqual([]);
});

test('the back button returns to the course', async ({ page }) => {
  await page.goto('./#/lesson/italian/free-piece');
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page).toHaveURL(/#\/course$/);
});

/** Free pieces with a second practice position: the queen trade at ply 7 of the same game. */
async function twoPracticePositions(page: Page) {
  await page.route('**/content/italian-1400/course.json', async (route) => {
    const course = await (await route.fetch()).json();
    course.units[0].drills.push({ set: 'italian-1400', gameId: 'italian-1400-0001', ply: 7, findShare: 0.4 });
    await route.fulfill({ json: course });
  });
}

async function finishExample(page: Page) {
  await showExample(page).click();
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await tapSquares(page, 'e1', 'e6');
  await expect(rememberCard(page)).toBeVisible({ timeout: 10_000 });
  await continueButton(page).click();
}

test('leaving a lesson keeps its place: it reopens on the same practice, and the summary lists the misses', async ({ page }) => {
  await twoPracticePositions(page);
  await page.goto('./#/lesson/italian/free-piece');
  await finishExample(page);
  await expect(page.getByText('Practice 1 of 2')).toBeVisible();
  await tapSquares(page, 'd4', 'e5');
  await expect(page.getByText('You found the move')).toBeVisible();
  await continueButton(page).click();
  await expect(page.getByText('Practice 2 of 2')).toBeVisible();

  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page).toHaveURL(/#\/course$/);
  await page.getByRole('link', { name: 'Today' }).click();
  await page.getByRole('button', { name: 'Continue lesson' }).click();
  await expect(page.getByText('Practice 2 of 2')).toBeVisible();

  await hintButton(page).click();
  await tapSquares(page, 'd1', 'd8');
  await expect(page.getByText('Solved with a hint')).toBeVisible();
  await continueButton(page).click();
  await expect(page.getByRole('heading', { name: '1 of 2' })).toBeVisible();
  const missed = page.getByRole('region', { name: 'To review' });
  await expect(missed.locator('li')).toHaveText(['Practice 2']);
  await expect(missed).toContainText('It comes back for review on Today, starting tomorrow.');
  expect((await storedLesson(page, 'free-piece')).place).toBeUndefined();
});

test('the summary offers four more practice positions while the unit has new ones', async ({ page }) => {
  await page.route('**/content/italian-1400/course.json', async (route) => {
    const course = await (await route.fetch()).json();
    const at = (game: string, ply: number) => ({ set: 'italian-1400', gameId: `italian-1400-${game}`, ply, findShare: 0.4 });
    course.units[0].drills = [at('0001', 3), at('0001', 7), at('0001', 15), at('0002', 35), at('0002', 3)];
    await route.fulfill({ json: course });
  });
  // Left during a lesson whose practice asks only the first position.
  await page.addInitScript(() => {
    const place = { page: 'practice', since: 1, drills: ['italian-1400/italian-1400-0001:3'] };
    const lessons = { italian: { 'free-piece': { learnedAt: 1, drills: [], place } } };
    if (!localStorage.getItem('cc.progress.v1')) localStorage.setItem('cc.progress.v1', JSON.stringify({ v: 1, lessons }));
  });
  await page.goto('./#/lesson/italian/free-piece');
  await expect(page.getByText('Practice 1 of 1')).toBeVisible();
  await tapSquares(page, 'd4', 'e5');
  await continueButton(page).click();

  await expect(page.getByText('Lesson done')).toBeVisible();
  await page.getByRole('button', { name: 'Practice 4 more' }).click();
  await expect(page.getByText('Practice 1 of 4')).toBeVisible();
});

test('a done lesson offers new practice positions from the Course tab until none are left', async ({ page }) => {
  await page.addInitScript(() => {
    const lessons = { italian: { 'free-piece': { learnedAt: 1, doneAt: 2, drills: [] } } };
    if (!localStorage.getItem('cc.progress.v1')) localStorage.setItem('cc.progress.v1', JSON.stringify({ v: 1, lessons }));
  });
  await page.goto('./#/course');
  await page.getByRole('link', { name: 'Practice 1 more' }).click();
  await expect(page).toHaveURL(/#\/lesson\/italian\/free-piece\?more$/);
  await expect(page.getByText('Practice 1 of 1')).toBeVisible();
  await tapSquares(page, 'd4', 'e5');
  await expect(page.getByText('You found the move')).toBeVisible();
  await continueButton(page).click();

  await expect(page.getByText('Practice done')).toBeVisible();
  await expect(page.getByRole('heading', { name: '1 of 1' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Practice \d more$/ })).toHaveCount(0);
  const saved = await storedLesson(page, 'free-piece');
  expect(saved).toMatchObject({ doneAt: 2, drills: [{ key: 'italian-1400/italian-1400-0001:3', correct: true }] });
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('link', { name: /^Practice \d more$/ })).toHaveCount(0);
});
