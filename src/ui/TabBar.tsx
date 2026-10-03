import type { ComponentChildren } from 'preact';
import './tabbar.css';

export type Tab = 'today' | 'openings' | 'you';

const ICON = { fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' } as const;

const TABS: { id: Tab; href: string; label: string; icon: ComponentChildren }[] = [
  {
    id: 'today',
    href: '#/',
    label: 'Today',
    icon: <path d="M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  },
  {
    id: 'openings',
    href: '#/openings',
    label: 'Openings',
    icon: (
      <>
        <rect x="4" y="4" width="7" height="7" rx="1.5" />
        <rect x="13" y="4" width="7" height="7" rx="1.5" />
        <rect x="4" y="13" width="7" height="7" rx="1.5" />
        <rect x="13" y="13" width="7" height="7" rx="1.5" />
      </>
    ),
  },
  {
    id: 'you',
    href: '#/progress',
    label: 'You',
    icon: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4.5 20.5c1-4 4-6 7.5-6s6.5 2 7.5 6" />
      </>
    ),
  },
];

/** Floating pill with the three places of the app; the current one sits on a raised pill. */
export function TabBar({ current }: { current: Tab }) {
  return (
    <nav class="tabbar" aria-label="Main">
      {TABS.map((tab) => (
        <a key={tab.id} class="tabbar-item" href={tab.href} aria-current={tab.id === current ? 'page' : undefined}>
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" {...ICON}>
            {tab.icon}
          </svg>
          <span>{tab.label}</span>
        </a>
      ))}
    </nav>
  );
}
