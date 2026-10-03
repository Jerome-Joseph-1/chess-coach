import type { Square } from 'chess.js';
import type { Game } from '../content/types';
import { ideaOf } from './ideas';
import type { Tactic, TacticId } from './tactics';
import { themeFor, type Theme } from './themes';

export interface Lesson {
  theme: Theme;
  /** Two or three words for the theme chip, e.g. "Trapped piece". */
  name: string;
  /** One sentence on why it works in this position. */
  idea: string;
  /** A nudge that names the pattern without giving the move. */
  hint: string;
  /** A takeaway to reuse in other games. */
  remember: string;
  /** Squares to highlight. */
  squares: Square[];
}

/** Everything the reveal needs to teach the turn's position. */
export function lessonFor(game: Game, turnIndex: number): Lesson {
  const theme = themeFor(game, turnIndex);
  const fen = game.turns[turnIndex].fen;
  const best = game.turns[turnIndex].lines.best?.[0];
  return {
    theme,
    name: nameOf(theme),
    idea: ideaOf(theme, game.side, { fen, best }),
    hint: hintOf(theme),
    remember: rememberOf(theme),
    squares: [...new Set(theme.pieces.map((p) => p.square))],
  };
}

const STOP: Partial<Record<TacticId, string>> = {
  checkmate: 'Stop the mate',
  'mate-threat': 'Stop the attack',
  fork: 'Stop the fork',
  pin: 'Stop the pin',
  skewer: 'Stop the skewer',
  'discovered-attack': 'Stop the discovery',
  'trapped-piece': 'Free your piece',
  'remove-defender': 'Keep your defender',
};

function nameOf(theme: Theme): string {
  const t = theme.tactic;
  switch (theme.id) {
    case 'free-piece':
      return 'Free piece';
    case 'fork':
      return 'Fork';
    case 'pin':
      return 'Pin';
    case 'skewer':
      return 'Skewer';
    case 'discovered-attack':
      return t?.id === 'discovered-attack' && t.target.type === 'k' ? 'Discovered check' : 'Discovered attack';
    case 'trapped-piece':
      return 'Trapped piece';
    case 'remove-defender':
      return 'Remove the defender';
    case 'checkmate':
      if (t?.id === 'checkmate' && t.backRank) return 'Back-rank mate';
      return t && t.key > 0 ? 'Forced mate' : 'Checkmate';
    case 'mate-threat':
      return 'Mate threat';
    case 'material-win':
      return 'Win material';
    case 'hanging-own':
      return t?.won?.type === 'p' ? 'Pawn in danger' : 'Piece in danger';
    case 'threat-other':
      if (t?.id === 'pin' && t.how === 'defender') return 'Pinned defender';
      return (theme.pattern && STOP[theme.pattern]) ?? "Opponent's threat";
    case 'bait':
      if (theme.bait?.kind === 'grab') return theme.bait.move.captured === 'p' ? 'Poisoned pawn' : 'Poisoned piece';
      return 'Avoid the trap';
    case 'quiet':
      return 'Quiet position';
  }
}

const HINTS: Record<TacticId, string> = {
  'free-piece': 'Is any enemy piece not defended enough?',
  fork: 'One move can attack two things.',
  pin: "A pinned piece can't run.",
  skewer: 'Attack the big piece, and look at what stands behind it.',
  'discovered-attack': "Move one piece out of another's way.",
  'trapped-piece': "Look for a piece that can't escape.",
  'remove-defender': 'Find the piece doing the defending, then take it away.',
  checkmate: 'Look at every check: is one of them mate?',
  'mate-threat': 'Can you threaten mate?',
  'material-win': 'Look at checks and captures first.',
};

const THREAT_HINTS: Partial<Record<TacticId, string>> = {
  checkmate: 'Your king is in danger. What checks does your opponent have?',
  'mate-threat': 'Your opponent is building an attack on your king.',
  fork: 'Your opponent is eyeing a fork.',
  pin: 'Watch out for a pin.',
  skewer: 'Watch out for a skewer.',
  'discovered-attack': 'Watch out for a discovered attack.',
  'trapped-piece': 'One of your pieces is running out of squares.',
  'remove-defender': 'One of your defenders is under fire.',
};

const QUIET_HINTS = {
  castle: 'Is your king safe yet?',
  develop: "Which pieces haven't moved yet?",
  king: 'No tactics here. Which piece could do more?',
  improve: 'No tactics here. Which piece could do more?',
};

function hintOf(theme: Theme): string {
  const t = theme.tactic;
  switch (theme.id) {
    case 'quiet':
      return QUIET_HINTS[theme.quiet?.focus ?? 'improve'];
    case 'hanging-own':
      return 'Is one of your pieces in danger?';
    case 'threat-other':
      return (theme.pattern && THREAT_HINTS[theme.pattern]) ?? 'What does your opponent want to do next?';
    case 'bait':
      if (theme.bait?.kind === 'grab') return 'Is that capture really free?';
      if (theme.bait?.kind === 'allows-mate') return "Check your king's safety before you move.";
      return 'The obvious move has a catch.';
    case 'checkmate':
      return t?.id === 'checkmate' && t.backRank ? 'The king is stuck on its back rank.' : HINTS.checkmate;
    case 'pin':
      return t?.id === 'pin' && t.how === 'created' ? 'Line up on a piece with something bigger behind it.' : HINTS.pin;
    default:
      return HINTS[theme.id];
  }
}

