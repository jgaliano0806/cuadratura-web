import type { ReactNode } from 'react';

type IconProps = { size?: number; className?: string };

function Svg({
  size = 18,
  className,
  children,
}: IconProps & { children: ReactNode }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

export const Icons = {
  home: (p: IconProps) => (
    <Svg {...p}>
      <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z" />
    </Svg>
  ),
  calendar: (p: IconProps) => (
    <Svg {...p}>
      <rect x="3.5" y="5" width="17" height="15" rx="2" />
      <path d="M3.5 10h17M8 3.5v3M16 3.5v3" />
    </Svg>
  ),
  engine: (p: IconProps) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M5.9 5.9l1.6 1.6M16.5 16.5l1.6 1.6M5.9 18.1l1.6-1.6M16.5 7.5l1.6-1.6" />
    </Svg>
  ),
  gaps: (p: IconProps) => (
    <Svg {...p}>
      <path d="M12 8v5" />
      <circle cx="12" cy="17" r="0.9" fill="currentColor" stroke="none" />
      <path d="M10.2 4.8 3.8 18.2A1.6 1.6 0 0 0 5.2 20.5h13.6a1.6 1.6 0 0 0 1.4-2.3L13.8 4.8a1.6 1.6 0 0 0-2.8 0Z" />
    </Svg>
  ),
  vacation: (p: IconProps) => (
    <Svg {...p}>
      <path d="M12 4v3M8 8c0 4 1.8 7 4 10 2.2-3 4-6 4-10" />
      <path d="M7 21h10M9 8h6" />
    </Svg>
  ),
  approve: (p: IconProps) => (
    <Svg {...p}>
      <path d="M6 12.5 10.2 16.5 18 7.5" />
      <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
    </Svg>
  ),
  mobile: (p: IconProps) => (
    <Svg {...p}>
      <rect x="6" y="3.5" width="12" height="17" rx="2.5" />
      <path d="M10 17.5h4" />
    </Svg>
  ),
  route: (p: IconProps) => (
    <Svg {...p}>
      <circle cx="6.5" cy="7" r="2.2" />
      <circle cx="17.5" cy="17" r="2.2" />
      <path d="M8.5 8.2c2.5 1 4 4.5 4 6.3 0 1.8 1.5 3.5 5 3.5" />
    </Svg>
  ),
  admin: (p: IconProps) => (
    <Svg {...p}>
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5 19.5c.8-3.2 3.2-5 7-5s6.2 1.8 7 5" />
    </Svg>
  ),
  search: (p: IconProps) => (
    <Svg {...p}>
      <circle cx="11" cy="11" r="6" />
      <path d="M16 16l4 4" />
    </Svg>
  ),
  logout: (p: IconProps) => (
    <Svg {...p}>
      <path d="M10 12h9M16 8l4 4-4 4" />
      <path d="M13 5H7a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h6" />
    </Svg>
  ),
  collapse: (p: IconProps) => (
    <Svg {...p}>
      <path d="M14.5 6 9 12l5.5 6" />
    </Svg>
  ),
  expand: (p: IconProps) => (
    <Svg {...p}>
      <path d="M9.5 6 15 12l-5.5 6" />
    </Svg>
  ),
};
