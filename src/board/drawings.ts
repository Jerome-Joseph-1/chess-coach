export type DrawColor = 'green' | 'red' | 'blue' | 'orange';

export type Drawing =
  | { kind: 'arrow'; from: string; to: string; color: DrawColor }
  | { kind: 'circle'; square: string; color: DrawColor };

/** Lichess colours: Shift is red, Alt is blue, Ctrl is orange, and a plain right-click is green. */
export function colorFor(keys: { shiftKey: boolean; altKey: boolean; ctrlKey: boolean }): DrawColor {
  if (keys.ctrlKey) return 'orange';
  if (keys.shiftKey) return 'red';
  if (keys.altKey) return 'blue';
  return 'green';
}

function sameShape(a: Drawing, b: Drawing): boolean {
  if (a.kind === 'arrow' && b.kind === 'arrow') return a.from === b.from && a.to === b.to;
  if (a.kind === 'circle' && b.kind === 'circle') return a.square === b.square;
  return false;
}

/** Drawing the same thing again removes it; the same squares in another colour change colour. */
export function toggleDrawing(drawings: Drawing[], next: Drawing): Drawing[] {
  const existing = drawings.find((d) => sameShape(d, next));
  const others = drawings.filter((d) => d !== existing);
  return existing?.color === next.color ? others : [...others, next];
}

/** What a right-drag from one square to another draws: an arrow, or a circle when it ends where it began. */
export function drawingBetween(from: string, to: string, color: DrawColor): Drawing {
  return from === to ? { kind: 'circle', square: from, color } : { kind: 'arrow', from, to, color };
}
