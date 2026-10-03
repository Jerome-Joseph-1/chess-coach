import type { ComponentChildren } from 'preact';
import './tabbar.css';

export type Tab = 'home' | 'progress' | 'settings';

const ICON = { fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' } as const;

const TABS: { id: Tab; href: string; label: string; icon: ComponentChildren }[] = [
  {
    id: 'home',
    href: '#/',
    label: 'Home',
    icon: <path d="M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  },
  {
    id: 'progress',
    href: '#/progress',
    label: 'Progress',
    icon: <path d="M5 20v-8M12 20V4M19 20v-5" />,
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

export function TabBar({ current }: { current: Tab }) {
  return (
    <nav class="tabbar" aria-label="Main">
      {TABS.map((tab) => (
        <a key={tab.id} class="tabbar-item" href={tab.href} aria-current={tab.id === current ? 'page' : undefined}>
          <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true" {...ICON}>
            {tab.icon}
          </svg>
          <span>{tab.label}</span>
        </a>
      ))}
    </nav>
  );
}
