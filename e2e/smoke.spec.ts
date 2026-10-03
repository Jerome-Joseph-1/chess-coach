import { expect, test } from '@playwright/test';

test('home loads', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start lesson' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link')).toHaveText(['Today', 'Course', 'Progress', 'Settings']);
});
