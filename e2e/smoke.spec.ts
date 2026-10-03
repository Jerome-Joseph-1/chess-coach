import { expect, test } from '@playwright/test';

test('home loads', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link')).toHaveText(['Today', 'Progress', 'Settings']);
});
