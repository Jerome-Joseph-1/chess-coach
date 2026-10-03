import { expect, test } from '@playwright/test';

test('home loads', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Chess Coach.' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link')).toHaveText(['Today', 'Progress', 'Settings']);
});
