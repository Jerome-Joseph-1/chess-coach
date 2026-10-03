import { expect, test, type Page } from '@playwright/test';

// The test course teaches three units over the two test games: free pieces, pins, traps.
const DAY = 86_400_000;
const KEY = 'cc.progress.v1';

function done(at: number, answers: boolean[] = []) {
  const drills = answers.map((correct, i) => ({ key: `italian-1400/italian-1400-000${i + 1}:3`, correct, at }));
  return { learnedAt: at - 60_000, doneAt: at, drills };
}

function progress(lessons: Record<string, unknown>, gamesAt: number[] = []) {
  const games = gamesAt.map((at, i) => ({ opening: 'italian', level: 1400, gameId: `italian-1400-000${i + 1}`, at }));
  return { v: 1, games, lessons: { italian: lessons } };
}

async function seed(page: Page, saved: unknown) {
  await page.addInitScript(([key, value]) => localStorage.setItem(key, JSON.stringify(value)), [KEY, saved] as const);
}

test.describe('Course', () => {
  test('sits between Today and Progress and lists the lessons in teaching order, the first one next', async ({ page }) => {
    await page.goto('./');
    const tabs = page.getByRole('navigation', { name: 'Main' });
    await expect(tabs.getByRole('link')).toHaveText(['Today', 'Course', 'Progress', 'Settings']);
    await tabs.getByRole('link', { name: 'Course' }).click();

    await expect(page).toHaveURL(/#\/course$/);
    await expect(page.getByRole('heading', { name: 'Course', level: 1 })).toBeVisible();
    await expect(tabs.getByRole('link', { name: 'Course' })).toHaveAttribute('aria-current', 'page');
    const lessons = page.getByRole('region', { name: 'Lessons' });
    await expect(lessons.getByText('0 of 3 done')).toBeVisible();
    const rows = lessons.getByRole('listitem');
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText('Free pieces');
    await expect(rows.nth(0)).toContainText('A piece nobody guards: take it.');
    await expect(rows.nth(0)).toContainText('Next');
    for (const [i, title] of ['Pins', 'Traps'].entries()) {
      await expect(rows.nth(i + 1)).toContainText(title);
      await expect(rows.nth(i + 1)).toContainText('Later');
    }
  });

  test('the next lesson opens and later ones are not links', async ({ page }) => {
    await page.goto('./#/course');
    const lessons = page.getByRole('region', { name: 'Lessons' });
    await expect(lessons.getByRole('link')).toHaveCount(1);
    await lessons.getByRole('link', { name: /Free pieces/ }).click();
    await expect(page).toHaveURL(/#\/lesson\/italian\/free-piece$/);
  });

  test('a done lesson shows its score and opens again; the next one waits for two games', async ({ page }) => {
    await seed(page, progress({ 'free-piece': done(Date.now() - DAY, [true, false]) }));
    await page.goto('./#/course');
    await expect(page.getByText('Next lesson after 2 more games.')).toBeVisible();
    const lessons = page.getByRole('region', { name: 'Lessons' });
    await expect(lessons.getByText('1 of 3 done')).toBeVisible();
    const rows = lessons.getByRole('listitem');
    await expect(rows.nth(0)).toContainText('Done');
    await expect(rows.nth(0)).toContainText('1 of 2 right');
    await expect(rows.nth(1)).toContainText('Next');
    await expect(lessons.getByRole('link')).toHaveCount(2);

    await lessons.getByRole('link', { name: /Pins/ }).click();
    await expect(page).toHaveURL(/#\/lesson\/italian\/pin$/);
    await page.goBack();
    await page.getByRole('region', { name: 'Lessons' }).getByRole('link', { name: /Free pieces/ }).click();
    await expect(page).toHaveURL(/#\/lesson\/italian\/free-piece$/);
  });

  test('says so when the level has no lessons yet', async ({ page }) => {
    await page.goto('./#/course');
    await page.getByRole('group', { name: 'Opening' }).getByRole('button', { name: 'Caro-Kann' }).click();
    await expect(page.getByText('Lessons for this level are on the way.')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Lessons' })).toHaveCount(0);
  });

  test('the lesson address only takes a known opening and unit', async ({ page }) => {
    await page.goto('./#/lesson/italian/forks');
    await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();
    await page.goto('./#/lesson/sicilian/fork');
    await expect(page.getByRole('heading', { name: 'Today', level: 1 })).toBeVisible();
  });
});

test.describe('Today with the course', () => {
  test('offers the first lesson at once, with one main button', async ({ page }) => {
    await page.goto('./');
    const card = page.getByRole('region', { name: 'Free pieces' });
    await expect(card.getByText('Up next · Lesson 1')).toBeVisible();
    await expect(card.getByText('A piece nobody guards: take it.')).toBeVisible();
    await expect(page.locator('main .btn-primary')).toHaveCount(1);
    await card.getByRole('button', { name: 'Start lesson' }).click();
    await expect(page).toHaveURL(/#\/lesson\/italian\/free-piece$/);
  });

  test('"Play a game instead" starts a game', async ({ page }) => {
    await page.goto('./');
    await page.getByRole('link', { name: 'Play a game instead' }).click();
    await expect(page).toHaveURL(/#\/play\/italian\/1400$/);
  });

  test('after a lesson, two games come before the next one', async ({ page }) => {
    const lessonAt = Date.now() - DAY;
    await page.goto('./');
    for (const [games, expected] of [
      [[], 'game'],
      [[lessonAt + 1000], 'game'],
      [[lessonAt + 1000, lessonAt + 2000], 'lesson'],
    ] as const) {
      await page.evaluate(([key, value]) => localStorage.setItem(key, JSON.stringify(value)), [KEY, progress({ 'free-piece': done(lessonAt) }, [...games])] as const);
      await page.reload();
      if (expected === 'game') {
        await expect(page.getByRole('region', { name: 'Italian Game' }).getByRole('button', { name: 'Play', exact: true })).toBeVisible();
        await expect(page.getByRole('link', { name: 'Play a game instead' })).toHaveCount(0);
      } else {
        await expect(page.getByRole('region', { name: 'Pins' }).getByRole('button', { name: 'Start lesson' })).toBeVisible();
      }
    }
  });

  test('a set without a course keeps the game card', async ({ page }) => {
    await page.goto('./');
    await page.getByRole('group', { name: 'Opening' }).getByRole('button', { name: 'Caro-Kann' }).click();
    const card = page.getByRole('region', { name: 'Caro-Kann Defense' });
    await expect(card.getByRole('button', { name: 'Coming soon' })).toBeDisabled();
    await expect(page.getByRole('link', { name: 'Play a game instead' })).toHaveCount(0);
  });
});
