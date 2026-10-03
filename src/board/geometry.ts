/** The column and row of a square on screen, counted from the top left of the board. */
export function gridCell(square: string, flipped: boolean): { column: number; row: number } {
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]) - 1;
  return { column: flipped ? 7 - file : file, row: flipped ? rank : 7 - rank };
}

/** The square under a screen point, or null when the point is off the board. */
export function squareAtPoint(
  x: number,
  y: number,
  rect: { left: number; top: number; width: number },
  flipped: boolean,
): string | null {
  const size = rect.width / 8;
  const column = Math.floor((x - rect.left) / size);
  const row = Math.floor((y - rect.top) / size);
  if (column < 0 || column > 7 || row < 0 || row > 7) return null;
  const file = flipped ? 7 - column : column;
  const rank = flipped ? row : 7 - row;
  return `${'abcdefgh'[file]}${rank + 1}`;
}
