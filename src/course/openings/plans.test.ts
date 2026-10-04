import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { PLAN_LESSONS, type PlanLessonId } from './plans';

/** The position after these moves from the start. */
function after(moves: string): string {
  const chess = new Chess();
  for (const san of moves.split(' ')) chess.move(san);
  return chess.fen();
}

/** The plan step `san` carries out from `fen` for the lesson, and whether the worked example's text holds there. */
function judge(id: PlanLessonId, fen: string, san: string): { step: string | null; textbook: boolean } {
  const move = new Chess(fen).move(san);
  const { fits, textbook } = PLAN_LESSONS[id].plan;
  return { step: fits(move, new Chess(fen)), textbook: textbook(move, new Chess(fen)) };
}

const stepOf = (id: PlanLessonId, fen: string, san: string) => judge(id, fen, san).step;

describe('the Italian idea', () => {
  const ready = after('e4 e5 Nf3 Nc6 Bc4 Bc5 d3 Nf6');

  it('is castling short, with the bishop aiming at the pawn on f7 in the textbook case', () => {
    expect(judge('italian-idea', ready, 'O-O')).toEqual({ step: 'castle', textbook: true });
    expect(stepOf('italian-idea', ready, 'Nc3')).toBeNull();
  });

  it('is not castling long', () => {
    const both = 'r3k2r/ppp2ppp/2nqbn2/2b1p3/2B1P3/2NPBN2/PPPQ1PPP/R3K2R w KQkq - 0 8';
    expect(stepOf('italian-idea', both, 'O-O-O')).toBeNull();
    expect(stepOf('italian-idea', both, 'O-O')).toBe('castle');
  });

  it('leaves the textbook when f7 holds no pawn', () => {
    expect(judge('italian-idea', 'r1bqk2r/ppp1n1pp/2np1p2/8/2BPP3/5N1P/PP1N1PP1/R2QK2R w KQkq - 1 10', 'O-O')).toEqual({ step: 'castle', textbook: false });
  });
});

describe('build the centre', () => {
  it('is d4 with your pawns on c3 and e4, hitting e5 in the textbook case', () => {
    expect(judge('italian-centre', after('e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6'), 'd4')).toEqual({ step: 'd4', textbook: true });
  });

  it('needs the pawn on c3', () => {
    expect(stepOf('italian-centre', after('e4 e5 Nf3 Nc6 Bc4 Bc5 O-O Nf6'), 'd4')).toBeNull();
  });

  it('leaves the textbook once the pawn on e5 is gone', () => {
    const traded = 'r1bqk2r/pppp1ppp/2n2n2/2b5/2B1P3/2P2N2/PP1P1PPP/RNBQK2R w KQkq - 0 6';
    expect(judge('italian-centre', traded, 'd4')).toEqual({ step: 'd4', textbook: false });
  });
});

describe('the slow plan', () => {
  it('is d3 while the pawns on e4 and e5 block each other, and not once they are gone', () => {
    expect(judge('italian-slow', after('e4 e5 Nf3 Nc6 Bc4 Nf6'), 'd3')).toEqual({ step: 'd3', textbook: true });
    expect(stepOf('italian-slow', after('e4 e5 Nf3 Nc6 Bc4 Bc5 d3 Nf6 c3 d5 exd5 Nxd5'), 'Bb3')).toBeNull();
  });

  it('is Re1 after castling, with the pawn on d3', () => {
    const castled = after('e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3 O-O O-O d6');
    expect(judge('italian-slow', castled, 'Re1')).toEqual({ step: 'Re1', textbook: true });
    const kingInCorner = 'r1bq1rk1/pppp1ppp/2n2n2/2b1p3/2B1P3/2PP1N2/PP3PPP/RNBQ1R1K w - - 1 6';
    expect(stepOf('italian-slow', kingInCorner, 'Re1')).toBeNull();
  });

  it('is Bb3, in the textbook case away from a pawn and still aiming at f7', () => {
    const kicked = 'r3kbnr/p4ppp/2pp1q2/1p2p3/2BnP3/2NP3P/PPP2PP1/R1BQ1RK1 w kq - 0 10';
    expect(judge('italian-slow', kicked, 'Bb3')).toEqual({ step: 'Bb3', textbook: true });
    expect(judge('italian-slow', after('e4 e5 Nf3 Nc6 Bc4 Bc5 d3 Nf6 c3 d6'), 'Bb3')).toEqual({ step: 'Bb3', textbook: false });
  });
});

describe('Ng5 against f7', () => {
  it('is Ng5 hitting f7, which in the textbook case only the king guards', () => {
    expect(judge('italian-ng5', after('e4 e5 Nf3 Nc6 Bc4 Nf6'), 'Ng5')).toEqual({ step: 'Ng5', textbook: true });
  });

  it('does not fit with a pawn on h6', () => {
    expect(stepOf('italian-ng5', after('e4 e5 Nf3 Nc6 Bc4 Nf6 d3 h6'), 'Ng5')).toBeNull();
  });

  it('leaves the textbook once a rook guards f7 too', () => {
    expect(judge('italian-ng5', after('e4 e5 Nf3 Nc6 Bc4 Bc5 d3 Nf6 O-O O-O'), 'Ng5')).toEqual({ step: 'Ng5', textbook: false });
  });
});

