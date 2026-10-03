import { expect, test, type Page } from '@playwright/test';
import { SPOT_QUESTION, playButton, tapSquare, tapSquares, winButton } from './board';
import { returningPlayer } from './notes';

test.use({ serviceWorkers: 'block' });
// These tests are about key positions: opening notes would stop autoplay on the way there.
test.beforeEach(({ page }) => returningPlayer(page));
test.beforeEach(({}, testInfo) => test.skip(testInfo.project.name !== 'iphone-14', 'Motion is checked on the iPhone 14 profile'));

/** Stage 3, then Play: the fixture game runs to its first key position and the user says something is on. */
async function reachYourMove(page: Page) {
  await page.addInitScript(() => localStorage.setItem('cc.settings.v1', JSON.stringify({ depthOverride: 3 })));
  await page.goto('./#/play/italian/1400');
  await playButton(page).click();
  await expect(page.getByText(SPOT_QUESTION)).toBeVisible({ timeout: 15_000 });
  await winButton(page).click();
  await expect(page.getByText('Your move', { exact: true })).toBeVisible();
}

/** Short-lived elements come and go between polls, so the page keeps its own count of them from now on. */
async function countAdded(page: Page, selector: string) {
  await page.evaluate((sel) => {
    const seen = ((window as any).__added ??= {});
    seen[sel] = 0;
    new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (!(node instanceof Element)) continue;
          seen[sel] += (node.matches(sel) ? 1 : 0) + node.querySelectorAll(sel).length;
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
  }, selector);
  return () => page.evaluate((sel) => (window as any).__added[sel] as number, selector);
}

/** Whether each coach arrow drawn from now on starts with its shaft being drawn in. */
async function watchArrowDrawIn(page: Page) {
  await page.evaluate(() => {
    const drawn: boolean[] = ((window as any).__drawIn = []);
    new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (!(node instanceof Element) || !node.matches('.arrow-best')) continue;
          const animations = node.querySelector('line')?.getAnimations() ?? [];
          drawn.push(animations.some((a) => (a.effect as KeyframeEffect).getKeyframes().some((k) => 'strokeDashoffset' in k)));
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
  });
  return () => page.evaluate(() => (window as any).__drawIn as boolean[]);
}

const pieceOn = (page: Page, square: string) => page.locator(`.cm-chessboard .pieces g[data-square='${square}']`);

test('a tapped piece lifts and its moves grow in; tapping it again puts it down', async ({ page }) => {
  await reachYourMove(page);
  await tapSquare(page, 'd4');
  await expect(pieceOn(page, 'd4')).toHaveClass(/piece-lift/);
  await expect(page.locator('.cm-chessboard .marker-dot')).toHaveCount(1);
  await expect(page.locator('.cm-chessboard .marker-capture')).toHaveCount(1);

  await tapSquare(page, 'd4');
  await expect(page.locator('.cm-chessboard g.piece-lift')).toHaveCount(0);
  await expect(page.locator('.cm-chessboard .marker-dot')).toHaveCount(0);
});

test('a wrong move shows a cross and the piece goes back; the right one takes with a tick and a burst', async ({ page }) => {
  await reachYourMove(page);
  const specks = await countAdded(page, '.burst-speck');
  const ghosts = await countAdded(page, '.capture-ghost');

  await tapSquares(page, 'a2', 'a3');
  await expect(page.locator('.overlay-badge--bad .badge')).toBeVisible();
  await expect(page.locator('.overlay-badge--bad')).toHaveCount(0);
  await expect(pieceOn(page, 'a2')).toHaveAttribute('data-piece', 'wp');
  await expect(pieceOn(page, 'a3')).toHaveCount(0);
  expect(await specks()).toBe(0);

  await tapSquares(page, 'd4', 'e5');
  await expect(page.locator('.overlay-badge--good .badge')).toBeVisible();
  await expect.poll(specks).toBeGreaterThanOrEqual(8);
  await expect.poll(ghosts).toBe(1);
  await expect(page.locator('.burst-speck')).toHaveCount(0);
  await expect(page.locator('.capture-ghost')).toHaveCount(0);
  await expect(pieceOn(page, 'e5')).toHaveAttribute('data-piece', 'wp');
});

test('the hint arrow draws itself in, and fades out when the board moves on', async ({ page }) => {
  await reachYourMove(page);
  const drawIns = await watchArrowDrawIn(page);
  const leaving = await countAdded(page, '.arrow-leaving');
  await page.getByRole('button', { name: 'Hint: the idea' }).click();
  await page.getByRole('button', { name: 'Hint: the piece' }).click();
  await expect(page.locator('.cm-chessboard .marker-hint')).toHaveCount(1);
  await page.getByRole('button', { name: 'Hint: the move' }).click();

  await expect(page.locator('.cm-chessboard .arrow-best')).toHaveCount(1);
  expect(await drawIns()).toEqual([true]);
  await tapSquares(page, 'd4', 'e5');
  await expect(page.locator('.cm-chessboard .arrow-best')).toHaveCount(0);
  await expect.poll(leaving).toBe(1);
  await expect(page.locator('.arrow-leaving')).toHaveCount(0);
});

test('with reduced motion there are no specks and arrows simply appear', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await reachYourMove(page);
  const specks = await countAdded(page, '.burst-speck');
  const drawIns = await watchArrowDrawIn(page);
  await page.getByRole('button', { name: 'Hint: the idea' }).click();
  await page.getByRole('button', { name: 'Hint: the piece' }).click();
  await page.getByRole('button', { name: 'Hint: the move' }).click();
  await expect(page.locator('.cm-chessboard .arrow-best')).toHaveCount(1);
  expect(await drawIns()).toEqual([false]);

  await tapSquares(page, 'd4', 'e5');
  await expect(page.locator('.overlay-badge--good .badge')).toBeVisible();
  await page.waitForTimeout(500);
  expect(await specks()).toBe(0);
});
