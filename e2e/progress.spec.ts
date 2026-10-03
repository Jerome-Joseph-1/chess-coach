import { expect, test, type Page } from '@playwright/test';

const DAY = 86_400_000;
const GAME = 'italian-1400-0001';

function moment(ply: number, right: boolean, overrides: Record<string, unknown> = {}) {
  return {
    opening: 'italian',
    level: 1400,
    gameId: GAME,
    ply,
    moveNo: ply + 2,
    type: 'pause',
    kinds: ['win'],
    depth: 1,
    outcomes: [{ step: 'spot', correct: right }],
    stars: right ? 3 : 0,
    at: Date.now(),
    ...overrides,
  };
}

function savedProgress(moments: ReturnType<typeof moment>[], extra: Record<string, unknown> = {}) {
  const at = Date.now();
  return {
    v: 1,
    moments,
    games: [{ opening: 'italian', level: 1400, gameId: GAME, at }],
    depth: {},
    reviews: [],
    days: [new Date(at).toLocaleDateString('en-CA')],
    armed: false,
    lastGame: { summary: { opening: 'italian', level: 1400, gameId: GAME, moments, at }, bonus: false },
    ...extra,
  };
}

async function seed(page: Page, progress: unknown) {
  await page.addInitScript((p) => localStorage.setItem('cc.progress.v1', JSON.stringify(p)), progress);
}

