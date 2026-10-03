import type { BadgeKind, BoardController } from '../board/types';

/** What the pause puts on the board besides pieces: highlights, arrows and badges. */
export class BoardMarks {
  private badged: string[] = [];

  constructor(private board: BoardController) {}

  badge(square: string, kind: BadgeKind): void {
    this.board.badge(square, kind);
    this.badged.push(square);
  }

  clearBadges(): void {
    this.badged.forEach((square) => this.board.badge(square, null));
    this.badged = [];
  }

  clear(): void {
    this.board.clearHighlights();
    this.board.clearArrows();
    this.clearBadges();
  }
}
