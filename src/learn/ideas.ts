import { Chess, type Color } from 'chess.js';
import { NAME } from '../board/captions';
import { isBetween, isLoose, otherColor, pieceOn, playLine, type PieceAt } from './board';
import { wonInPlace, type Tactic, type TacticId } from './tactics';
import type { Theme } from './themes';
import { capitalize, colorName, listOf, onSquare, refer, sequence, tradeText } from './words';

/** The turn's position and best move, for sentences about what the best move does. */
export interface Position {
  fen: string;
  best?: string;
}

/** One plain sentence on why the theme works in this position. */
export function ideaOf(theme: Theme, user: Color, position: Position): string {
  const t = theme.tactic;
  switch (theme.id) {
    case 'quiet':
      return quietIdea(theme);
    case 'bait':
      return baitIdea(theme, user);
    case 'hanging-own':
      return t ? hangingIdea(t, user, position) : GENERAL.defend;
    case 'threat-other':
      return t ? threatIdea(t, user) : GENERAL.defend;
    default:
      return t ? winIdea(t, user) : GENERAL.win;
  }
}

type Of<K extends TacticId> = Extract<Tactic, { id: K }>;

/** What every sentence about the user's own tactic needs. */
interface Say {
  /** The opponent, "White" or "Black". */
  them: string;
  /** "After Rxe8+ Qxe8, " when the tactic needs moves first. */
  lead: string;
  /** The move that makes the tactic. */
  move: string;
  ref: (piece: PieceAt) => string;
}

// Longest runs of moves worth spelling out: as a lead-in, and as a whole line.
const SHORT_LINE = 4;
const LONG_LINE = 6;

const GENERAL = {
  win: 'There is a strong move here that wins material.',
  defend: 'Your opponent has a threat here, and it needs an answer.',
  trap: 'The natural move here has a catch: it loses material.',
};

function san(t: Tactic, index = t.at): string {
  return t.moves[index].san;
}

/** Joins a lead-in to a clause, capitalizing whichever comes first. */
function sentence(lead: string, clause: string): string {
  return lead ? lead + clause : capitalize(clause);
}

/** Whether the opponent takes back on the square the tactic's move just captured on. */
function takenBack(t: Tactic): boolean {
  const move = t.moves[t.at];
  return Boolean(move.captured) && t.moves[t.at + 1]?.to === move.to;
}

/** " takes the bishop and" (or " trades queens and") when the move also captures a piece. */
function takesPiece(t: Tactic): string {
  const taken = t.moves[t.at].captured;
  if (!taken || taken === 'p') return '';
  if (taken === 'q' && takenBack(t)) return ' trades queens and';
  return ` takes the ${NAME[taken]} and`;
}

/** "your rook on e8", or just "your rook" when it is taken somewhere else. */
function wonText(t: Tactic, user: Color): string {
  const won = t.won!;
  if (wonInPlace(t)) return refer(won, user);
  return `${won.color === user ? 'your' : 'the'} ${NAME[won.type]}`;
}

function winIdea(t: Tactic, user: Color): string {
  const say: Say = {
    them: colorName(otherColor(t.side)),
    lead: t.at === 0 ? '' : `After ${sequence(t.moves.slice(0, t.at))}, `,
    move: san(t),
    ref: (piece) => refer(piece, user),
  };
  switch (t.id) {
    case 'checkmate':
      return mateIdea(t);
    case 'fork':
      return forkIdea(t, say);
    case 'pin':
      return pinIdea(t, say);
    case 'skewer':
      return skewerIdea(t, say);
    case 'discovered-attack':
      return discoveredIdea(t, say);
    case 'trapped-piece':
      return trappedIdea(t, say);
    case 'remove-defender':
      return removeDefenderIdea(t, say);
    case 'mate-threat':
      return mateThreatIdea(t, say);
    case 'free-piece':
      return freePieceIdea(t, say);
    case 'material-win':
      return materialIdea(t, say);
  }
}

function mateIdea(t: Of<'checkmate'>): string {
  const mate = san(t, t.key);
  const rank = t.backRank ? ' on the back rank' : '';
  if (t.key === 0) {
    return t.backRank
      ? `${mate} is mate on the back rank: the king is boxed in by its own ${t.boxedByPawns ? 'pawns' : 'pieces'}.`
      : `${mate} is checkmate: the king has no way out.`;
  }
  if (t.key === 2) return `${san(t, 0)} forces mate: after ${san(t, 1)}, ${mate} is checkmate${rank}.`;
  return `${san(t, 0)} starts a forced mate that ends with ${mate}${rank}.`;
}

