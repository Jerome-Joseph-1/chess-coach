import type { UnitId } from '../../course/types';
import type { IconName } from './icons';

export const UNIT_ICONS: Record<UnitId, IconName> = {
  'free-piece': 'loose',
  'piece-in-danger': 'info',
  fork: 'fork',
  pin: 'pin',
  checkmate: 'crown',
  'remove-defender': 'shield',
  discovered: 'discovered',
  skewer: 'skewer',
  trapped: 'trapped',
  traps: 'eye',
  threats: 'bulb',
};
