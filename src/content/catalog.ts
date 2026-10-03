import type { Level, OpeningId, Side } from './types';

export interface Opening {
  id: OpeningId;
  name: string;
  side: Side;
  start: string[];
}

export const OPENINGS: Opening[] = [
  { id: 'italian', name: 'Italian', side: 'w', start: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'] },
  { id: 'caro-kann', name: 'Caro-Kann', side: 'b', start: ['e4', 'c6'] },
];

export const LEVELS: Level[] = [1100, 1400, 1700, 2000];

export function openingById(id: OpeningId): Opening {
  return OPENINGS.find((o) => o.id === id)!;
}
