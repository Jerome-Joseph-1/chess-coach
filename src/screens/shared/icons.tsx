import type { ComponentChildren } from 'preact';

interface IconProps {
  size?: number;
  class?: string;
}

function Icon({ size = 20, class: cls, children }: IconProps & { children: ComponentChildren }) {
  return (
    <svg class={cls} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export const Chevron = (props: IconProps) => (
  <Icon size={16} class="chevron" {...props}>
    <path d="m9 6 6 6-6 6" />
  </Icon>
);

export const Back = (props: IconProps) => (
  <Icon size={18} {...props}>
    <path d="m15 6-6 6 6 6" />
  </Icon>
);

export const Gear = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 7h9M19 7h1M4 17h1M11 17h9" />
    <circle cx="16" cy="7" r="2.5" />
    <circle cx="8" cy="17" r="2.5" />
  </Icon>
);

export const Check = (props: IconProps) => (
  <Icon {...props}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Icon>
);

export const Cross = (props: IconProps) => (
  <Icon {...props}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Icon>
);
