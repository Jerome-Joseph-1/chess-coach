// Opening names and the coach's notes on the moves of the opening, looked up by the moves played so far.

export interface OpeningName {
  eco: string;
  name: string;
}

export interface OpeningNote {
  /** Stable id, used to count how often the note has been shown. */
  id: string;
  /** The variation it belongs to, shown above the note, e.g. "Two Knights Defence". */
  name: string | null;
  text: string;
}

/** The deepest named opening the moves reach, e.g. "Italian Game: Two Knights Defense". */
export function nameAt(_sans: string[]): OpeningName | null {
  return null;
}

/** The coach's note for the position these moves reach, if there is one. */
export function noteAt(_sans: string[]): OpeningNote | null {
  return null;
}

/** How long a note stays before autoplay moves on: enough to read it. */
export function readingMs(text: string): number {
  const words = text.trim().split(/\s+/).length;
  return Math.min(6000, Math.max(2000, words * 240));
}