describe('the Caro-Kann idea', () => {
  it('is d5 early, or the c-pawn taking back on d5', () => {
    expect(judge('caro-kann-idea', after('e4 c6 d4'), 'd5')).toEqual({ step: 'd5', textbook: true });
    expect(judge('caro-kann-idea', after('e4 c6 d4 d5 exd5'), 'cxd5')).toEqual({ step: 'cxd5', textbook: true });
  });

  it('wants d5 by move 3', () => {
    expect(stepOf('caro-kann-idea', after('e4 c6 Nf3 d6 d4 Nf6 Nc3'), 'd5')).toBeNull();
  });
});

describe('your light bishop first', () => {
  it('is Bf5 or Bg4 from c8 while the e-pawn is still on e7', () => {
    expect(judge('caro-kann-bishop', after('e4 c6 d4 d5 e5'), 'Bf5')).toEqual({ step: 'Bf5', textbook: true });
    expect(judge('caro-kann-bishop', after('e4 c6 Nf3 d5 e5'), 'Bg4')).toEqual({ step: 'Bg4', textbook: true });
  });

  it('does not fit Bf5 after e6', () => {
    expect(stepOf('caro-kann-bishop', after('e4 c6 Nf3 d5 e5 Bg4 Be2 e6 d4'), 'Bf5')).toBeNull();
  });

  it('leaves the textbook for Bg4 when it pins nothing', () => {
    expect(judge('caro-kann-bishop', after('e4 c6 d4 d5 e5'), 'Bg4')).toEqual({ step: 'Bg4', textbook: false });
  });
});

describe('the c5 break', () => {
  it('is c5 against a pawn on d4, the Advance chain in the textbook case', () => {
    expect(judge('caro-kann-c5', after('e4 c6 d4 d5 e5 Bf5 Nf3 e6 Be2'), 'c5')).toEqual({ step: 'c5', textbook: true });
    expect(judge('caro-kann-c5', after('e4 c6 d4 d5 Nc3 dxe4 Nxe4 Nd7 Nf3 Ngf6 Nxf6+ Nxf6 Bd3'), 'c5')).toEqual({ step: 'c5', textbook: false });
  });

  it('needs a White pawn on d4', () => {
    expect(stepOf('caro-kann-c5', after('e4 c6 Nf3 d5 e5'), 'c5')).toBeNull();
  });
});

describe('the Exchange structure', () => {
  const exchange = after('e4 c6 d4 d5 exd5 cxd5 Bd3');

  it('is a knight to c6, a bishop or queen to its square, or the b-pawn forward', () => {
    expect(judge('caro-kann-exchange', exchange, 'Nc6')).toEqual({ step: 'Nc6', textbook: true });
    expect(judge('caro-kann-exchange', after('e4 c6 d4 d5 exd5 cxd5 Bd3 Nc6 c3 Nf6 Bf4'), 'Qb6')).toEqual({ step: 'Qb6', textbook: true });
    expect(judge('caro-kann-exchange', after('e4 c6 d4 d5 exd5 cxd5 Bd3 Nc6 c3 Nf6 Bf4 Bg4 Qb3'), 'Qb6')).toEqual({ step: 'Qb6', textbook: false });
    expect(stepOf('caro-kann-exchange', exchange, 'b5')).toBe('b5');
    expect(stepOf('caro-kann-exchange', exchange, 'Nf6')).toBeNull();
  });

  it('needs White without an e-pawn and with the c-pawn at home or on c3', () => {
    expect(stepOf('caro-kann-exchange', after('e4 c6 d4 d5 exd5 cxd5 c4'), 'Nc6')).toBeNull();
    expect(stepOf('caro-kann-exchange', after('e4 c6 d4 d5 e5'), 'Bf5')).toBeNull();
  });
});

describe('the texts', () => {
  it('give every plan lesson its texts, and a why line for each step its examples can show', () => {
    for (const lesson of Object.values(PLAN_LESSONS)) {
      for (const text of [lesson.title, lesson.line, lesson.intro, lesson.name, lesson.hint, lesson.idea, lesson.remember, lesson.ask!, lesson.offPlan!]) {
        expect(text, lesson.id).toMatch(/^([A-Z]|[a-h][1-8x])/);
        expect(text.trim(), lesson.id).toBe(text);
      }
      expect(lesson.offPlan, lesson.id).toMatch(/^Good move, but the plan here is /);
      expect(lesson.ask, lesson.id).toMatch(/^Your move: .+\.$/);
      expect(lesson.spot.length, lesson.id).toBeGreaterThanOrEqual(2);
    }
    const steps: [PlanLessonId, string[]][] = [
      ['italian-idea', ['castle']],
      ['italian-centre', ['d4']],
      ['italian-slow', ['d3', 'Re1', 'Bb3']],
      ['italian-ng5', ['Ng5']],
      ['caro-kann-idea', ['d5', 'cxd5']],
      ['caro-kann-bishop', ['Bf5', 'Bg4']],
      ['caro-kann-c5', ['c5']],
      ['caro-kann-exchange', ['Nc6', 'Bg4', 'Bf5', 'Qc7', 'Qb6', 'b5', 'b4']],
    ];
    for (const [id, names] of steps) for (const step of names) expect(PLAN_LESSONS[id].why(step), `${id} ${step}`).toMatch(/^[A-Za-z].+\.$/);
  });
});
