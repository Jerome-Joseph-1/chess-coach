import { describe, expect, it } from 'vitest';
import { italian1 } from '../pause/testGames';
import { learnGame, realTurn } from './fixtures';
import { lessonFor } from './lessons';
import { themeFor, type Role } from './themes';

type Key = Parameters<typeof realTurn>[0];

const lesson = (key: Key) => lessonFor(realTurn(key), 0);
const theme = (key: Key) => themeFor(realTurn(key), 0);
const piece = (key: Key, role: Role) =>
  theme(key)
    .pieces.filter((p) => p.role === role)
    .map((p) => `${p.type}${p.square}`);

describe('wins', () => {
  it('names a fork with check and the piece that falls', () => {
    const game = learnGame('caro-kann-1100-0001');
    expect(themeFor(game, 12).id).toBe('fork');
    expect(lessonFor(game, 12).idea).toBe(
      'Nd2+ checks the king and attacks the queen on f3 at the same time, so the queen falls.',
    );
  });

  it('names a knight fork of queen and rook', () => {
    expect(theme('italian-1400-0006#3').id).toBe('fork');
    expect(piece('italian-1400-0006#3', 'target')).toEqual(['qd8', 'rh8']);
    expect(lesson('italian-1400-0006#3').idea).toBe(
      "Nf7 attacks the queen on d8 and the rook on h8 at once, and Black can't save both.",
    );
  });

  it('names a pawn fork of two knights', () => {
    expect(theme('italian-1700-0019#19').id).toBe('fork');
    expect(lesson('italian-1700-0019#19').remember).toBe('A pawn push can attack two pieces at once.');
  });

  it('names the trapped knight on the edge', () => {
    const game = learnGame('italian-1400-0003');
    const found = lessonFor(game, 3);
    expect(found.theme.id).toBe('trapped-piece');
    expect(found.idea).toBe('The knight on a5 has no safe square: b4 attacks it, and every square it could go to is covered.');
    expect(found.remember).toBe('Knights on the edge have few squares. Look for pawn moves that attack them.');
    expect(found.squares).toEqual(['a5', 'b4']);
  });

  it('names a trapped bishop after a trade first', () => {
    expect(lesson('caro-kann-1700-0029#10').idea).toBe(
      'The bishop on h4 has no safe square: after Bxf3 Qxf3, g5 attacks it, and every square it could go to is covered.',
    );
  });

  it('names a trap set by opening a line', () => {
    expect(lesson('italian-1400-0015#25').idea).toBe(
      'Nd4 clears the way for your queen on d1 to attack the knight on h5, which has no safe square.',
    );
  });

  it('names a pin it creates against the king', () => {
    expect(theme('italian-2000-0026#2').id).toBe('pin');
    expect(piece('italian-2000-0026#2', 'pinned')).toEqual(['ne4']);
    expect(lesson('italian-2000-0026#2').idea).toBe("Re1 pins the knight on e4 to the king, and Black can't save it.");
  });

  it('names an existing pin that a pawn attacks', () => {
    expect(lesson('caro-kann-1400-0022#8').idea).toBe(
      "The knight on g5 is pinned to the queen on f4 by your bishop on h6, so it can't run when exf6 attacks it.",
    );
  });

  it('names a guard that cannot take back because it is pinned', () => {
    expect(lesson('italian-1400-0013#14').idea).toBe(
      "The knight on e7 can't safely take back on d5 because it's pinned to the king, so Qxd5 wins a knight.",
    );
    expect(lesson('italian-2000-0014#15').idea).toBe(
      "The knight on d6 can't safely take back on f7 because that would expose the queen on c7, so Bxf7 wins a rook for a knight.",
    );
  });

  it('names a pinned piece that steps away and exposes the queen', () => {
    expect(lesson('italian-1100-0013#6').idea).toBe(
      'The knight on f6 is pinned to the queen on e7 by your bishop on g5: after Nd5 Nxd5, Bxe7 wins the queen.',
    );
  });

  it('names skewers through the queen and through the king', () => {
    expect(lesson('italian-2000-0029#15').idea).toBe(
      'Bd5 attacks the queen on c6, and when it moves away you take the rook on a8 behind it.',
    );
    expect(lesson('caro-kann-1100-0015#17').idea).toBe(
      'After O-O Qe3 Qa1+ Kd2, Bc1+ checks the king, and once it steps aside you take the queen on e3 behind it.',
    );
  });

  it('names a discovered attack that wins the queen', () => {
    expect(theme('caro-kann-1700-0003#21').id).toBe('discovered-attack');
    expect(lesson('caro-kann-1700-0003#21').idea).toBe(
      'Nf3+ gives check and clears the way for your queen on d6 to attack the queen on d2, so the queen falls.',
    );
  });

  it('names a discovered check', () => {
    const found = lesson('italian-1100-0004#9');
    expect(found.name).toBe('Discovered check');
    expect(found.idea).toBe(
      'After Rxd5 Qe7, Rd7+ moves out of the way so your bishop on c4 gives check, and while Black deals with it you take the queen on e7.',
    );
  });

  it('names a capture that also uncovers an attack', () => {
    expect(lesson('caro-kann-1400-0028#5').idea).toBe(
      "Nxe5 takes the knight and clears the way for your bishop on d7 to attack the bishop on b5, so White can't both take back and save the bishop.",
    );
  });

  it('names the removal of a defender', () => {
    expect(theme('caro-kann-1400-0015#8').id).toBe('remove-defender');
    expect(piece('caro-kann-1400-0015#8', 'defender')).toEqual(['nf3']);
    expect(lesson('caro-kann-1400-0015#8').idea).toBe(
      'Bxf3 trades your bishop for the knight on f3, which guards the pawn on d4, and then the pawn on d4 falls.',
    );
  });

  it('names a back-rank mate', () => {
    const found = lesson('caro-kann-1400-0013#18');
    expect(found.name).toBe('Back-rank mate');
    expect(found.idea).toBe('Re1# is mate on the back rank: the king is boxed in by its own pieces.');
  });

  it('names a forced mate', () => {
    expect(lesson('italian-1100-0027#16').idea).toBe('Qg4+ forces mate: after Kh7, Qg7# is checkmate.');
    expect(lesson('italian-1400-0008#17').name).toBe('Forced mate');
  });

  it('names a mate threat that costs the queen, with the trade spelled out', () => {
    const game = learnGame('italian-1400-0001');
    expect(themeFor(game, 11).id).toBe('mate-threat');
    expect(lessonFor(game, 11).idea).toBe(
      "After Nf6+ Kg7 Qg3+ Kh8, Qd3 threatens mate with Qh7, and Black's best defence still loses the queen for a knight and a pawn.",
    );
  });

  it('names a mate threat that also attacks a piece', () => {
    expect(lesson('italian-2000-0009#18').idea).toBe(
      'Qf5 threatens mate with Qh7 and attacks the bishop on f6 at the same time, so the bishop falls.',
    );
  });

  it('names free pieces, undefended or worth more than the capturer', () => {
    expect(lesson('caro-kann-1100-0026#26').idea).toBe('Nothing defends the queen on e6, so fxe6 wins it for free.');
    expect(lesson('caro-kann-1400-0002#20').idea).toBe(
      'The queen on c5 is worth more than your bishop, so Bxc5 wins material even if White takes back.',
    );
    expect(lesson('caro-kann-2000-0003#13').idea).toBe("The knight on d4 isn't defended enough, so Bxd4 wins material.");
  });

  it('falls back to the material won, naming the pieces on both sides', () => {
    expect(theme('caro-kann-1100-0002#14').id).toBe('material-win');
    expect(lesson('caro-kann-1100-0002#14').idea).toBe(
      'b5+ starts a sequence that wins the queen for two pawns: b5+ Qxb5 cxb5+.',
    );
  });

  it('counts a promoted piece that is taken back as the pawn it was', () => {
    expect(lesson('caro-kann-1700-0008#26').idea).toBe(
      'Rc1 starts a sequence that wins a knight for a pawn: Rc1 Rxc1 dxc1=R+ Nxc1 Nxc1.',
    );
  });
});

