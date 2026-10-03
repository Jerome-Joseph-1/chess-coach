import { describe, expect, it } from 'vitest';
import { LineCollector, parseBestMove, parseInfo } from './uci';

// Recorded from stockfish-19-lite-single.
const RECORDED = {
  cp: 'info depth 12 seldepth 14 multipv 1 score cp 531 nodes 17227 nps 291983 hashfull 4 time 59 pv f3d4 h8e8 c1e3 e8e4 c2c3 e4h4',
  second: 'info depth 12 seldepth 18 multipv 2 score cp -407 nodes 17227 nps 291983 hashfull 4 time 59 pv f3e1 d4f5 c1d2 d8d7',
  mate: 'info depth 8 seldepth 2 multipv 1 score mate 1 nodes 2883 nps 480500 hashfull 0 time 6 pv d1d8',
  mated: 'info depth 6 seldepth 3 multipv 1 score mate -1 nodes 13 nps 1625 hashfull 0 time 8 pv a8b8 h1h8',
  bound: 'info depth 21 seldepth 29 multipv 2 score cp 19 upperbound nodes 1418055 nps 467696 hashfull 475 time 3032 pv d2d4 g8f6',
  noLine: 'info depth 0 score mate 0',
  text: 'info string NNUE evaluation using nn-61e7af4bb97d.nnue (1MiB, (768, 1024, 32, 32, 1))',
};

describe('parseInfo', () => {
  it('reads the line number, depth, centipawn score and moves', () => {
    expect(parseInfo(RECORDED.cp)).toEqual({
      multipv: 1,
      depth: 12,
      score: { cp: 531 },
      pv: ['f3d4', 'h8e8', 'c1e3', 'e8e4', 'c2c3', 'e4h4'],
      bound: false,
    });
    expect(parseInfo(RECORDED.second)).toMatchObject({ multipv: 2, score: { cp: -407 }, pv: ['f3e1', 'd4f5', 'c1d2', 'd8d7'] });
  });

  it('reads mates for and against the side to move', () => {
    expect(parseInfo(RECORDED.mate)).toMatchObject({ score: { mate: 1 }, pv: ['d1d8'] });
    expect(parseInfo(RECORDED.mated)).toMatchObject({ score: { mate: -1 }, pv: ['a8b8', 'h1h8'] });
  });

  it('counts a message without multipv as the first line', () => {
    expect(parseInfo('info depth 3 score cp 12 pv e2e4 e7e5')?.multipv).toBe(1);
  });

  it('reads promotions in the line', () => {
    expect(parseInfo('info depth 9 multipv 1 score cp 900 pv a7a8q b8a8')?.pv).toEqual(['a7a8q', 'b8a8']);
  });

  it('marks bound scores from an unsettled search', () => {
    expect(parseInfo(RECORDED.bound)).toMatchObject({ multipv: 2, score: { cp: 19 }, pv: ['d2d4', 'g8f6'], bound: true });
  });

  it('skips messages without a line, text and anything else', () => {
    expect(parseInfo(RECORDED.noLine)).toBeNull();
    expect(parseInfo(RECORDED.text)).toBeNull();
    expect(parseInfo('info depth 20 currmove e2e4 currmovenumber 1')).toBeNull();
    expect(parseInfo('uciok')).toBeNull();
    expect(parseInfo('')).toBeNull();
  });

  it('rejects broken messages', () => {
    expect(parseInfo('info depth 5 score cp pv e2e4')).toBeNull();
    expect(parseInfo('info depth 5 score wdl 10 pv e2e4')).toBeNull();
    expect(parseInfo('info depth 5 score cp 10 pv e2e4 nonsense')).toBeNull();
    expect(parseInfo('info score cp 10 pv e2e4')).toBeNull();
  });

  it('copes with extra spaces and a trailing newline', () => {
    expect(parseInfo('info  depth 4  multipv 3 score cp -5 pv  g1f3 \n')).toMatchObject({ multipv: 3, pv: ['g1f3'] });
  });
});

describe('parseBestMove', () => {
  it('reads the move, with or without a ponder move', () => {
    expect(parseBestMove('bestmove f3d4 ponder h8e8')).toBe('f3d4');
    expect(parseBestMove('bestmove d1d8')).toBe('d1d8');
  });

  it('gives null when there is no move, and undefined for other messages', () => {
    expect(parseBestMove('bestmove (none)')).toBeNull();
    expect(parseBestMove(RECORDED.cp)).toBeUndefined();
    expect(parseBestMove('readyok')).toBeUndefined();
  });
});

describe('LineCollector', () => {
  // Recorded at a stop: the last print has a bound second line, and its moves repeat the print before.
  const STOPPED = [
    'info depth 20 seldepth 38 multipv 1 score cp 26 nodes 1287716 nps 474646 hashfull 439 time 2713 pv e2e4 e7e5 g1f3',
    'info depth 20 seldepth 28 multipv 2 score cp 23 nodes 1287716 nps 474646 hashfull 439 time 2713 pv d2d4 g8f6 c2c4',
    'info depth 20 seldepth 26 multipv 3 score cp 20 nodes 1287716 nps 474471 hashfull 439 time 2714 pv g1f3 g8f6 d2d4',
    'info depth 21 seldepth 30 multipv 1 score cp 24 nodes 1418055 nps 467696 hashfull 475 time 3032 pv e2e4 e7e5 g1f3 b8c6',
    'info depth 21 seldepth 29 multipv 2 score cp 19 upperbound nodes 1418055 nps 467696 hashfull 475 time 3032 pv d2d4 g8f6',
    'info depth 20 seldepth 26 multipv 3 score cp 20 nodes 1418055 nps 467696 hashfull 475 time 3032 pv g1f3 g8f6 d2d4 e7e6',
  ];

  const collect = (messages: string[]) => {
    const collector = new LineCollector();
    for (const message of messages) {
      const info = parseInfo(message);
      if (info) collector.add(info);
    }
    return collector.lines();
  };

  it('keeps the last whole print without bound scores', () => {
    const lines = collect(STOPPED);
    expect(lines.map((line) => [line.depth, line.pv[0]])).toEqual([
      [20, 'e2e4'],
      [20, 'd2d4'],
      [20, 'g1f3'],
    ]);
  });

  it('never mixes two prints, which could list one move twice', () => {
    const reordered = [...STOPPED.slice(0, 3), 'info depth 21 multipv 1 score cp 30 pv g1f3 g8f6', 'info depth 21 multipv 2 score cp 26 upperbound pv e2e4'];
    expect(new Set(collect(reordered).map((line) => line.pv[0])).size).toBe(3);
  });

  it('takes the last print as it is when every print had a bound', () => {
    expect(collect([STOPPED[3], STOPPED[4], STOPPED[5]]).map((line) => line.pv[0])).toEqual(['e2e4', 'd2d4', 'g1f3']);
  });

  it('has nothing before the first line', () => {
    expect(new LineCollector().lines()).toEqual([]);
  });
});
