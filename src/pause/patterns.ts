import type { Theme, ThemeId } from '../learn';
import type { IconName } from './steps/icons';

const ICONS: Record<ThemeId, IconName> = {
  fork: 'p-fork',
  pin: 'p-pin',
  skewer: 'p-skewer',
  'trapped-piece': 'p-trapped',
  'discovered-attack': 'p-discovered',
  'free-piece': 'p-loose',
  'material-win': 'p-loose',
  'hanging-own': 'p-loose',
  checkmate: 'p-backrank',
  'mate-threat': 'p-backrank',
  'remove-defender': 'p-defend',
  'threat-other': 'p-defend',
  bait: 'p-defend',
  quiet: 'p-quiet',
};

/** The small drawn glyph beside a pattern's name. */
export function patternIcon(theme: Theme): IconName {
  return ICONS[theme.id];
}
