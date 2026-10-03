import type { ComponentChildren } from 'preact';
import './tabbar.css';

export type Tab = 'today' | 'progress' | 'settings';

const ICON = { fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' } as const;

const TABS: { id: Tab; href: string; label: string; icon: ComponentChildren }[] = [
  {
    id: 'today',
    href: '#/',
    label: 'Today',
    icon: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" />
      </>
    ),
  },
  {
    id: 'progress',
    href: '#/progress',
    label: 'Progress',
    icon: <path d="M5 20v-6M12 20V6M19 20v-10" />,
  },
  {
    id: 'settings',
    href: '#/settings',
    label: 'Settings',
    icon: (
      <>
        <path d="M4 7h9M19 7h1M4 17h1M11 17h9" />
        <circle cx="16" cy="7" r="2.5" />
        <circle cx="8" cy="17" r="2.5" />
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