describe('threats', () => {
  it('names a piece of yours left hanging', () => {
    const found = lesson('caro-kann-1100-0014#5');
    expect(found.theme.id).toBe('hanging-own');
    expect(found.idea).toBe('Your bishop on g4 is attacked by the bishop on e2, and nothing defends it, so take the attacker.');
  });

  it('says a piece needs protecting when the best move adds a guard', () => {
    expect(lesson('caro-kann-1100-0028#23').idea).toBe(
      "Your knight on c2 is attacked by the rook on a2, and it isn't defended enough, so it needs protecting.",
    );
    expect(lesson('italian-1700-0027#7').name).toBe('Pawn in danger');
  });

  it('names the threat of a fork', () => {
    const found = lesson('caro-kann-1400-0028#11');
    expect(found.theme).toMatchObject({ id: 'threat-other', pattern: 'fork' });
    expect(found.name).toBe('Stop the fork');
    expect(found.idea).toBe('White threatens Nc7+, checking your king and attacking your rook on a8 at the same time.');
  });

  it('names a fork threat that wins the exchange rather than the forked queen', () => {
    expect(lesson('caro-kann-1700-0011#24').idea).toBe(
      'White threatens Nxe6+, checking your king and attacking your queen on c7 at the same time.',
    );
  });

  it('names the threat of mate', () => {
    expect(lessonFor(learnGame('caro-kann-1100-0025'), 15).idea).toBe('White threatens checkmate with Qh7.');
    const backRank = lesson('caro-kann-1700-0014#25');
    expect(backRank.idea).toBe('White threatens mate on your back rank with Qb8: your king is boxed in by its own pawns.');
    expect(backRank.name).toBe('Stop the mate');
  });

  it('names a threat against a pinned piece', () => {
    expect(lesson('caro-kann-1400-0021#12').idea).toBe(
      'Your knight on f6 is pinned to your king, and White threatens to attack it with e5.',
    );
  });

  it('names a threatened discovered attack', () => {
    expect(lesson('caro-kann-1100-0016#15').idea).toBe(
      'White threatens c4: the pawn moves out of the way, and the rook on d2 attacks your queen on b2.',
    );
  });

  it('names a piece about to be trapped', () => {
    expect(lesson('caro-kann-1400-0014#16').idea).toBe(
      'Your queen on b2 is short of squares: White threatens Ra2, and it would have nowhere safe to go.',
    );
  });
});

