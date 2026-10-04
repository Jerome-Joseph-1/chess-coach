import { expect, test, type Page } from '@playwright/test';
import {
  SPOT_QUESTION as QUESTION,
  choiceButton,
  coachBubble,
  continueAfterPause,
  continueButton,
  hintButton,
  moveList,
  pauseButton,
  playButton,
  rememberCard,
  settledBoard,
  squareOf,
  tapSquares,
  winButton,
} from './board';
import { readAllNotes } from './notes';

test.use({ serviceWorkers: 'block' });
// These tests are about key positions: opening notes would stop autoplay on the way there.
test.beforeEach(({ page }) => readAllNotes(page));

const ANSWERS = ['Win material', 'Attack the king', 'Defend', 'Avoid a trap', 'Improve a piece'];
const RIGHT_PICK = "Yes: there's material to win. Find the move.";
const PAWN_HINT = "Look at Black's pawn on e5: it isn't defended enough.";

async function atStage(page: Page, stage: number) {
  await page.addInitScript((depth) => {
    localStorage.setItem('cc.settings.v1', JSON.stringify({ depthOverride: depth }));
  }, stage);
}

/** Taps Play, after which the fixture game moves itself up to its first key position. */
async function reachFirstPause(page: Page) {
  await page.goto('./#/play/italian/1400');
  await playButton(page).click();
  await expect(page.getByText(QUESTION)).toBeVisible({ timeout: 15_000 });
}

/** Every answer to step 1 is in full view, inside the panel and under the board. */
async function expectAnswersInView(page: Page) {
  const [board, panel, ...answers] = await page.evaluate((labels) => {
    const box = (el: Element | null | undefined) => el!.getBoundingClientRect().toJSON();
    const buttons = [...document.querySelectorAll('.spot-choices button')];
    return [box(document.querySelector('.board-host')), box(document.querySelector('.coach-scroll')), ...labels.map((label) => box(buttons.find((b) => b.textContent === label)))];
  }, ANSWERS);
  for (const answer of answers) {
    expect(answer.y).toBeGreaterThanOrEqual(Math.max(board.y + board.height, panel.y) - 1);
    expect(answer.y + answer.height).toBeLessThanOrEqual(panel.y + panel.height + 1);
    expect(answer.height).toBeGreaterThanOrEqual(43.5);
  }
}

async function expectBoardUncovered(page: Page) {
  // Both boxes from one frame: the board may be resizing to the answer layout.
  const [board, sheet] = await page.evaluate(() =>
    ['.board-host', '.pause-sheet'].map((selector) => document.querySelector(selector)!.getBoundingClientRect().toJSON()),
  );
  expect(sheet.y).toBeGreaterThanOrEqual(board.y + board.height - 1);
  expect(sheet.y + sheet.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1);
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
}

test('the board holds its size and place through the questions and steps back for the answer', async ({ page }) => {
  await atStage(page, 1);
  await reachFirstPause(page);
  const asking = await settledBoard(page);
  expect(asking.x).toBeCloseTo((page.viewportSize()!.width - asking.width) / 2, 0);

  await winButton(page).click();
  await expect(page.getByText('Your move', { exact: true })).toBeVisible();
  expect(await settledBoard(page)).toEqual(asking);
  await hintButton(page).click();
  await expect(page.locator('.pause-sheet .pattern-label')).toBeVisible();
  expect(await settledBoard(page)).toEqual(asking);

  await page.getByRole('button', { name: 'Show solution' }).click();
  await expect(continueButton(page)).toBeVisible();
  const answer = await settledBoard(page);
  expect(answer.width).toBeLessThan(asking.width);
  expect(answer.y).toBe(asking.y);
  await expect(page.locator('.coach-scroll')).toHaveJSProperty('scrollTop', 0);
});

