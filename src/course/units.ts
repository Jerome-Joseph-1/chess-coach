import type { Theme, ThemeId } from '../learn';
import { UNIT_IDS, type UnitId } from './types';

export interface UnitInfo {
  title: string;
  /** One plain line on what the pattern is. */
  line: string;
}

export const UNITS: Record<UnitId, UnitInfo> = {
  'free-piece': { title: 'Free pieces', line: 'A piece nobody guards: take it.' },
  'piece-in-danger': { title: 'Pieces in danger', line: 'Your piece can be taken: move it or guard it.' },
  fork: { title: 'Forks', line: 'One piece attacks two things at once.' },
  pin: { title: 'Pins', line: 'A piece stuck in front of a bigger one.' },
  checkmate: { title: 'Checkmate', line: 'Mate, mate threats and the back rank.' },
  'remove-defender': { title: 'Remove the defender', line: 'Take the guard, then what it guarded.' },
  discovered: { title: 'Discovered attacks', line: 'One piece moves and uncovers an attack.' },
  skewer: { title: 'Skewers', line: 'Attack a big piece and win the one behind.' },
  trapped: { title: 'Trapped pieces', line: 'A piece with no safe square left.' },
  traps: { title: 'Traps', line: 'A tempting move that loses: spot the catch.' },
  threats: { title: 'Threats', line: 'See what your opponent wants and stop it.' },
};

const UNIT_OF_THEME: Record<ThemeId, UnitId | null> = {
  'free-piece': 'free-piece',
  'hanging-own': 'piece-in-danger',
  fork: 'fork',
  pin: 'pin',
  checkmate: 'checkmate',
  'mate-threat': 'checkmate',
  'remove-defender': 'remove-defender',
  'discovered-attack': 'discovered',
  skewer: 'skewer',
  'trapped-piece': 'trapped',
  bait: 'traps',
  'threat-other': 'threats',
  'material-win': null,
  quiet: null,
};

/** The unit that teaches a key position's theme; null for a plain material win or a quiet position. */
export function unitOfTheme(theme: Theme): UnitId | null {
  return UNIT_OF_THEME[theme.id];
}

export function isUnitId(value: string): value is UnitId {
  return (UNIT_IDS as readonly string[]).includes(value);
}
