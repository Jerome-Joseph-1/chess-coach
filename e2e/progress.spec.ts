import { expect, test } from '@playwright/test';

test('settings persist across a reload', async ({ page }) => {
  await page.goto('./#/settings');
  await page.getByRole('button', { name: 'Dark' }).click();
  await page.getByRole('switch', { name: /Sound/ }).click();
  await page.getByRole('button', { name: '3', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await page.reload();

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('switch', { name: /Sound/ })).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByRole('button', { name: '3', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('the chosen level is remembered on Home', async ({ page }) => {
  await page.goto('./');
  const italian = page.getByRole('region', { name: 'Italian' });
  await italian.getByRole('button', { name: '1700' }).click();
  await page.reload();
  await expect(page.getByRole('region', { name: 'Italian' }).getByRole('button', { name: '1700' })).toHaveAttribute('aria-pressed', 'true');
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

test('recap and progress show a saved game', async ({ page }) => {
  const now = Date.now();
  const moment = { opening: 'italian', level: 1400, gameId: 'italian-1400-0001', ply: 3, moveNo: 5, type: 'pause', kinds: ['win'], depth: 1, outcomes: [{ step: 'spot', correct: true }], stars: 3, at: now };
  const summary = { opening: 'italian', level: 1400, gameId: 'italian-1400-0001', moments: [moment], at: now };
  const progress = {
    v: 1,
    moments: [moment],
    games: [{ opening: 'italian', level: 1400, gameId: 'italian-1400-0001', at: now }],
    lastGame: { summary, bonus: false },
  };
  await page.addInitScript((p) => localStorage.setItem('cc.progress.v1', JSON.stringify(p)), progress);

  await page.goto('./#/recap');
  await expect(page.getByRole('heading', { name: 'Game complete' })).toBeVisible();
  await expect(page.getByText('Move 5 · Winning chance')).toBeVisible();
  await expect(page.getByText('Found it')).toBeVisible();

  await page.goto('./#/progress');
  await expect(page.getByRole('heading', { name: 'Italian' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Italian' }).getByText('Games played')).toBeVisible();
});

test('recap without a game shows an empty state', async ({ page }) => {
  await page.goto('./#/recap');
  await expect(page.getByRole('heading', { name: 'No game to look back on yet' })).toBeVisible();
});
