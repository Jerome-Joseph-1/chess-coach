/** A FEN without its move counters: placement, side to move, castling rights and en passant square. */
export function epd(fen: string): string {
  return fen.split(' ').slice(0, 4).join(' ');
}