function forkIdea(t: Of<'fork'>, { them, lead, move, ref }: Say): string {
  const won = t.targets.find((p) => p.square === t.won?.square);
  const others = t.targets.filter((p) => p.type !== 'k');
  const takes = takesPiece(t);
  if (t.targets.some((p) => p.type === 'k')) {
    const hit = `${lead}${move}${takes} checks the king and attacks ${listOf((won ? [won] : others).map(ref))} at the same time`;
    return won ? `${hit}, so the ${NAME[won.type]} falls.` : `${hit}, and ${them} can't avoid losing material.`;
  }
  const hit = `${lead}${move}${takes} attacks ${listOf(others.map(ref))} at once`;
  if (!won) return `${hit}, and ${them} can't avoid losing material.`;
  return `${hit}, and ${them} can't save ${others.length > 2 ? 'them all' : 'both'}.`;
}

function pinIdea(t: Of<'pin'>, { them, lead, move, ref }: Say): string {
  const { pinned, behind, pinner } = t.pin;
  const toBehind = behind.type === 'k' ? 'the king' : ref(behind);
  const pin = `${ref(pinned)} is pinned to ${toBehind} by ${ref(pinner)}`;
  switch (t.how) {
    case 'created': {
      const why = behind.type === 'k' ? `${them} can't save it` : `if it moves, ${toBehind} is lost`;
      return `${lead}${move} pins ${ref(pinned)} to ${toBehind}, and ${why}.`;
    }
    case 'exposed': {
      const wins = `${san(t, t.key)} wins the ${NAME[behind.type]}`;
      if (t.key > SHORT_LINE) return `${capitalize(pin)}, so when it moves away, ${wins}.`;
      return `${capitalize(pin)}: after ${sequence(t.moves.slice(0, t.key))}, ${wins}.`;
    }
    case 'attacked': {
      const reply = t.moves[t.at + 1];
      if (reply?.to === t.moves[t.at].to) return `${sentence(lead, pin)}: after ${move} ${reply.san}, ${san(t, t.key)} wins it.`;
      return `${sentence(lead, pin)}, so it can't run when ${move} attacks it.`;
    }
    case 'defender': {
      const why = behind.type === 'k' ? "it's pinned to the king" : `that would expose ${toBehind}`;
      const wins = t.key === t.at ? tradeText(t.trade) : 'material';
      return `${capitalize(ref(pinned))} can't safely take back on ${t.moves[t.at].to} because ${why}, so ${move} wins ${wins}.`;
    }
  }
}

function skewerIdea(t: Of<'skewer'>, { lead, move, ref }: Say): string {
  if (t.front.type === 'k') return `${lead}${move} checks the king, and once it steps aside you take ${ref(t.back)} behind it.`;
  return `${lead}${move} attacks ${ref(t.front)}, and when it moves away you take ${ref(t.back)} behind it.`;
}

function discoveredIdea(t: Of<'discovered-attack'>, { them, lead, move, ref }: Say): string {
  const played = t.moves[t.at];
  const slider = ref(t.slider);
  const fallout = `${them} can't avoid losing material`;
  if (t.target.type === 'k') {
    if (t.at === t.key) {
      return `${lead}${move} takes the ${NAME[played.captured!]} with a discovered check from ${slider}, so ${them} must answer the check first.`;
    }
    const moverTakes = t.won && t.moves[t.key].from === played.to;
    if (!moverTakes) return `${lead}${move} uncovers check from ${slider}, and ${fallout}.`;
    return `${lead}${move} uncovers check from ${slider}, and while ${them} deals with it you take the ${onSquare(t.won!)}.`;
  }
  const target = ref(t.target);
  if (t.at === t.key) {
    return `${lead}${move} takes the ${NAME[played.captured!]} and opens the line from ${slider} to ${target}, so ${them} can't both take back and save the ${NAME[t.target.type]}.`;
  }
  const check = move.includes('+') ? ' gives check and' : '';
  const opens = `${lead}${move}${check} opens the line from ${slider} to ${target}`;
  if (t.won?.square !== t.target.square || !wonInPlace(t)) return `${opens}, and ${fallout}.`;
  return `${opens}, so the ${NAME[t.target.type]} falls.`;
}