test('stage 1: spot it, play it, and the game moves on by itself', async ({ page }) => {
  await atStage(page, 1);
  await reachFirstPause(page);
  await expect(page.getByRole('img', { name: 'Step 1 of 2' })).toBeVisible();
  await expectBoardUncovered(page);
  await expectAnswersInView(page);

  await winButton(page).click();
  await expect(page.getByRole('img', { name: 'Step 2 of 2' })).toBeVisible();
  await expect(page.getByText('Your move', { exact: true })).toBeVisible();
  await expect(page.getByText(RIGHT_PICK)).toBeVisible();
  await expectBoardUncovered(page);

  await tapSquares(page, 'd4', 'e5');
  await expect(page.getByText('You found the move')).toBeVisible();
  await expectBoardUncovered(page);
  await continueAfterPause(page);
  await expect(moveList(page).filter({ hasText: /dxe5$/ })).toBeVisible();
});

test('a wrong answer at the spot step is only an error with a nudge, and the user can pick again', async ({ page }) => {
  await atStage(page, 3);
  await reachFirstPause(page);

  await choiceButton(page, 'Defend').click();
  await expect(page.getByText('Is anything of yours actually attacked? Count the attackers.')).toBeVisible();
  await expect(page.getByText(QUESTION)).toBeVisible();
  await expect(page.locator('.pause-choice.is-wrong')).toHaveText('Defend');

  await winButton(page).click();
  await expect(page.locator('.pause-choice.is-right')).toHaveText('Win material');
  await expect(page.getByText('Your move', { exact: true })).toBeVisible();
  await expect(page.getByText(RIGHT_PICK)).toBeVisible();
});

test('after a second wrong answer the coach shows the right one, says why and moves on', async ({ page }) => {
  await atStage(page, 3);
  await reachFirstPause(page);

  await choiceButton(page, 'Improve a piece').click();
  await expect(page.getByText('Look again: check every capture and every attack.')).toBeVisible();
  await choiceButton(page, 'Defend').click();
  const shown = 'Right answer: Win material. One of your moves wins something.';
  await expect(page.getByText(shown)).toBeVisible();
  await expect(page.locator('.pause-choice.is-right')).toHaveText('Win material');
  await expect(page.locator('.pause-choice.is-wrong')).toHaveText('Defend');

  await expect(page.getByText('Your move', { exact: true })).toBeVisible();
  await expect(page.getByText(shown)).toBeVisible();
  await tapSquares(page, 'd4', 'e5');
  await expect(continueButton(page)).toBeVisible();
});

test('a wrong move is only an error and the piece goes back; the right one finishes it', async ({ page }) => {
  await atStage(page, 3);
  await reachFirstPause(page);
  await winButton(page).click();
  await expect(page.getByText('Your move', { exact: true })).toBeVisible();

  for (let attempt = 0; attempt < 2; attempt++) {
    await tapSquares(page, 'a2', 'a3');
    await expect(page.getByText('Not quite. Try again.')).toBeVisible();
    await expect(page.getByText('Your move', { exact: true })).toBeVisible();
  }
  await expect(hintButton(page)).toHaveText('Hint: the idea');
  await expect(page.getByRole('button', { name: 'Show solution' })).toBeVisible();

  await tapSquares(page, 'd4', 'e5');
  await expect(page.getByText('You found the move')).toBeVisible();
  await expect(continueButton(page)).toBeVisible();
});

