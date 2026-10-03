import { useEffect, useState } from 'preact/hooks';
import { Icon, type IconName } from '../screens/shared/icons';
import './tabbar.css';

export type Tab = 'today' | 'course' | 'progress' | 'settings';

const TABS: { id: Tab; href: string; label: string; icon: IconName }[] = [
  { id: 'today', href: '#/', label: 'Today', icon: 'home' },
  { id: 'course', href: '#/course', label: 'Course', icon: 'course' },
  { id: 'progress', href: '#/progress', label: 'Progress', icon: 'chart' },
  { id: 'settings', href: '#/settings', label: 'Settings', icon: 'sliders' },
];

// Every screen draws its own bar, so the pill remembers where it last sat in order to slide from there.
let lastTab: Tab | null = null;

const indexOf = (tab: Tab) => TABS.findIndex((t) => t.id === tab);

/** The bar docked at the bottom; one pill marks the current place and slides when it changes. */
export function TabBar({ current }: { current: Tab }) {
  const [from] = useState(() => lastTab ?? current);
  useEffect(() => {
    lastTab = current;
  }, [current]);

  return (
    <nav class="tabbar" aria-label="Main">
      <div class="tabbar-tabs" style={{ '--n': TABS.length, '--i': indexOf(current), '--from': indexOf(from) }}>
        <span class={`tabbar-pill ${from === current ? '' : 'tabbar-pill--slide'}`} aria-hidden="true" />
        {TABS.map((tab) => (
          <a key={tab.id} class="tabbar-item" href={tab.href} aria-current={tab.id === current ? 'page' : undefined}>
            <Icon name={tab.icon} size={24} />
            <span>{tab.label}</span>
          </a>
        ))}
      </div>
    </nav>
  );
}