function trappedIdea(t: Of<'trapped-piece'>, { lead, move, ref }: Say): string {
  const piece = ref(t.trapped);
  const played = t.moves[t.at];
  if (t.attacker.square !== played.to) {
    if (isBetween(t.attacker.square, played.from, t.trapped.square)) {
      return `${lead}${move} opens the line from ${ref(t.attacker)} to ${piece}, which has no safe square.`;
    }
    return `${lead}${move} leaves ${piece} attacked, and every square it could go to is covered.`;
  }
  const takes = played.captured ? ` takes a ${NAME[played.captured]} and` : '';
  if (t.escapes === 0) return `${lead}${move}${takes} attacks ${piece}, which has no square to go to.`;
  return `${capitalize(piece)} has no safe square: ${lead.replace('After', 'after')}${move} attacks it, and every square it could go to is covered.`;
}

function removeDefenderIdea(t: Of<'remove-defender'>, { lead, move, ref }: Say): string {
  const guard = ref(t.defender);
  const guarded = ref(t.guarded);
  const falls = `then the ${NAME[t.guarded.type]} on ${t.guarded.square} falls`;
  if (t.how === 'capture') {
    const takes = takenBack(t) ? 'trades off' : 'takes';
    return `${lead}${move} ${takes} ${guard}, which guards ${guarded}, and ${falls}.`;
  }
  const takes = takesPiece(t);
  if (t.how === 'chase') return `${lead}${move}${takes} chases away ${guard}, which guards ${guarded}, and ${falls}.`;
  return `${lead}${move}${takes} lures ${guard} away from guarding ${guarded}, and ${falls}.`;
}

function mateThreatIdea(t: Of<'mate-threat'>, { them, lead, move, ref }: Say): string {
  const threat = `${lead}${move} threatens mate with ${t.mate.san.replace('#', '')}`;
  const played = t.moves[t.at];
  const hits = t.won && wonInPlace(t) && new Chess(played.after).attackers(t.won.square, t.side).includes(played.to);
  if (hits) return `${threat} and attacks ${ref(t.won!)} at the same time, so the ${NAME[t.won!.type]} falls.`;
  return `${threat}, and ${them}'s best defence still loses ${tradeText(t.trade)}.`;
}

function freePieceIdea(t: Of<'free-piece'>, { them, move, ref }: Say): string {
  const target = ref(t.won!);
  // Further captures in the line change the count, so only a lone gain is "it".
  const alone = t.trade.won.length === 1 && !t.trade.lost.length;
  if (t.reason === 'undefended') return `Nothing defends ${target}, so ${move} wins ${alone ? 'it for free' : 'material'}.`;
  if (t.reason === 'cheaper') {
    return `${capitalize(target)} is worth more than your ${NAME[t.moves[0].piece]}, so ${move} wins material even if ${them} takes back.`;
  }
  return `${capitalize(target)} isn't defended enough, so ${move} wins ${alone ? 'it' : 'material'}.`;
}

function materialIdea(t: Of<'material-win'>, { move }: Say): string {
  const { won, lost } = t.trade;
  if (t.key === 0 && won.length === 1 && !lost.length && t.moves[0].captured === won[0]) {
    return `${move} wins ${tradeText(t.trade)}.`;
  }
  const end = Math.max(t.key, 1, ...t.trade.gains);
  const wins = `${move} starts a sequence that wins ${tradeText(t.trade)}`;
  if (end > LONG_LINE) return `${wins}, ending with ${san(t, end)}.`;
  return `${wins}: ${sequence(t.moves.slice(0, end + 1))}.`;
}

function hangingIdea(t: Tactic, user: Color, position: Position): string {
  const capture = t.moves[0];
  const mine = t.won!;
  const attacker = pieceOn(new Chess(capture.before), capture.from)!;
  const reason = t.id === 'free-piece' ? t.reason : 'outnumbered';
  const why = {
    undefended: 'and nothing defends it',
    cheaper: 'a cheaper piece',
    outnumbered: "and it isn't defended enough",
  }[reason];
  return `${capitalize(refer(mine, user))} is attacked by ${refer(attacker, user)}, ${why}${saveClause(mine, position)}.`;
}