test('a move that loses material stays on the board while the reply shows what it loses, then the position comes back', async ({
  page,
}) => {
  await atStage(page, 3);
  await reachFirstPause(page);
  await winButton(page).click();
  await expect(page.getByText('Your move', { exact: true })).toBeVisible();

  await tapSquares(page, 'c4', 'f7');
  const why = 'After Bxf7+, Kxf7 takes your bishop on f7, and you get only a pawn for it.';
  await expect(page.getByText(why)).toBeVisible();
  await expect(page.locator('.cm-chessboard .arrow-threat')).toHaveCount(1);
  await expect(page.locator(".cm-chessboard .pieces g[data-square='f7']")).toHaveAttribute('data-piece', 'bk');
  await expect(page.locator('.cm-chessboard .marker-bad')).toHaveCount(1);
  expect(await squareOf(page, '.cm-chessboard .marker-bad')).toBe('f7');
  await expect(hintButton(page)).toBeDisabled();

  await expect(page.locator(".cm-chessboard .pieces g[data-square='c4']")).toHaveAttribute('data-piece', 'wb', { timeout: 8000 });
  await expect(page.locator('.cm-chessboard .arrow-threat')).toHaveCount(0);
  await expect(page.locator('.cm-chessboard .marker-bad')).toHaveCount(0);
  await expect(hintButton(page)).toBeEnabled();
  await expect(page.getByText(why)).toBeVisible();

  await tapSquares(page, 'd4', 'e5');
  await expect(page.getByText('You found the move')).toBeVisible();
});

test('hints climb Idea, Piece, Move: the pattern, then the piece in trouble, then the move', async ({ page }) => {
  await atStage(page, 3);
  await reachFirstPause(page);
  await winButton(page).click();
  await expect(page.getByText('Your move', { exact: true })).toBeVisible();

  await hintButton(page).click();
  await expect(page.getByText('Is any enemy piece not defended enough?')).toBeVisible();
  await expect(page.locator('.pattern-label')).toHaveText('Free piece');
  await expect(page.locator('.hint-stop.is-used')).toHaveCount(1);
  await expect(page.locator('.hint-stop.is-next')).toHaveText('Piece');
  await expect(hintButton(page)).toHaveText('Hint: the piece');

  // The second hint points at the loose pawn on e5, not at the pawn on d4 that takes it.
  await hintButton(page).click();
  await expect(page.getByText(PAWN_HINT)).toBeVisible();
  await expect(page.locator('.cm-chessboard .marker-hint')).toHaveCount(1);
  expect(await squareOf(page, '.cm-chessboard .marker-hint')).toBe('e5');
  await expect(hintButton(page)).toHaveText('Hint: the move');

  await hintButton(page).click();
  await expect(page.getByText(`${PAWN_HINT} Play the move shown.`)).toBeVisible();
  await expect(page.locator('.cm-chessboard .arrow-best')).toHaveCount(1);
  await expect(page.locator('.hint-stop.is-used')).toHaveCount(3);
  await expect(hintButton(page)).toHaveText('No hints left');
  await expect(hintButton(page)).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Show solution' })).toBeEnabled();
  await tapSquares(page, 'd4', 'e5');

  await expect(page.getByText('Solved with a hint')).toBeVisible();
  await expect(page.locator('.pattern-label')).toHaveText('Free piece');
  await expect(rememberCard(page)).toContainText('Remember', { timeout: 10_000 });
  await expect(continueButton(page)).toBeVisible();
});

test('show solution goes to the line playing itself, scored as missed', async ({ page }) => {
  await atStage(page, 1);
  await reachFirstPause(page);
  await winButton(page).click();
  await page.getByRole('button', { name: 'Show solution' }).click();

  await expect(page.getByText('Missed it')).toBeVisible();
  const caption = page.locator('.stepper-caption');
  await expect(caption).not.toBeEmpty();
  const first = await caption.textContent();
  await expect(caption).not.toHaveText(first!, { timeout: 4000 });
  await expectBoardUncovered(page);

  await page.getByRole('button', { name: 'Previous move' }).click();
  await page.waitForTimeout(800);
  const stopped = await caption.textContent();
  await page.waitForTimeout(2000);
  await expect(caption).toHaveText(stopped!);
  await expect(page.getByRole('button', { name: 'Watch again' })).toBeVisible();

  await continueAfterPause(page);
  await expect(moveList(page).filter({ hasText: /dxe5$/ })).toBeVisible();
});

