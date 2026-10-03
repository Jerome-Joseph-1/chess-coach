import { useEffect, useState } from 'preact/hooks';
import { loadGame, setKey } from '../../content/loader';
import type { Game, Kind, Level, MomentResult, OpeningId } from '../../content/types';
import { themeFor, type Theme, type ThemeId } from '../../learn';
import { startOfDay } from '../../progress/days';
import { patternStats, type PatternLevel, type PatternStat } from '../../progress/stats';
import { getMoments } from '../../progress/store';
import type { IconName } from './icons';

export type PatternId =
  | 'fork'
  | 'pin'
  | 'skewer'
  | 'discovered'
  | 'trapped'
  | 'loose'
  | 'defender'
  | 'back-rank'
  | 'mate'
  | 'material'
  | 'threat'
  | 'trap'
  | 'quiet';

export const PATTERNS: Record<PatternId, { name: string; icon: IconName }> = {
  fork: { name: 'Forks', icon: 'fork' },
  pin: { name: 'Pins', icon: 'pin' },
  skewer: { name: 'Skewers', icon: 'skewer' },
  discovered: { name: 'Discovered attacks', icon: 'discovered' },
  trapped: { name: 'Trapped piece', icon: 'trapped' },
  loose: { name: 'Free pieces', icon: 'loose' },
  defender: { name: 'Remove the defender', icon: 'shield' },
  'back-rank': { name: 'Back rank', icon: 'backrank' },
  mate: { name: 'Checkmate', icon: 'crown' },
  material: { name: 'Win material', icon: 'diamond' },
  threat: { name: 'Threats', icon: 'shield' },
  trap: { name: 'Traps', icon: 'eye' },
  quiet: { name: 'Nothing here', icon: 'quiet' },
};

/** Status is always an icon and a word, never colour alone. */
export const LEVELS: Record<PatternLevel, { word: string; icon: IconName }> = {
  strong: { word: 'Strong', icon: 'check' },
  learning: { word: 'Learning', icon: 'trend' },
  'needs-work': { word: 'Needs work', icon: 'info' },
};

const BY_THEME: Record<ThemeId, PatternId> = {
  fork: 'fork',
  pin: 'pin',
  skewer: 'skewer',
  'discovered-attack': 'discovered',
  'trapped-piece': 'trapped',
  'free-piece': 'loose',
  'remove-defender': 'defender',
  checkmate: 'mate',
  'mate-threat': 'mate',
  'material-win': 'material',
  'hanging-own': 'threat',
  'threat-other': 'threat',
  bait: 'trap',
  quiet: 'quiet',
};

// When the game file cannot be read, the kind the pipeline gave the position is the best name left.
const BY_KIND: Record<Kind, PatternId> = { win: 'material', defend: 'threat', trap: 'trap' };

export function patternOfTheme(theme: Theme): PatternId {
  const t = theme.tactic;
  if (t?.id === 'checkmate' && t.backRank) return 'back-rank';
  return BY_THEME[theme.id];
}

function fallbackPattern(m: MomentResult): PatternId | null {
  if (m.type === 'nothing') return 'quiet';
  return m.kinds[0] ? BY_KIND[m.kinds[0]] : null;
}

const RECENT_DAYS = 30;

// Each game file is fetched once per session and each position is named once; a failed fetch is retried next time.
const games = new Map<string, Promise<Game>>();
const named = new Map<string, PatternId>();

export function loadGameOnce(opening: OpeningId, level: Level, gameId: string): Promise<Game> {
  const key = `${setKey(opening, level)}/${gameId}`;
  let game = games.get(key);
  if (!game) {
    game = loadGame(opening, level, gameId);
    game.catch(() => games.delete(key));
    games.set(key, game);
  }
  return game;
}

function momentKey(m: MomentResult): string {
  return `${m.gameId}:${m.ply}`;
}

/** The pattern the game file gives the position; null when the file cannot be read or does not hold it. */
async function nameFromGame(m: MomentResult): Promise<PatternId | null> {
  if (m.type === 'nothing') return 'quiet';
  try {
    const game = await loadGameOnce(m.opening, m.level, m.gameId);
    const index = game.turns.findIndex((t) => t.ply === m.ply);
    return index < 0 ? null : patternOfTheme(themeFor(game, index));
  } catch {
    return null;
  }
}

async function patternNamer(moments: MomentResult[]): Promise<(m: MomentResult) => PatternId | null> {
  const unnamed = moments.filter((m) => !named.has(momentKey(m)));
  const names = await Promise.all(unnamed.map(nameFromGame));
  unnamed.forEach((m, i) => names[i] && named.set(momentKey(m), names[i]));
  return (m) => named.get(momentKey(m)) ?? fallbackPattern(m);
}

/** The opening's first attempts from the last 30 days, grouped by pattern; null while the game files load. */
export function usePatternStats(opening: OpeningId): PatternStat<PatternId>[] | null {
  const [stats, setStats] = useState<PatternStat<PatternId>[] | null>(null);
  useEffect(() => {
    let current = true;
    const since = startOfDay(Date.now(), RECENT_DAYS - 1);
    const moments = getMoments().filter((m) => m.opening === opening && m.at >= since && !m.review && !m.practice);
    setStats(null);
    patternNamer(moments).then((nameOf) => current && setStats(patternStats(moments, nameOf)));
    return () => {
      current = false;
    };
  }, [opening]);
  return stats;
}