/** What the best move does for the threatened piece, when it clearly moves it or adds a guard. */
function saveClause(mine: PieceAt, { fen, best }: Position): string {
  if (!best) return '';
  if (best.slice(0, 2) === mine.square) return ', so it needs to move';
  const [move] = playLine(fen, [best]);
  if (!move || move.san.includes('+')) return '';
  const guards = (at: string) => new Chess(at).attackers(mine.square, mine.color).length;
  const guarded = guards(move.after) > guards(move.before) && !isLoose(move.after, mine.square);
  return guarded ? ', so it needs protecting' : '';
}

function threatIdea(t: Tactic, user: Color): string {
  const opp = colorName(t.side);
  const move = t.at === 0 ? san(t) : `${sequence(t.moves.slice(0, t.at))} and then ${san(t)}`;
  const threatens = `${opp} threatens ${move}`;
  const ref = (p: PieceAt) => refer(p, user);
  switch (t.id) {
    case 'checkmate': {
      const mate = san(t, 0).replace('#', '');
      if (t.key > 0) return `${opp} threatens a forced mate that starts with ${san(t, 0)}.`;
      if (!t.backRank) return `${opp} threatens checkmate with ${mate}.`;
      return `${opp} threatens mate on your back rank with ${mate}: your king is boxed in by its own ${t.boxedByPawns ? 'pawns' : 'pieces'}.`;
    }
    case 'fork': {
      const others = t.targets.filter((p) => p.type !== 'k').map(ref);
      if (others.length < t.targets.length) return `${threatens}, checking your king and attacking ${listOf(others)} at the same time.`;
      return `${threatens}, attacking ${listOf(others)} at once.`;
    }
    case 'pin': {
      const { pinned, behind } = t.pin;
      const pin = `${capitalize(ref(pinned))} is pinned to ${ref(behind)}`;
      if (t.how === 'created') return `${threatens}, pinning ${ref(pinned)} to ${ref(behind)}.`;
      if (t.how === 'attacked') return `${pin}, and ${opp} threatens to attack it with ${move}.`;
      if (t.how === 'exposed') return `${pin}, and ${opp} threatens to exploit it with ${move}.`;
      return `${threatens}: ${ref(pinned)} can't safely take back because it's pinned to ${ref(behind)}.`;
    }
    case 'skewer':
      return `${threatens}, attacking ${ref(t.front)} with ${ref(t.back)} behind it on the same line.`;
    case 'discovered-attack':
      if (t.target.type === 'k') return `${threatens}, which uncovers check from ${ref(t.slider)}.`;
      return `${threatens}, which opens the line from ${ref(t.slider)} to ${ref(t.target)}.`;
    case 'trapped-piece':
      return `${capitalize(ref(t.trapped))} is short of squares: ${opp} threatens ${move}, and it would have nowhere safe to go.`;
    case 'remove-defender':
      return `${threatens}, which removes a defender of ${ref(t.guarded)}.`;
    case 'mate-threat':
      return `${threatens}, with the idea of mate on ${t.mate.to}.`;
    default:
      return `${threatens}, which wins ${t.won ? wonText(t, user) : 'material'}.`;
  }
}

function baitIdea(theme: Theme, user: Color): string {
  const { bait, tactic: t } = theme;
  if (!bait) return GENERAL.trap;
  const move = bait.move.san;
  if (!t) return `${move} looks natural, but it loses material.`;
  const reply = replyText(t, user);
  switch (bait.kind) {
    case 'allows-mate':
      return t.key === 0
        ? `${move} looks fine, but it allows ${san(t, 0).replace('#', '')}, checkmate.`
        : `${move} looks fine, but it allows a forced mate that starts with ${san(t, 0)}.`;
    case 'grab': {
      const grabbed = bait.move.captured === 'p' ? 'a pawn' : `the ${NAME[bait.move.captured!]}`;
      const opens = bait.opened ? ` it opens the line for ${refer(bait.opened, user)}, and` : '';
      return `${move} grabs ${grabbed}, but${opens} ${reply}.`;
    }
    case 'opens-line': {
      const opens = `${move} opens the line from ${refer(bait.opened!, user)} to ${refer(t.won!, user)}`;
      return t.key === 0 ? `${opens}, so ${san(t, 0)} wins it.` : `${opens}, and ${reply}.`;
    }
    case 'walks-into': {
      if (t.id !== 'free-piece') return `${move} looks natural, but ${reply}.`;
      const attacker = pieceOn(new Chess(t.moves[0].before), t.moves[0].from)!;
      const piece = `your ${NAME[bait.move.promotion ?? bait.move.piece]}`;
      return `${move} puts ${piece} where ${refer(attacker, user)} can take it, and ${san(t)} wins it.`;
    }
    case 'unguards': {
      const unguards = `${move} moves the ${NAME[bait.move.piece]} that was guarding ${refer(t.won!, user)}`;
      return t.key === 0 ? `${unguards}, so ${san(t, 0)} wins it.` : `${unguards}, and ${reply}.`;
    }
    default:
      return `${move} looks natural, but ${reply}.`;
  }
}