test('buttons say what they do in words, with at most a drawn icon and never an emoji', async ({ page }) => {
  await atStage(page, 3);
  await reachFirstPause(page);
  const labels = () => page.locator('.pause-sheet button:not([aria-hidden="true"] button)').allTextContents();
  const plain = /^[A-Za-z' ,.?:·\d]*$/;

  await expect(winButton(page)).toBeVisible();
  expect(await labels()).toEqual(ANSWERS);
  await winButton(page).click();
  await expect(page.getByRole('button', { name: 'Show solution' })).toBeVisible();
  await expect(page.locator('.pause-sheet .xfade-out')).toHaveCount(0);
  // Show solution is the quiet action; Hint comes last and fills the row.
  expect(await labels()).toEqual(['Show solution', 'Hint: the idea']);
  await page.getByRole('button', { name: 'Show solution' }).click();
  await expect(continueButton(page)).toBeVisible();
  expect((await labels()).every((text) => plain.test(text))).toBe(true);
  const icons = page.locator('.pause-sheet button svg');
  expect(await icons.evaluateAll((all) => all.every((icon) => icon.getAttribute('aria-hidden') === 'true'))).toBe(true);
});

test.describe('the coach panel on an iPhone 14', () => {
  test.beforeEach(({}, info) => test.skip(info.project.name !== 'iphone-14', 'Motion is checked on one phone.'));

  test('rises after the game stops and asks the question, with the board dimmed around the last move', async ({ page }) => {
    await atStage(page, 3);
    await page.goto('./#/play/italian/1400');
    await playButton(page).click();
    await expect(pauseButton(page)).toBeVisible();
    await expect(page.locator('.pause-sheet')).toHaveCount(0);

    await expect(coachBubble(page)).toContainText(QUESTION, { timeout: 15_000 });
    await expect(coachBubble(page)).toContainText('Key position · Move');
    await expect(page.locator('.pause-sheet .coach-mark')).toBeVisible();
    await expect(page.locator('.cm-chessboard .marker-dim')).toHaveCount(62);
    await expect(page.locator('.game-player.is-you')).toBeHidden();

    await winButton(page).click();
    await expect(page.locator('.cm-chessboard .marker-dim')).toHaveCount(0);
  });

  test('keeps the Remember card back while the line plays and shows it once the line has ended', async ({ page }) => {
    await atStage(page, 1);
    await reachFirstPause(page);
    await winButton(page).click();
    await tapSquares(page, 'd4', 'e5');
    await expect(page.getByText('You found the move')).toBeVisible();

    const caption = page.locator('.stepper-caption');
    await expect(caption).toContainText('dxe5');
    // Its room is kept from the start, so nothing moves when it shows.
    await expect(rememberCard(page)).toBeHidden();
    await expect(page.getByRole('button', { name: 'Next move' })).toBeEnabled();
    await expect(rememberCard(page)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'Next move' })).toBeDisabled();
    await expect(rememberCard(page)).toBeInViewport();
  });

  test('with reduced motion the line waits on its first move and the Remember card is there at once', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await atStage(page, 1);
    await reachFirstPause(page);
    await winButton(page).click();
    await page.getByRole('button', { name: 'Show solution' }).click();

    await expect(page.locator('.stepper-caption')).toContainText('5. dxe5');
    await expect(rememberCard(page)).toBeVisible();
    await page.waitForTimeout(1500);
    await expect(page.locator('.stepper-caption')).toContainText('5. dxe5');
  });

  test('Continue sends the panel back into the dock and autoplay carries on to the next key position', async ({ page }) => {
    await atStage(page, 1);
    await reachFirstPause(page);
    await winButton(page).click();
    await tapSquares(page, 'd4', 'e5');
    await continueButton(page).click();

    await expect(page.locator('.pause-sheet')).toHaveCount(0);
    await expect(pauseButton(page)).toBeVisible();
    await expect(page.locator('.game-sub')).toHaveText(/^Key positions · 1 of \d+$/);
    await expect(moveList(page).filter({ hasText: /dxe5$/ }).getByRole('img', { name: 'Found' })).toBeVisible();
    await expect(page.getByText(QUESTION)).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.game-sub')).toHaveText(/^Key position 2 of \d+$/);
  });
});
