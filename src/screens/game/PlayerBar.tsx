import type { Color, PieceSymbol } from 'chess.js';
import pieceSprite from 'cm-chessboard/assets/pieces/standard.svg?no-inline';
import { lostPieces, materialLead } from '../../game/material';
import { RollingNumber } from '../../ui/RollingNumber';
import { leadLabel } from '../shared/labels';

/** The newest capture the board reported, so its piece can pop as it lands in the tray. */
export interface FreshCapture {
  type: PieceSymbol;
  color: Color;
  id: number;
}

export interface PlayerBarProps {
  role: 'opponent' | 'you';
  name: string;
  /** "1400" for the opponent's rating, "White" for the user's side. */
  detail: string;
  fen: string;
  color: Color;
  fresh: FreshCapture | null;
}

const other = (color: Color): Color => (color === 'w' ? 'b' : 'w');

function CapturedPiece({ type, color, popping }: { type: PieceSymbol; color: Color; popping: boolean }) {
  return (
    <svg class={`game-piece${popping ? ' is-popping' : ''}`} viewBox="4 4 32 32" aria-hidden="true">
      <use href={`${pieceSprite}#${color}${type}`} />
    </svg>
  );
}

/** What this player has taken, biggest first; the piece just taken pops in. */
function Tray({ fen, color, fresh }: Pick<PlayerBarProps, 'fen' | 'color' | 'fresh'>) {
  const taken = other(color);
  const pieces = lostPieces(fen, taken);
  const popAt = fresh?.color === taken ? pieces.lastIndexOf(fresh.type) : -1;
  return (
    <span class="game-captured" aria-label="Captured pieces">
      {pieces.map((type, i) => (
        <CapturedPiece key={i === popAt ? `${type}${i}:${fresh!.id}` : `${type}${i}`} type={type} color={taken} popping={i === popAt} />
      ))}
    </span>
  );
}

export function PlayerBar({ role, name, detail, fen, color, fresh }: PlayerBarProps) {
  const lead = materialLead(fen, color);
  return (
    <div class={`game-player is-${role}`}>
      <span class="game-avatar" aria-hidden="true">
        {name.charAt(0)}
      </span>
      <span class="game-player-name">{name}</span>
      <span class={`game-player-detail${role === 'opponent' ? ' is-mono' : ''}`}>{detail}</span>
      <Tray fen={fen} color={color} fresh={fresh} />
      {/* Stays mounted while level, so the first lead rolls in from zero. */}
      <span class={`game-lead${lead > 0 ? '' : ' is-level'}`} aria-hidden={lead <= 0}>
        <span aria-hidden="true">
          Up <RollingNumber value={Math.max(0, lead)} />
        </span>
        <span class="sr-only">{leadLabel(name, lead)}</span>
      </span>
    </div>
  );
}
