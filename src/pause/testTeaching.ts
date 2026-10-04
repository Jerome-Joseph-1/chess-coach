import type { DrillTeaching } from './teaching';

/** A plan lesson's practice for game 0002 turn 5 (move 9): the game plays d3, and Ne2, b4 and a4 hold the position too. */
export const slowPlan: DrillTeaching = {
  name: 'The slow plan',
  icon: 'p-quiet',
  hint: 'Guard your e4 pawn before anything else.',
  idea: 'd3 guards e4 and opens the way for your dark bishop.',
  remember: 'Guard e4 with d3, castle, then bring a rook to e1.',
  ask: 'Your move: guard the pawn on e4.',
  planMoves: ['d2d3'],
  offPlan: 'Good move, but the plan here is to guard e4.',
};