const REMEMBER: Record<TacticId, string> = {
  'free-piece': 'Every move, check each enemy piece: is it defended?',
  fork: 'Look for moves that attack two things at once, especially with check.',
  pin: 'A pinned piece is a weak piece: attack it again, ideally with a pawn.',
  skewer: 'When the king or queen lines up with another piece, look for a skewer.',
  'discovered-attack': "When one of your pieces blocks another's line, moving it can make two threats at once.",
  'trapped-piece': 'Before attacking a piece, count its escape squares.',
  'remove-defender': 'If a piece has only one guard, take or chase the guard away.',
  checkmate: 'Always look at every check: one of them might be mate.',
  'mate-threat': 'A mate threat forces an answer, which can win material elsewhere.',
  'material-win': 'Every move, look at checks, captures and threats, in that order.',
};

const THREAT_REMEMBER: Partial<Record<TacticId, string>> = {
  checkmate: 'Every move, ask what checks your opponent has.',
  'mate-threat': 'When pieces gather near your king, count attackers and defenders there.',
  fork: 'Look for squares where one enemy piece could attack two of yours.',
  pin: 'Keep pieces off the line between an enemy bishop, rook or queen and your king or queen.',
  skewer: "Don't leave your king or queen on a line with another piece the enemy can hit.",
  'trapped-piece': 'Pieces deep in enemy territory can run out of squares. Count them.',
  'discovered-attack': 'Watch enemy pieces lined up behind each other: moving the front one can uncover an attack.',
};

const BAIT_REMEMBER = {
  'allows-mate': "Before you move, look at your opponent's checks.",
  grab: 'A free pawn is often bait. Check what grabbing it costs.',
  'walks-into': 'Before moving a piece, make sure its new square is safe.',
  'opens-line': 'When a piece moves, check which enemy lines it was blocking.',
  unguards: 'When a piece moves, check what it stops protecting.',
  other: "Before you move, ask what your opponent's best reply is.",
};

const QUIET_REMEMBER = {
  castle: 'Castle early to keep your king safe.',
  develop: 'In the opening, bring out a new piece with each move.',
  king: 'In the endgame, the king is a strong piece. Bring it towards the centre.',
  improve: 'When nothing is happening, improve your worst piece.',
};

function rememberOf(theme: Theme): string {
  const t = theme.tactic;
  switch (theme.id) {
    case 'quiet':
      return QUIET_REMEMBER[theme.quiet?.focus ?? 'improve'];
    case 'hanging-own':
      return 'Before every move, ask: what is my opponent attacking?';
    case 'threat-other':
      if (t?.id === 'checkmate' && t.backRank) return "Give your king an escape square so it can't be mated on the back rank.";
      return (theme.pattern && THREAT_REMEMBER[theme.pattern]) ?? 'Before your move, ask what your opponent wants to do next.';
    case 'bait':
      if (theme.bait?.kind === 'grab' && theme.bait.move.captured !== 'p') return 'If a piece looks free, check what taking it costs.';
      return BAIT_REMEMBER[theme.bait?.kind ?? 'other'];
    case 'fork':
      if (t?.id === 'fork' && t.forker.type === 'n') return 'Knights fork well: check every square your knight can jump to, especially with check.';
      if (t?.id === 'fork' && t.forker.type === 'p') return 'A pawn push can attack two pieces at once.';
      return REMEMBER.fork;
    case 'pin':
      return t?.id === 'pin' && t.how === 'created' ? 'When a piece stands in front of the king or queen, look for a pin.' : REMEMBER.pin;
    case 'trapped-piece':
      return trappedRemember(t);
    case 'free-piece':
      if (t?.id === 'free-piece' && t.reason === 'cheaper') return 'Taking a bigger piece with a smaller one wins even if yours is taken back.';
      if (t?.id === 'free-piece' && t.reason === 'outnumbered') return 'Count attackers and defenders: if you have more, you can win it.';
      return REMEMBER['free-piece'];
    case 'checkmate':
      if (t?.id === 'checkmate' && t.backRank) return 'A king with no escape square can be mated on its back rank.';
      return t && t.key > 0 ? "Checks limit your opponent's choices, so they can lead to a forced mate." : REMEMBER.checkmate;
    default:
      return REMEMBER[theme.id];
  }
}

function trappedRemember(t: Tactic | null): string {
  if (t?.id !== 'trapped-piece') return REMEMBER['trapped-piece'];
  const { type, square } = t.trapped;
  const onEdge = 'ah'.includes(square[0]) || '18'.includes(square[1]);
  if (type === 'n' && onEdge) return 'Knights on the edge have few squares. Look for pawn moves that attack them.';
  if (type === 'q') return 'Even a queen can get trapped when it goes deep into enemy territory.';
  if (type === 'b') return 'A bishop hemmed in by pawns can get trapped. Count its squares.';
  return REMEMBER['trapped-piece'];
}