describe('baits', () => {
  it('names a move that walks into a capture', () => {
    const found = lesson('caro-kann-1100-0013#7');
    expect(found.theme.bait?.kind).toBe('walks-into');
    expect(found.idea).toBe('Rb8 puts your rook where the bishop on f4 can take it, and Bxb8 wins it.');
  });

  it('names a move that opens a line onto the queen', () => {
    expect(lesson('italian-1100-0010#12').idea).toBe(
      'Ng5 clears the way for the queen on e6 to attack your queen on e2, so Qxe2 wins it.',
    );
  });

  it('names a poisoned pawn', () => {
    const found = lesson('italian-1400-0020#15');
    expect(found.name).toBe('Poisoned pawn');
    expect(found.idea).toBe('Rxc7 grabs a pawn, but it clears the way for the rook on a8, and Rxa1 wins your queen on a1.');
  });

  it('names a move that allows mate', () => {
    expect(lesson('caro-kann-2000-0001#3').idea).toBe('e5 looks fine, but it allows Qxf7, checkmate.');
  });

  it('names a move that leaves a piece unguarded', () => {
    expect(lesson('caro-kann-2000-0006#22').idea).toBe('g6 moves the pawn that was guarding your bishop on f6, so Qxf6 wins it.');
  });

  it('names the tactic behind the reply', () => {
    expect(lesson('caro-kann-1100-0013#21').idea).toBe(
      'Kf8 looks natural, but Nd7+ lures your queen on d8 away from guarding your rook on f6.',
    );
    expect(lesson('caro-kann-1400-0021#13').idea).toBe(
      'h6 attacks the bishop on g5, but after Bxf6 Bxf6, e5 attacks your bishop on f6, which is pinned to your king.',
    );
  });
});

