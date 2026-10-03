export type Side = 'w' | 'b';
export type OpeningId = 'italian' | 'caro-kann';
export type Level = 1100 | 1400 | 1700 | 2000;
export type Depth = 1 | 2 | 3 | 4 | 5;

export type Label = 'critical' | 'nothing' | 'gray';
export type Kind = 'win' | 'defend' | 'trap';

export interface HumanMove {
  uci: string;
  share: number;
}

/** One position where it is the user's move. */
export interface Turn {
  /** Index into Game.moves of the user's move at this turn. */
  ply: number;
  moveNo: number;
  /** Position before the user's move. */
  fen: string;
  label: Label;
  kinds: Kind[];
  /** Share of moves players at this level choose here that lose 10+ win% and drop a verdict. */
  wrongShare: number;
  /** Share of moves players 200 points stronger choose here that hold. */
  findShare: number;
  /** Where the human move shares come from, e.g. "Lichess 1300-1500 (725 games)" or "Maia-2 @1400". */
  source: string;
  human: HumanMove[];
  /** Win% the user loses with each analysed move compared with the best (0 = best). Unlisted moves are unknown. */
  grades: Record<string, number>;
  /** For moves losing 10+: the line that follows, starting with the opponent's reply (uci). */
  refutations: Record<string, string[]>;
  /** User's win% after the best move. */
  bestWin: number;
  /** Material balance from the user's side before the move (pawn = 1). */
  material: number;
  lines: {
    /** Starts with the user's holding move. */
    best?: string[];
    /** Starts with the most common losing move. */
    mistake?: string[];
    /** What the opponent would do if the user passed; starts with the opponent's move. */
    threat?: string[];
  };
  mistakeMove: string | null;
  /** Squares accepted as the answer to "Where?". */
  keySquares: string[];
  /** The opponent's last move was a capture, a check or a move into the user's half. */
  trigger: boolean;
  inCheck: boolean;
}

export interface Game {
  id: string;
  opening: OpeningId;
  level: Level;
  side: Side;
  /** Opening moves (SAN) played before the game starts. */
  start: string[];
  /** Every move after the start (SAN), both sides, in order. */
  moves: string[];
  /** One entry per user move, in order. */
  turns: Turn[];
}

export interface SetIndex {
  opening: OpeningId;
  level: Level;
  side: Side;
  start: string[];
  games: { id: string; moves: string[] }[];
}

/** What happens at a user turn during a game. Turns without an entry are normal moves. */
export type MomentType = 'pause' | 'nothing' | 'silent' | 'playout';

export type StepName = 'spot' | 'find' | 'solve' | 'hold';

export interface StepOutcome {
  step: StepName;
  correct: boolean;
}

export interface MomentResult {
  opening: OpeningId;
  level: Level;
  gameId: string;
  ply: number;
  moveNo: number;
  type: 'pause' | 'nothing' | 'silent';
  kinds: Kind[];
  depth: Depth;
  outcomes: StepOutcome[];
  stars: number;
  at: number;
  review?: boolean;
}

export interface GameSummary {
  opening: OpeningId;
  level: Level;
  gameId: string;
  moments: MomentResult[];
  at: number;
}

export interface ReviewItem {
  opening: OpeningId;
  level: Level;
  gameId: string;
  ply: number;
  box: number;
  due: number;
}

export interface Settings {
  theme: 'system' | 'light' | 'dark';
  board: 'green' | 'brown' | 'gray';
  sound: boolean;
  haptics: boolean;
  quick: boolean;
  levels: Record<OpeningId, Level>;
}
