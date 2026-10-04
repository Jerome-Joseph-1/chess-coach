import type { Square } from 'chess.js';
import type { ArrowTone, Tone } from '../../board/types';
import type { Game } from '../../content/types';
import { playLine } from '../../learn/board';
import type { Beat } from '../../learn/walkthrough';

/** What the coach says and shows at each step of a trap's worked example; the positions come from the game. */
interface Script {
  /** The position as it stands: what makes the trap tempting. */
  look: Pick<Beat, 'text' | 'marks' | 'arrows'>;
  /** After the trap move and its reply. */
  whatIf: Pick<Beat, 'text' | 'marks' | 'arrows'>;
  /** Back to the position, asking for the safe move. */
  instead: { text: string; ask: string };
  /** Over the line that follows the safe move. */
  ending: string;
}

const mark = (square: Square, tone: Tone) => ({ square, tone });
const arrow = (from: Square, to: Square, tone: ArrowTone) => ({ from, to, tone });

const SCRIPTS: Record<string, Script> = {
  'trap-italian-shilling': {
    look: {
      text: "Black's knight moved to d4 and left the pawn on e5 with no guard. It looks free for your knight.",
      marks: [mark('e5', 'focus'), mark('d4', 'focus')],
      arrows: [arrow('f3', 'e5', 'mistake')],
    },
    whatIf: {
      text: 'If you take it, Qg5 attacks your knight and the pawn on g2 at once. Black wins back more than the pawn.',
      marks: [mark('e5', 'bad'), mark('g2', 'bad')],
      arrows: [arrow('g5', 'e5', 'threat'), arrow('g5', 'g2', 'threat')],
    },
    instead: {
      text: 'Instead, Nxd4 trades off the knight on d4 first. With it gone, the trick is gone too.',
      ask: 'Your move: take the knight on d4.',
    },
    ending: 'The knights are traded, so there is no trick left, and you keep a small edge.',
  },
  'trap-caro-kann-qe2': {
    look: {
      text: "White's queen on e2 and your king share the e-file. Only your e-pawn and White's knight on e4 stand between them.",
      marks: [mark('e2', 'focus'), mark('e8', 'focus'), mark('e7', 'focus'), mark('e4', 'focus')],
      arrows: [],
    },
    whatIf: {
      text: "If you play Ngf6, Nd6 is checkmate. Your e-pawn can't take: it would open the queen's line to your king. Your knight on d7 blocks your queen.",
      marks: [mark('e8', 'bad'), mark('d7', 'bad')],
      arrows: [arrow('d6', 'e8', 'threat'), arrow('e2', 'e8', 'threat')],
    },
    instead: {
      text: 'Instead, Ndf6 attacks the knight on e4 and clears d7, so your queen guards d6.',
      ask: 'Your move: bring the d7 knight to f6.',
    },
    ending: 'Now Nd6+ would only lose the knight to your queen, and the game is level.',
  },
};

/** The worked example of a trap lesson on its example game: the tempting move, what it runs into, then the safe move. */
export function trapBeats(game: Game): Beat[] | null {
  const script = SCRIPTS[game.id];
  const turn = game.turns[0];
  if (!script || !turn) return null;
  const best = turn.lines.best ?? [];
  const trap = playLine(turn.fen, (turn.lines.mistake ?? []).slice(0, 2));
  const [answer] = playLine(turn.fen, best.slice(0, 1));
  if (trap.length < 2 || !answer) return null;
  const ask: Beat = { fen: turn.fen, ...script.instead, marks: [], arrows: [arrow(answer.from, answer.to, 'best')], answer: best[0] };
  return [
    { fen: turn.fen, ...script.look },
    { fen: trap[1].after, ...script.whatIf },
    ask,
    { fen: answer.after, text: script.ending, marks: [], arrows: [], line: best.slice(1) },
  ];
}
