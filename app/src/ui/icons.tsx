import type { SVGProps } from "react";

// Icons of the mockups (24×24, stroked). Decorative: the label carries the meaning.

type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, strokeWidth = 1.8, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export const LogoIcon = (props: IconProps) => (
  <Icon stroke="var(--color-accent)" {...props}>
    <path d="M12 2l2.6 7.4L22 12l-7.4 2.6L12 22l-2.6-7.4L2 12l7.4-2.6z" />
  </Icon>
);

export const SetsIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x="8" y="3" width="12" height="15" rx="2" />
    <path d="M4 7v11a3 3 0 0 0 3 3h9" />
  </Icon>
);

export const CollectionIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M6 3h12v18l-6-4-6 4z" />
    <path d="M9.5 10l2 2 3.5-3.5" />
  </Icon>
);

export const SearchIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-3.5-3.5" />
  </Icon>
);

export const StatsIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
  </Icon>
);

export const SettingsIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1" />
    <circle cx="15" cy="6" r="2" />
    <circle cx="9" cy="12" r="2" />
    <circle cx="17" cy="18" r="2" />
  </Icon>
);
