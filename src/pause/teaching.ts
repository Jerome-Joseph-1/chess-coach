import type { IconName } from './steps/icons';

/** What an opening lesson's practice says in place of the tactic lesson, and which moves carry out its plan. */
export interface DrillTeaching {
  /** The chip over the question, e.g. "Build the centre". */
  name: string;
  icon: IconName;
  /** The first hint: the plan in one line. */
  hint: string;
  /** Said once the move is found. */
  idea: string;
  remember: string;
  /** The question's line, e.g. "Your move: push the d-pawn to d4."; the usual line when absent. */
  ask?: string;
  /** Moves that carry out the lesson here, as uci; each counts as found. */
  planMoves: string[];
  /** Said to another good move, which is then tried again; without it such a move is taken as usual. */
  offPlan?: string;
  /** The answer's line when the turn has none, as uci. */
  line?: string[];
}