/** The opponent's answer to a bait, as a clause: "Qb6 traps your bishop on b7". */
export function replyText(t: Tactic, user: Color): string {
  const lead = t.at === 0 ? '' : `after ${sequence(t.moves.slice(0, t.at))}, `;
  const move = `${lead}${san(t)}`;
  const ref = (p: PieceAt) => refer(p, user);
  switch (t.id) {
    case 'checkmate':
      return `${move} leads to mate`;
    case 'fork': {
      const others = listOf(t.targets.filter((p) => p.type !== 'k').map(ref));
      if (t.targets.some((p) => p.type === 'k')) return `${move} checks your king and attacks ${others} at once`;
      return `${move} attacks ${others} at once`;
    }
    case 'pin':
      if (t.how === 'created') return `${move} pins ${ref(t.pin.pinned)} to ${ref(t.pin.behind)}`;
      if (t.how === 'attacked') return `${move} attacks ${ref(t.pin.pinned)}, which is pinned to ${ref(t.pin.behind)}`;
      if (t.how === 'exposed') return `${move} exploits the pin on ${ref(t.pin.pinned)}, and ${san(t, t.key)} wins ${ref(t.pin.behind)}`;
      return `${move} wins material because ${ref(t.pin.pinned)} is pinned and can't take back`;
    case 'skewer':
      return `${move} attacks ${ref(t.front)} and wins ${ref(t.back)} behind it`;
    case 'discovered-attack':
      if (t.target.type === 'k') return `${move} uncovers check from ${ref(t.slider)}`;
      return `${move} opens the line from ${ref(t.slider)} to ${ref(t.target)}`;
    case 'trapped-piece':
      return `${move} traps ${ref(t.trapped)}`;
    case 'remove-defender':
      if (t.how === 'capture') return `${move} ${takenBack(t) ? 'trades off' : 'takes'} ${ref(t.defender)}, which guards ${ref(t.guarded)}`;
      if (t.how === 'chase') return `${move} drives away ${ref(t.defender)}, which guards ${ref(t.guarded)}`;
      return `${move} lures ${ref(t.defender)} away from guarding ${ref(t.guarded)}`;
    case 'mate-threat':
      return `${move} threatens mate on ${t.mate.to}`;
    case 'free-piece':
      return `${move} wins ${ref(t.won!)}`;
    case 'material-win': {
      if (!t.won) return `${move} wins material`;
      const before = t.key === 0 ? '' : `after ${sequence(t.moves.slice(0, t.key))}, `;
      return `${before}${san(t, t.key)} wins ${wonText(t, user)}`;
    }
  }
}

const QUIET_PLANS = {
  castle: 'castling tucks your king away',
  develop: 'bring out a piece that is still at home',
  king: 'bring your king towards the centre',
  improve: 'improve your least active piece',
};

function quietIdea(theme: Theme): string {
  const quiet = theme.quiet!;
  if (!quiet.calm) return `Check what your opponent threatens first; if nothing is attacked, ${QUIET_PLANS[quiet.focus]}.`;
  const calm = 'Nothing urgent is happening here';
  switch (quiet.focus) {
    case 'castle':
      return `${calm}, so it's a good moment to castle and tuck your king away.`;
    case 'develop': {
      const pieces = quiet.undeveloped;
      if (pieces.length > 2) {
        return `${calm}, so bring out a piece: ${pieces.length === 4 ? 'all' : 'three'} of your knights and bishops are still at home.`;
      }
      const are = pieces.length > 1 ? 'are' : 'is';
      return `${calm}, so bring out a piece: your ${listOf(pieces.map(onSquare))} ${are} still at home.`;
    }
    case 'king':
      return `${calm}. With the queens gone, your king can come forward and join the game.`;
    case 'improve':
      return `${calm}: nothing of yours is in danger and nothing can be won, so improve your least active piece.`;
  }
}
