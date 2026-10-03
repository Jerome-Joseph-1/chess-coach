import { describe, expect, it } from 'vitest';
import { Engine, isCancelled } from './engine';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const OTHER = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';

// Two prints of the three lines; the last one was cut short with a bound score, so the one before counts.
const INFO = [
  'info depth 9 seldepth 11 multipv 1 score cp 28 nodes 1 nps 1 time 1 pv e2e4 e7e5',
  'info depth 9 seldepth 11 multipv 2 score cp 22 nodes 1 nps 1 time 1 pv d2d4 d7d5',
  'info depth 9 seldepth 11 multipv 3 score cp 18 nodes 1 nps 1 time 1 pv g1f3 g8f6',
  'info depth 10 seldepth 12 multipv 1 score cp 30 nodes 1 nps 1 time 1 pv e2e4 e7e5',
  'info depth 10 seldepth 12 multipv 2 score cp 15 upperbound nodes 1 nps 1 time 1 pv g1f3',
  'info depth 9 seldepth 12 multipv 3 score cp 22 nodes 1 nps 1 time 1 pv d2d4 d7d5',
];

/** Answers like Stockfish: a search keeps going until `finish` or a `stop` command. */
function fakeWorker() {
  const sent: string[] = [];
  let searching = false;
  const worker = {
    onmessage: null as ((event: { data: string }) => void) | null,
    onerror: null as ((event: { message: string; preventDefault: () => void }) => void) | null,
    terminated: false,
    postMessage(command: string) {
      sent.push(command);
      if (command === 'uci') reply('uciok');
      if (command === 'isready') reply('readyok');
      if (command.startsWith('go')) {
        searching = true;
        INFO.forEach((line) => reply(line));
      }
      if (command === 'stop') finish();
    },
    terminate() {
      worker.terminated = true;
    },
  };
  function reply(message: string) {
    queueMicrotask(() => worker.onmessage?.({ data: message }));
  }
  function finish() {
    if (!searching) return;
    searching = false;
    reply('bestmove e2e4 ponder e7e5');
  }
  return { worker, sent, finish };
}

function setup() {
  const fake = fakeWorker();
  let created = 0;
  const engine = new Engine(() => {
    created += 1;
    return fake.worker as unknown as Worker;
  });
  return { engine, ...fake, created: () => created };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('Engine', () => {
  it('starts the worker on the first request and returns the lines, best first', async () => {
    const { engine, sent, finish, created } = setup();
    expect(created()).toBe(0);
    const lines = engine.analyse(START);
    await tick();
    finish();
    expect(await lines).toEqual([
      { pv: ['e2e4', 'e7e5'], score: { cp: 28 }, depth: 9 },
      { pv: ['d2d4', 'd7d5'], score: { cp: 22 }, depth: 9 },
      { pv: ['g1f3', 'g8f6'], score: { cp: 18 }, depth: 9 },
    ]);
    expect(sent).toEqual(['uci', 'setoption name MultiPV value 3', `position fen ${START}`, 'isready', 'go depth 18 movetime 1200']);
    expect(engine.loaded).toBe(true);
    engine.dispose();
  });

  it('stops the search in progress when a newer request comes, and cancels the old one', async () => {
    const { engine, sent, finish } = setup();
    const first = engine.analyse(START);
    await tick();
    const second = engine.analyse(OTHER, { multiPv: 1 });
    await expect(first).rejects.toSatisfy(isCancelled);
    await tick();
    finish();
    expect((await second)[0].pv[0]).toBe('e2e4');
    expect(sent.filter((c) => c === 'stop')).toHaveLength(1);
    expect(sent.filter((c) => c.startsWith('position'))).toEqual([`position fen ${START}`, `position fen ${OTHER}`]);
    // Each search waits for the engine to be ready, so a late answer from the old search cannot leak in.
    expect(sent.lastIndexOf('isready')).toBeGreaterThan(sent.indexOf('stop'));
    engine.dispose();
  });

  it('never starts a request that was replaced while it waited', async () => {
    const { engine, sent, finish } = setup();
    const first = engine.analyse(START);
    const skipped = engine.analyse(OTHER);
    const last = engine.analyse(START, { multiPv: 2 });
    await expect(first).rejects.toSatisfy(isCancelled);
    await expect(skipped).rejects.toSatisfy(isCancelled);
    await tick();
    finish();
    await last;
    expect(sent.filter((c) => c.startsWith('go'))).toHaveLength(1);
    expect(sent).toContain('setoption name MultiPV value 2');
    engine.dispose();
  });

  it('cancels on request and on dispose, then starts a fresh worker', async () => {
    const { engine, worker, finish, created } = setup();
    const first = engine.analyse(START);
    await tick();
    engine.cancel();
    await expect(first).rejects.toSatisfy(isCancelled);

    const second = engine.analyse(START);
    await tick();
    engine.dispose();
    await expect(second).rejects.toSatisfy(isCancelled);
    expect(worker.terminated).toBe(true);

    const third = engine.analyse(START);
    await tick();
    finish();
    await third;
    expect(created()).toBe(2);
    engine.dispose();
  });

  it('rejects with the error when the worker fails', async () => {
    const { engine, worker } = setup();
    const lines = engine.analyse(START);
    await tick();
    worker.onerror?.({ message: 'no wasm', preventDefault: () => undefined });
    await expect(lines).rejects.toThrow('no wasm');
    expect(engine.loaded).toBe(false);
  });

  it('answers the best reply', async () => {
    const { engine, finish, sent } = setup();
    const reply = engine.bestReply(START);
    await tick();
    finish();
    expect(await reply).toBe('e2e4');
    expect(sent).toContain('setoption name MultiPV value 1');
    engine.dispose();
  });
});
