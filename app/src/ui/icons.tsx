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

export const ChevronLeftIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M15 18l-6-6 6-6" />
  </Icon>
);

export const ChevronRightIcon = (props: IconProps) => (
  <Icon strokeWidth={2} {...props}>
    <path d="M9 6l6 6-6 6" />
  </Icon>
);

/** Placeholder of a card image (not downloaded yet, or offline). */
export const CardPlaceholderIcon = (props: IconProps) => (
  <Icon strokeWidth={1.5} {...props}>
    <rect x="5" y="2" width="14" height="20" rx="2" />
    <path d="M9 8h6M9 12h6" />
  </Icon>
);

export const ChevronDownIcon = (props: IconProps) => (
  <Icon strokeWidth={2} {...props}>
    <path d="M6 9l6 6 6-6" />
  </Icon>
);

export const WifiOffIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M2 2l20 20M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 5.2-2.8M19 13a10 10 0 0 0-2.2-1.6M2 8.8a15 15 0 0 1 4.2-2.6M22 8.8A15 15 0 0 0 11 5" />
  </Icon>
);

/** Generic set icon of the mockups (buildings). */
export const SetIcon = (props: IconProps) => (
  <Icon strokeWidth={1.4} {...props}>
    <path d="M3 21V9l5-3v15M8 21V4l6 3v14M14 21V10l7 3v8M2 21h20" />
  </Icon>
);

/** "Filtres" button of the mobile Collection. */
export const FiltersIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 6h16M7 12h10M10 18h4" />
  </Icon>
);

/** Art placeholder of a gallery card whose image is not available. */
export const ImageIcon = (props: IconProps) => (
  <Icon strokeWidth={1.4} {...props}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <circle cx="9" cy="10" r="2" />
    <path d="M21 16l-5-5-8 8" />
  </Icon>
);

/** Cloud with an upload arrow (Google Drive sync, Settings). */
export const SyncCloudIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M7 18a4.5 4.5 0 0 1-.5-9A6 6 0 0 1 18 8.5a4 4 0 0 1-.5 9.5z" />
    <path d="M12 11v5M9.5 13.5 12 11l2.5 2.5" />
  </Icon>
);

export const ExternalLinkIcon = (props: IconProps) => (
  <Icon strokeWidth={2} {...props}>
    <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
  </Icon>
);

/** Plain cloud (sync status pill and sidebar line). */
export const CloudIcon = (props: IconProps) => (
  <Icon strokeWidth={2} {...props}>
    <path d="M7 18a4.5 4.5 0 0 1-.5-9A6 6 0 0 1 18 8.5a4 4 0 0 1-.5 9.5z" />
  </Icon>
);

export const RotateCardIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x="8" y="3" width="8" height="12" rx="1.5" />
    <path d="M3.5 12.5c-.5 3.5 3.6 6.5 8.5 6.5 2.9 0 5.4-1 7-2.5" />
    <path d="M17 14l2.5 2.5L17 19" />
  </Icon>
);

export const CloseIcon = (props: IconProps) => (
  <Icon strokeWidth={2} {...props}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
);

export const FlipIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 12a8 8 0 0 1 13.7-5.6L20 9" />
    <path d="M20 4v5h-5" />
    <path d="M20 12a8 8 0 0 1-13.7 5.6L4 15" />
    <path d="M4 20v-5h5" />
  </Icon>
);

export const RecenterIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
  </Icon>
);
