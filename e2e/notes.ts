import type { Page } from '@playwright/test';
import { FAMILIES, moveNoteId } from '../src/opening/notes';

const NOTE_IDS = [...new Set(Object.values(FAMILIES).flat())].flatMap((family) => [
  ...(family.plan ? [family.id] : []),
  ...Object.keys(family.notes).map((after) => moveNoteId(family, after)),
]);

/** A game finished in another set: the user has played before, so a game no longer opens with how it works. */
export const PLAYED_BEFORE = [{ opening: 'caro-kann', level: 1400, gameId: 'caro-kann-1400-0001', at: 1 }];

/**
 * A user who has finished a game and read every opening note twice: autoplay never stops for a plan,
 * and the coach's line under the board says what the game is doing.
 */
export async function returningPlayer(page: Page) {
  const notesSeen = Object.fromEntries(NOTE_IDS.map((id) => [id, 2]));
  await page.addInitScript(
    ({ seen, games }) => {
      if (!localStorage.getItem('cc.progress.v1')) localStorage.setItem('cc.progress.v1', JSON.stringify({ v: 1, notesSeen: seen, games }));
    },
    { seen: notesSeen, games: PLAYED_BEFORE },
  );
}
