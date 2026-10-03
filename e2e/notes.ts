import type { Page } from '@playwright/test';
import { FAMILIES, moveNoteId } from '../src/opening/notes';

const NOTE_IDS = [...new Set(Object.values(FAMILIES).flat())].flatMap((family) => [
  ...(family.plan ? [family.id] : []),
  ...Object.keys(family.notes).map((after) => moveNoteId(family, after)),
]);

/** Counts every opening note as read twice, so the coach's line under the board says what the game is doing. */
export async function readAllNotes(page: Page) {
  const notesSeen = Object.fromEntries(NOTE_IDS.map((id) => [id, 2]));
  await page.addInitScript((seen) => {
    if (!localStorage.getItem('cc.progress.v1')) localStorage.setItem('cc.progress.v1', JSON.stringify({ v: 1, notesSeen: seen }));
  }, notesSeen);
}
