import { expect, test, type Page } from '@playwright/test';

const DAY = 86_400_000;
const GAME = 'italian-1400-0001';

// The fixture game has key positions at plies 3, 7, 15 and 19: moves 5, 7, 11 and 13.
const moveNoOf = (ply: number) => (ply + 7) / 2;

function moment(ply: number, right: boolean, overrides: Record<string, unknown> = {}) {
  return {
    opening: 'italian',
    level: 1400,
    gameId: GAME,
    ply,
    moveNo: moveNoOf(ply),
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

/** Picks a file in the Restore input without a file on disk. */
async function chooseFile(page: Page, name: string, text: string) {
  await page.locator('input[type=file]').evaluate(
    (input: HTMLInputElement, file) => {
      const files = new DataTransfer();
      files.items.add(new File([file.text], file.name, { type: 'application/json' }));
      input.files = files.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    },
    { name, text },
  );
}

async function seed(page: Page, progress: unknown) {
  await page.addInitScript((p) => localStorage.setItem('cc.progress.v1', JSON.stringify(p)), progress);
}

test.describe('Today', () => {
  test('shows the opening to play with one Play button', async ({ page }) => {
    await page.goto('./');
    await expect(page.getByRole('heading', { name: 'Chess Coach.' })).toBeVisible();
    const card = page.getByRole('region', { name: 'Italian Game' });
    await expect(card.getByText('You play White · Opponents rated 1400')).toBeVisible();
    await expect(card.getByText('Stage 1 of 3: Spot it, then play it')).toBeVisible();
    await expect(card.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
    await expect(page.locator('main .btn-primary')).toHaveCount(1);
    await expect(page.getByText('Download for offline')).toHaveCount(0);
    await expect(page.getByRole('group', { name: /level/ })).toHaveCount(0);
  });

  test('switches the card between the openings', async ({ page }) => {
    await page.goto('./');
    const switcher = page.getByRole('group', { name: 'Opening' });
    await expect(switcher.getByRole('button', { name: 'Italian' })).toHaveAttribute('aria-pressed', 'true');

    await switcher.getByRole('button', { name: 'Caro-Kann' }).click();
    const card = page.getByRole('region', { name: 'Caro-Kann Defense' });
    await expect(card.getByText('You play Black · Opponents rated 1400')).toBeVisible();
    await expect(card.getByRole('button', { name: 'Coming soon' })).toBeDisabled();

    await switcher.getByRole('button', { name: 'Italian' }).click();
    await expect(page.getByRole('region', { name: 'Italian Game' }).getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  });

  test('starts a game from the card', async ({ page }) => {
    await page.goto('./');
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(page).toHaveURL(/#\/play\/italian\/1400$/);
  });

  test('has no progress before a game and one line after one', async ({ page }) => {
    await page.goto('./');
    await expect(page.getByText('Play a game to see your progress here.')).toBeVisible();

    const moments = [moment(3, true), moment(7, true), moment(15, false, { kinds: ['trap'] }), moment(19, true, { type: 'nothing', kinds: [] })];
    await seed(page, savedProgress(moments));
    await page.reload();
    await expect(page.getByText('3 of 4 key positions right this week')).toBeVisible();
    await expect(page.getByText(/Chances to win/)).toHaveCount(0);
    await expect(page.getByText('Not started')).toHaveCount(0);
  });

  test('offers the positions that are due for review', async ({ page }) => {
    const due = { opening: 'italian', level: 1400, gameId: GAME, ply: 7, type: 'pause', box: 0, due: Date.now() - DAY };
    await seed(page, savedProgress([moment(7, false)], { reviews: [due, { ...due, ply: 15 }] }));
    await page.goto('./');
    await page.getByRole('link', { name: 'Review 2 positions you missed' }).click();
    await expect(page).toHaveURL(new RegExp(`#/play/italian/1400\\?review=${GAME}:7$`));
  });

  test('welcomes you back after two quiet days', async ({ page }) => {
    const progress = savedProgress([moment(3, true)], { days: [new Date(Date.now() - 3 * DAY).toLocaleDateString('en-CA')] });
    await seed(page, progress);
    await page.goto('./');
    await expect(page.getByText('Welcome back: your next game counts double')).toBeVisible();
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

  test('the tab bar moves between Today, Progress and Settings', async ({ page }) => {
    await page.goto('./');
    const tabs = page.getByRole('navigation', { name: 'Main' });
    await expect(tabs.getByRole('link', { name: 'Today' })).toHaveAttribute('aria-current', 'page');
    await tabs.getByRole('link', { name: 'Progress' }).click();
    await expect(page.getByRole('heading', { name: 'Progress', level: 1 })).toBeVisible();
    await expect(tabs.getByRole('link', { name: 'Progress' })).toHaveAttribute('aria-current', 'page');
    await tabs.getByRole('link', { name: 'Settings' }).click();
    await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
    await tabs.getByRole('link', { name: 'Today' }).click();
    await expect(page.getByRole('heading', { name: 'Chess Coach.' })).toBeVisible();
  });
});

test.describe('Settings', () => {
  test('persist across a reload', async ({ page }) => {
    await page.goto('./#/settings');
    await page.getByRole('button', { name: 'Dark' }).click();
    await page.getByRole('switch', { name: /Sound/ }).click();
    await page.getByRole('switch', { name: /Quick games \(about 3 key positions\)/ }).click();
    await page.getByRole('button', { name: '3', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.getByText(/Stage 3 of 3: Play it all the way/)).toBeVisible();

    await page.reload();

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.getByRole('switch', { name: /Sound/ })).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByRole('switch', { name: /Quick games/ })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('button', { name: '3', exact: true })).toHaveAttribute('aria-pressed', 'true');
  });

  test('the opponent rating is chosen per opening and remembered', async ({ page }) => {
    await page.goto('./#/settings');
    const italian = page.getByRole('group', { name: 'Italian Game opponents' });
    const caroKann = page.getByRole('group', { name: 'Caro-Kann Defense opponents' });
    await expect(italian.getByRole('button', { name: '1400' })).toHaveAttribute('aria-pressed', 'true');
    await italian.getByRole('button', { name: '1700' }).click();
    await caroKann.getByRole('button', { name: '2000' }).click();

    await page.reload();
    await expect(italian.getByRole('button', { name: '1700' })).toHaveAttribute('aria-pressed', 'true');
    await expect(caroKann.getByRole('button', { name: '2000' })).toHaveAttribute('aria-pressed', 'true');

    await page.goto('./');
    await expect(page.getByText('You play White · Opponents rated 1700')).toBeVisible();
  });

  test('a manual stage replaces the automatic one on Today', async ({ page }) => {
    await page.goto('./#/settings');
    await page.getByRole('button', { name: '2', exact: true }).click();
    await page.goto('./');
    await expect(page.getByText('Stage 2 of 3: Play the follow-up too')).toBeVisible();
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

  test('backs up to a file that restoring accepts', async ({ page }) => {
    await seed(page, savedProgress([moment(3, true)]));
    await page.goto('./#/settings');
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: /Back up progress/ }).click();
    const file = await (await download).path();

    await page.getByRole('button', { name: 'Reset progress' }).click();
    await page.getByRole('button', { name: 'Erase progress' }).click();
    await page.locator('input[type=file]').setInputFiles(file);
    await expect(page.getByRole('status').filter({ hasText: 'Progress restored.' })).toBeVisible();
  });

  test('refuses a file that is not a backup', async ({ page }) => {
    await page.goto('./#/settings');
    await chooseFile(page, 'x.json', '{"hello":1}');
    await expect(page.getByRole('status').filter({ hasText: 'does not look like a Chess Coach backup' })).toBeVisible();
  });
});

test.describe('Saved progress', () => {
  // Restoring a backup goes through the app's own save path, so the reloads below prove it reaches storage.
  async function restoreBackup(page: Page, progress: unknown) {
    const settings = { theme: 'dark', sound: true, haptics: true, quick: false, levels: { italian: 1400, 'caro-kann': 1400 } };
    const backup = { app: 'chess-coach', version: 1, exportedAt: new Date().toISOString(), settings, progress };
    await page.goto('./#/settings');
    await chooseFile(page, 'backup.json', JSON.stringify(backup));
    await expect(page.getByRole('status').filter({ hasText: 'Progress restored.' })).toBeVisible();
  }

  test('reload keeps games, stats, theme and the last recap', async ({ page }) => {
    await restoreBackup(page, savedProgress([moment(3, true), moment(7, true), moment(15, false)]));

    for (const _ of [1, 2]) {
      await page.goto('./');
      await page.reload();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      await expect(page.getByText('2 of 3 key positions right this week')).toBeVisible();

      await page.goto('./#/progress');
      await page.reload();
      await expect(page.getByRole('region', { name: 'Italian Game' }).getByText('Games played')).toBeVisible();

      await page.goto('./#/recap');
      await page.reload();
      await expect(page.getByRole('heading', { name: 'Game complete' })).toBeVisible();
    }
  });

  test('reset clears it for good', async ({ page }) => {
    await restoreBackup(page, savedProgress([moment(3, true)]));
    await page.getByRole('button', { name: 'Reset progress' }).click();
    await page.getByRole('button', { name: 'Erase progress' }).click();
    await page.goto('./');
    await page.reload();
    await expect(page.getByText('Play a game to see your progress here.')).toBeVisible();
  });
});

test.describe('Recap', () => {
  const keyPositions = () => [
    moment(3, true),
    moment(7, true, { type: 'silent', outcomes: [{ step: 'solve', correct: true }] }),
    moment(15, false),
    moment(19, true, { outcomes: [{ step: 'spot', correct: true }, { step: 'find', correct: true }, { step: 'solve', correct: true }] }),
    moment(23, true, { type: 'nothing', kinds: [] }),
  ];

  test('lists the key positions of the last game in plain words', async ({ page }) => {
    await seed(page, savedProgress(keyPositions()));
    await page.goto('./#/recap');
    await expect(page.getByRole('heading', { name: 'Game complete' })).toBeVisible();
    const summary = page.getByRole('region', { name: 'Result' });
    await expect(summary.getByText('4 of 5')).toBeVisible();
    await expect(summary.getByText('key positions handled well')).toBeVisible();
    await expect(summary.locator('.result-bar i')).toHaveCount(5);
    await expect(summary.locator('.result-bar .missed')).toHaveCount(1);

    const list = page.getByRole('list', { name: 'Key positions' });
    await expect(list.getByText('Move 5 · Win back a pawn')).toBeVisible();
    await expect(list.getByText('Move 11 · Win material')).toBeVisible();
    await expect(list.getByText('Move 15 · Nothing special')).toBeVisible();
    await expect(list.getByText('Spotted it', { exact: true })).toBeVisible();
    await expect(list.getByText('Found it without a hint')).toBeVisible();
    await expect(list.getByText('Spotted it and found the move')).toBeVisible();
    await expect(list.getByText('Missed it')).toBeVisible();
    await expect(list.getByText('Right, nothing special')).toBeVisible();
  });

  test('"See it again" is only on a miss and opens that position', async ({ page }) => {
    await seed(page, savedProgress(keyPositions()));
    await page.goto('./#/recap');
    const again = page.getByRole('link', { name: /See it again/ });
    await expect(again).toHaveCount(1);
    await expect(again).toHaveAttribute('href', `#/play/italian/1400?review=${GAME}:15`);
    await again.click();
    await expect(page).toHaveURL(new RegExp(`#/play/italian/1400\\?review=${GAME}:15$`));
  });

  test('has one ink button and a close button', async ({ page }) => {
    await seed(page, savedProgress(keyPositions()));
    await page.goto('./#/recap');
    await expect(page.locator('main .btn')).toHaveCount(1);
    await expect(page.locator('main .btn-primary')).toHaveText('Next game');
    await page.getByRole('link', { name: 'Close' }).click();
    await expect(page.getByRole('heading', { name: 'Chess Coach.' })).toBeVisible();

    await page.goto('./#/recap');
    await page.getByRole('button', { name: 'Next game' }).click();
    await expect(page).toHaveURL(/#\/play\/italian\/1400$/);
  });

  test('says when the welcome-back bonus applied', async ({ page }) => {
    const progress = savedProgress(keyPositions());
    progress.lastGame.bonus = true;
    await seed(page, progress);
    await page.goto('./#/recap');
    await expect(page.getByText('Welcome back: this game counts double')).toBeVisible();
  });

  test('shows a new stage once, as a full-screen card', async ({ page }) => {
    const progress = savedProgress(keyPositions());
    await page.goto('./');
    await page.evaluate((p) => localStorage.setItem('cc.progress.v1', JSON.stringify({ ...p, lastGame: { ...p.lastGame, unlocked: 2 } })), progress);
    await page.goto('./#/recap');
    await page.reload();

    const card = page.getByRole('dialog', { name: 'New stage unlocked: Spot it, then play it' });
    await expect(card.getByText('Spot the moment, then play the best move')).toBeVisible();
    await card.getByRole('button', { name: 'Got it' }).click();
    await expect(card).toBeHidden();
    await expect(page.getByRole('heading', { name: 'Game complete' })).toBeVisible();

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Game complete' })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('without a game shows an empty state', async ({ page }) => {
    await page.goto('./#/recap');
    await expect(page.getByRole('heading', { name: 'No game to look back on yet' })).toBeVisible();
  });

  test('a game with no key positions says so', async ({ page }) => {
    await seed(page, savedProgress([]));
    await page.goto('./#/recap');
    await expect(page.getByText('No key positions came up in this game.')).toBeVisible();
  });
});

test.describe('Progress', () => {
  test('shows games, stage, reviews and the activity grid', async ({ page }) => {
    await seed(page, savedProgress([moment(3, true), moment(7, false)]));
    await page.goto('./#/progress');
    await expect(page.getByRole('heading', { name: 'Progress', level: 1 })).toBeVisible();
    const italian = page.getByRole('region', { name: 'Italian Game' });
    await expect(italian.getByText('Games played')).toBeVisible();
    await expect(italian.getByText('Stage 1 of 3: Spot it, then play it')).toBeVisible();
    await expect(italian.getByText('Reviews due')).toBeVisible();
    await expect(italian.getByRole('img', { name: 'Chances to win: 50% right' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Caro-Kann Defense' }).getByText('Not started yet')).toBeVisible();
    await expect(page.getByRole('img', { name: /Days you played/ })).toBeVisible();
    await expect(page.getByText(/streak/i)).toHaveCount(0);
  });

  test('has an empty state before the first game', async ({ page }) => {
    await page.goto('./#/progress');
    await expect(page.getByRole('heading', { name: 'Your progress shows up here' })).toBeVisible();
  });
});

test.describe('Phone layout', () => {
  // The SE project is 320px wide; 375px is the width most small phones have.
  test.use({ viewport: { width: 375, height: 667 } });

  const screens = [
    { name: 'Today', path: './' },
    { name: 'Progress', path: './#/progress' },
    { name: 'Settings', path: './#/settings' },
  ];

  for (const { name, path } of screens) {
    test(`${name} does not scroll sideways and the tab bar leaves the last button free`, async ({ page }) => {
      await seed(page, savedProgress([moment(3, true), moment(7, false)], { reviews: [{ opening: 'italian', level: 1400, gameId: GAME, ply: 7, type: 'pause', box: 0, due: Date.now() - DAY }] }));
      await page.goto(path);
      await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
      await page.waitForTimeout(600);

      const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(sideways).toBeLessThanOrEqual(0);

      await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
      const last = await page.evaluate(() => {
        const controls = [...document.querySelectorAll('main button, main a')].filter((el) => !el.closest('.tabbar'));
        return controls.at(-1)!.getBoundingClientRect().bottom;
      });
      const barTop = (await page.locator('.tabbar').boundingBox())!.y;
      expect(last).toBeLessThanOrEqual(barTop);
    });
  }
});

test.describe('Today on an iPhone 14', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('fits on one screen when nothing is due', async ({ page }) => {
    await seed(page, savedProgress([moment(3, true), moment(7, false)]));
    await page.goto('./');
    await expect(page.getByText('1 of 2 key positions right this week')).toBeVisible();
    const hidden = await page.evaluate(() => document.documentElement.scrollHeight - document.documentElement.clientHeight);
    expect(hidden).toBeLessThanOrEqual(0);
  });
});

test('About lists the data and licences', async ({ page }) => {
  await page.goto('./#/about');
  for (const name of ['Lichess games', 'Maia-2', 'Stockfish', 'chess.js', 'cm-chessboard', 'Chess pieces', 'canvas-confetti', 'Preact']) {
    await expect(page.getByRole('link', { name })).toBeVisible();
  }
  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
});