test.describe('Today', () => {
  test('shows the next game of the opening card', async ({ page }) => {
    await page.goto('./');
    await expect(page.getByRole('heading', { name: 'Chess Coach.' })).toBeVisible();
    const card = page.getByRole('region', { name: 'Italian Game' });
    await expect(card.getByText('You play White · Opponents rated 1400')).toBeVisible();
    await expect(card.getByText('Stage 1 of 5: Notice')).toBeVisible();
    await expect(card.getByText('Next: Game 1 · 4 key positions · about 2 min')).toBeVisible();
    await expect(card.getByRole('button', { name: 'Play next game' })).toBeEnabled();
  });

  test('says "Coming soon" for an opening without games', async ({ page }) => {
    await page.goto('./');
    await page.getByRole('button', { name: /Caro-Kann Defense/ }).click();
    const card = page.getByRole('region', { name: 'Caro-Kann Defense' });
    await expect(card.getByRole('button', { name: 'Coming soon' })).toBeDisabled();
  });

  test('starts a game from the card', async ({ page }) => {
    await page.goto('./');
    await page.getByRole('button', { name: 'Play next game' }).click();
    await expect(page).toHaveURL(/#\/play\/italian\/1400$/);
  });

  test('has no stats before a game and shows the week after one', async ({ page }) => {
    await page.goto('./');
    await expect(page.getByText('Play a game to see your stats here.')).toBeVisible();

    const moments = [moment(1, true), moment(3, true), moment(5, false, { kinds: ['trap'] }), moment(7, true, { type: 'nothing', kinds: [] })];
    await seed(page, savedProgress(moments));
    await page.reload();
    const week = page.getByRole('region', { name: 'This week' });
    await expect(week.getByText('3 of 4')).toBeVisible();
    await expect(week.getByText('key positions handled well this week')).toBeVisible();
    await expect(week.getByText('Chances to win 2/2')).toBeVisible();
    await expect(week.getByText('Traps 0/1')).toBeVisible();
    await expect(week.getByText('Quiet 1/1')).toBeVisible();
  });

  test('offers the positions that are due for review', async ({ page }) => {
    const due = { opening: 'italian', level: 1400, gameId: GAME, ply: 5, type: 'pause', box: 0, due: Date.now() - DAY };
    await seed(page, savedProgress([moment(5, false)], { reviews: [due, { ...due, ply: 9 }] }));
    await page.goto('./');
    await page.getByRole('link', { name: 'Review 2 positions you missed' }).click();
    await expect(page).toHaveURL(new RegExp(`#/play/italian/1400\\?review=${GAME}:5$`));
  });

  test('welcomes you back after two quiet days', async ({ page }) => {
    const progress = savedProgress([moment(1, true)], { days: [new Date(Date.now() - 3 * DAY).toLocaleDateString('en-CA')] });
    await seed(page, progress);
    await page.goto('./');
    await expect(page.getByText('Welcome back. Your first game today counts double.')).toBeVisible();
  });

  test('shows the Add to Home Screen hint on iPhone Safari until dismissed', async ({ page }) => {
    await page.goto('./');
    const hint = page.getByText('Add to your Home Screen: tap Share, then Add to Home Screen.');
    await expect(hint).toBeVisible();
    await page.getByRole('button', { name: 'Dismiss' }).click();
    await expect(hint).toBeHidden();
    await page.reload();
    await expect(hint).toBeHidden();
  });

  test('the chosen level is remembered', async ({ page }) => {
    await page.goto('./');
    const picker = () => page.getByRole('group', { name: 'Italian Game level' });
    await picker().getByRole('button', { name: '1700' }).click();
    await expect(page.getByText('You play White · Opponents rated 1700')).toBeVisible();
    await page.reload();
    await expect(picker().getByRole('button', { name: '1700' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('the tab bar moves between Today, Openings and You', async ({ page }) => {
    await page.goto('./');
    const tabs = page.getByRole('navigation', { name: 'Main' });
    await expect(tabs.getByRole('link', { name: 'Today' })).toHaveAttribute('aria-current', 'page');
    await tabs.getByRole('link', { name: 'Openings' }).click();
    await expect(tabs.getByRole('link', { name: 'Openings' })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('heading', { name: 'Openings' })).toBeInViewport();
    await tabs.getByRole('link', { name: 'You' }).click();
    await expect(page.getByRole('heading', { name: 'You', level: 1 })).toBeVisible();
  });

  test('the settings button opens Settings', async ({ page }) => {
    await page.goto('./');
    await page.getByRole('link', { name: 'Settings' }).click();
    await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
  });
});

test.describe('Settings', () => {
  test('persist across a reload', async ({ page }) => {
    await page.goto('./#/settings');
    await page.getByRole('button', { name: 'Dark' }).click();
    await page.getByRole('switch', { name: /Sound/ }).click();
    await page.getByRole('button', { name: '3', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.getByText('Stage 3 of 5: Play.')).toBeVisible();

    await page.reload();

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.getByRole('switch', { name: /Sound/ })).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByRole('button', { name: '3', exact: true })).toHaveAttribute('aria-pressed', 'true');
  });

  test('a manual stage replaces the automatic one on Today', async ({ page }) => {
    await page.goto('./#/settings');
    await page.getByRole('button', { name: '4', exact: true }).click();
    await page.goto('./');
    await expect(page.getByText('Stage 4 of 5: Follow through')).toBeVisible();
  });

  test('reset asks for confirmation inside the page', async ({ page }) => {
    await page.goto('./#/settings');
    await page.getByRole('button', { name: 'Reset progress' }).click();
    await expect(page.getByText('Erase all progress on this device?')).toBeVisible();
    await page.getByRole('button', { name: 'Keep my progress' }).click();
    await expect(page.getByRole('button', { name: 'Reset progress' })).toBeVisible();
    await page.getByRole('button', { name: 'Reset progress' }).click();
    await page.getByRole('button', { name: 'Erase progress' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Progress erased.' })).toBeVisible();
  });

  test('exports a backup the import accepts', async ({ page }) => {
    await seed(page, savedProgress([moment(1, true)]));
    await page.goto('./#/settings');
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: /Export progress/ }).click();
    const file = await (await download).path();

    await page.getByRole('button', { name: 'Reset progress' }).click();
    await page.getByRole('button', { name: 'Erase progress' }).click();
    await page.locator('input[type=file]').setInputFiles(file);
    await expect(page.getByRole('status').filter({ hasText: 'Progress imported.' })).toBeVisible();
  });

  test('refuses a file that is not a backup', async ({ page }) => {
    await page.goto('./#/settings');
    await page.locator('input[type=file]').evaluate((input: HTMLInputElement) => {
      const files = new DataTransfer();
      files.items.add(new File(['{"hello":1}'], 'x.json', { type: 'application/json' }));
      input.files = files.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await expect(page.getByRole('status').filter({ hasText: 'does not look like a Chess Coach backup' })).toBeVisible();
  });
});

test.describe('Recap and You', () => {
  test('recap lists the key positions of the last game', async ({ page }) => {
    const moments = [moment(3, true), moment(5, false, { kinds: ['defend'] }), moment(7, true, { type: 'silent' }), moment(9, true, { type: 'nothing', kinds: [] })];
    await seed(page, savedProgress(moments));
    await page.goto('./#/recap');
    await expect(page.getByRole('heading', { name: 'Game complete' })).toBeVisible();
    await expect(page.getByText('Move 5 · Chance to win')).toBeVisible();
    await expect(page.getByText('Spotted it')).toBeVisible();
    await expect(page.getByText('Missed it')).toBeVisible();
    await expect(page.getByText('Found it without a hint')).toBeVisible();
    await expect(page.getByText('Right, nothing special')).toBeVisible();
    await expect(page.getByRole('link', { name: 'See it again' }).first()).toHaveAttribute('href', `#/play/italian/1400?review=${GAME}:3`);
    await expect(page.getByRole('button', { name: 'Play next game' })).toBeVisible();
    await page.getByRole('button', { name: 'Back to Today' }).click();
    await expect(page).toHaveURL(/#\/$|\/chess-coach\/$/);
  });

  test('recap counts the welcome-back stars double', async ({ page }) => {
    const progress = savedProgress([moment(3, true)]);
    progress.lastGame.bonus = true;
    await seed(page, progress);
    await page.goto('./#/recap');
    await expect(page.getByText('Welcome back: stars counted double')).toBeVisible();
    await expect(page.locator('.recap-stars .sr-only')).toHaveText('6');
  });

  test('recap without a game shows an empty state', async ({ page }) => {
    await page.goto('./#/recap');
    await expect(page.getByRole('heading', { name: 'No game to look back on yet' })).toBeVisible();
  });

  test('You shows games, stage, reviews and the activity grid', async ({ page }) => {
    await seed(page, savedProgress([moment(1, true), moment(3, false)]));
    await page.goto('./#/progress');
    await expect(page.getByRole('heading', { name: 'You', level: 1 })).toBeVisible();
    const italian = page.getByRole('region', { name: 'Italian Game' });
    await expect(italian.getByText('Games played')).toBeVisible();
    await expect(italian.getByText('Stage 1 of 5: Notice')).toBeVisible();
    await expect(italian.getByText('Reviews due')).toBeVisible();
    await expect(italian.getByRole('img', { name: 'Chances to win: 50% right' })).toBeVisible();
    await expect(page.getByRole('img', { name: /Days you played/ })).toBeVisible();
    await expect(page.getByText(/streak/i)).toHaveCount(0);
  });

  test('You has an empty state before the first game', async ({ page }) => {
    await page.goto('./#/progress');
    await expect(page.getByRole('heading', { name: 'Your progress shows up here' })).toBeVisible();
  });
});

test('About lists the data and licences', async ({ page }) => {
  await page.goto('./#/about');
  for (const name of ['Lichess games', 'Maia-2', 'Stockfish', 'chess.js', 'cm-chessboard', 'Chess pieces', 'canvas-confetti', 'Preact']) {
    await expect(page.getByRole('link', { name })).toBeVisible();
  }
});