describe('filed by the reason the move works', () => {
  it('calls a capture that wins by discovered check a discovery, not a removed guard', () => {
    expect(theme('caro-kann-1100-0228#8')).toMatchObject({ id: 'discovered-attack', tactic: { at: 2 } });
  });

  it('does not call a sacrifice the opponent could simply take a chase of the guard', () => {
    expect(theme('italian-1100-0033#2').id).toBe('fork');
  });

  it('does not call a piece trapped when a pin is what holds it', () => {
    expect(theme('italian-2000-0173#17').id).not.toBe('trapped-piece');
  });

  it('calls a pin a pin when the move opens the line onto the pinned piece', () => {
    const found = lessonFor(italian1, 7);
    expect(found.theme).toMatchObject({ id: 'pin', tactic: { how: 'opened' } });
    expect(found.idea).toBe("Nd3 moves out of the way of your rook on e1, pinning the knight on e6 to the king, and Black can't save it.");
  });

  it('does not blame a pin when a pawn takes a bigger piece anyway', () => {
    expect(lesson('italian-1100-0050#5').idea).toBe(
      'Your bishop on g5 is attacked by the pawn on f6, a cheaper piece, so it needs to move.',
    );
  });

  it('names a piece that already hangs rather than a bigger threat built on it', () => {
    const found = lesson('caro-kann-1400-0030#17');
    expect(found.name).toBe('Piece in danger');
    expect(found.idea).toBe('Your knight on e3 is attacked by the rook on f3, and nothing defends it, so it needs to move.');
  });

  it('does not call it a trap when the piece the trap wins already hung', () => {
    expect(lesson('caro-kann-2000-0140#24')).toMatchObject({ name: 'Piece in danger', theme: { id: 'hanging-own' } });
  });

  it('does not call it a trap when the mate was already threatened', () => {
    expect(lesson('caro-kann-2000-0073#24')).toMatchObject({ name: 'Stop the mate', idea: 'White threatens checkmate with Qh7.' });
  });

  it('says a threat to lure a guard away is about taking back', () => {
    expect(lesson('italian-2000-0133#7').idea).toBe('Black threatens Bxd4: if your queen on d2 takes back, it stops guarding your bishop on f4.');
  });
});

describe('quiet positions', () => {
  it('suggests castling when it is possible', () => {
    const found = lesson('italian-2000-0027#0');
    expect(found.theme.quiet?.focus).toBe('castle');
    expect(found.squares).toEqual(['e1']);
  });

  it('suggests developing pieces still at home in the opening', () => {
    expect(lesson('caro-kann-1100-0002#0').idea).toBe(
      'No threats and nothing to win here, so bring out a piece: all of your knights and bishops are still at home.',
    );
  });

  it('suggests bringing the king up once the queens are gone', () => {
    expect(theme('caro-kann-1100-0011#19').quiet?.focus).toBe('king');
  });

  it('falls back to improving the least active piece', () => {
    expect(theme('caro-kann-1100-0001#24').quiet?.focus).toBe('improve');
  });
});

describe('turns that are neither critical nor checked as quiet', () => {
  it('suggests a plan without claiming the position is calm', () => {
    const game = learnGame('italian-1400-0001');
    const gray = game.turns.findIndex((t) => t.label === 'gray');
    const found = lessonFor(game, gray);
    expect(found.theme.quiet?.calm).toBe(false);
    expect(found.idea).toMatch(/^Check what your opponent threatens first; if nothing is attacked, /);
  });
});
