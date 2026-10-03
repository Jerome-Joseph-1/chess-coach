import { scoreValue, type Score } from './score';
import { LineCollector, parseBestMove, parseInfo, type Info } from './uci';

/** One engine line: the moves it expects, in uci, and the score for the side to move. */
export interface Line {
  pv: string[];
  score: Score;
  depth: number;
}

export interface AnalyseOptions {
  multiPv?: number;
  movetimeMs?: number;
  depth?: number;
}

const DEFAULTS: Required<AnalyseOptions> = { multiPv: 3, movetimeMs: 1200, depth: 18 };
/** A worker left idle this long is shut down, so the phone gets its memory back. */
const IDLE_MS = 60_000;

export const ENGINE_URL = `${import.meta.env.BASE_URL}engine/stockfish-19-lite-single.js`;

/** The request was replaced by a newer one, or the engine was shut down. */
export class Cancelled extends Error {
  constructor() {
    super('Analysis cancelled');
    this.name = 'Cancelled';
  }
}

export const isCancelled = (error: unknown): boolean => error instanceof Cancelled;

/** Best line first; lines the engine left at different depths when stopped are put back in score order. */
function linesOf(infos: Info[]): Line[] {
  return infos.map(({ pv, score, depth }) => ({ pv, score, depth })).sort((a, b) => scoreValue(b.score) - scoreValue(a.score));
}

/**
 * Stockfish in a Web Worker, spoken to in UCI. The worker starts on the first request. Requests run one
 * at a time; a new one stops the search in progress, and every request still waiting is cancelled.
 */
export class Engine {
  private worker: Worker | null = null;
  private booting: Promise<void> | null = null;
  private onMessage: ((message: string) => void) | null = null;
  private onFailure: ((error: Error) => void) | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private latest = 0;
  private searching = false;
  private ready = false;
  private idleTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private createWorker: () => Worker) {}

  /** The worker has started and answered; the next request only has to think. */
  get loaded(): boolean {
    return this.ready;
  }

  analyse(fen: string, options: AnalyseOptions = {}): Promise<Line[]> {
    const id = this.supersede();
    const run = this.queue.then(() => this.run(id, fen, { ...DEFAULTS, ...options }));
    this.queue = run.catch(() => undefined);
    return run;
  }

  async bestReply(fen: string): Promise<string | null> {
    const [best] = await this.analyse(fen, { multiPv: 1 });
    return best?.pv[0] ?? null;
  }

  /** Stops the search in progress and cancels every waiting request. */
  cancel(): void {
    this.supersede();
  }

  dispose(): void {
    clearTimeout(this.idleTimer);
    this.worker?.terminate();
    this.worker = null;
    this.booting = null;
    this.ready = false;
    this.searching = false;
    this.settle()?.reject(new Cancelled());
  }

  private supersede(): number {
    this.latest += 1;
    if (this.searching) this.send('stop');
    return this.latest;
  }

  private async run(id: number, fen: string, options: Required<AnalyseOptions>): Promise<Line[]> {
    const current = () => {
      if (id !== this.latest) throw new Cancelled();
    };
    current();
    clearTimeout(this.idleTimer);
    try {
      await this.boot();
      current();
      this.send(`setoption name MultiPV value ${options.multiPv}`);
      this.send(`position fen ${fen}`);
      await this.request('isready', (message) => (message === 'readyok' ? true : undefined));
      current();
      const lines = await this.search(options);
      current();
      return lines;
    } finally {
      if (id === this.latest) this.idleTimer = setTimeout(() => this.dispose(), IDLE_MS);
    }
  }

  private boot(): Promise<void> {
    this.booting ??= this.start().catch((error) => {
      this.dispose();
      throw error;
    });
    return this.booting;
  }

  private async start(): Promise<void> {
    const worker = this.createWorker();
    this.worker = worker;
    worker.onmessage = (event: MessageEvent) => this.onMessage?.(String(event.data));
    worker.onerror = (event: ErrorEvent) => {
      event.preventDefault();
      const waiting = this.settle();
      this.dispose();
      waiting?.reject(new Error(event.message || 'The engine stopped working'));
    };
    await this.request('uci', (message) => (message === 'uciok' ? true : undefined));
    this.ready = true;
  }

  private async search(options: Required<AnalyseOptions>): Promise<Line[]> {
    const found = new LineCollector();
    this.searching = true;
    try {
      await this.request(`go depth ${options.depth} movetime ${options.movetimeMs}`, (message) => {
        const info = parseInfo(message);
        if (info) found.add(info);
        return parseBestMove(message) === undefined ? undefined : true;
      });
    } finally {
      this.searching = false;
    }
    return linesOf(found.lines());
  }

  /** Sends a command and waits for the message that `answer` turns into a value. */
  private request<T>(command: string, answer: (message: string) => T | undefined): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.onMessage = (message) => {
        const value = answer(message);
        if (value === undefined) return;
        this.settle();
        resolve(value);
      };
      this.onFailure = reject;
      this.send(command);
    });
  }

  /** Detaches the waiting request and hands back its reject, if one was waiting. */
  private settle(): { reject: (error: Error) => void } | null {
    const reject = this.onFailure;
    this.onMessage = null;
    this.onFailure = null;
    return reject ? { reject } : null;
  }

  private send(command: string): void {
    this.worker?.postMessage(command);
  }
}

let shared: Engine | null = null;

/** The app's one engine; its worker loads on first use. */
export function engine(): Engine {
  shared ??= new Engine(() => new Worker(ENGINE_URL));
  return shared;
}
