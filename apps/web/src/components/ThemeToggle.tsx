import type { ReactNode } from 'react';
import { useTheme, type ThemePreference } from '../lib/theme';

type Props = {
  /** Variante visual: sidebar (oscuro) o topbar (adaptativa). */
  variant?: 'sidebar' | 'topbar';
  /** Si true, cicla light → dark → system. Si false, solo light/dark. */
  cycleSystem?: boolean;
  collapsed?: boolean;
};

const LABELS: Record<ThemePreference, string> = {
  light: 'Modo claro',
  dark: 'Modo nocturno',
  system: 'Según sistema',
};

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden>
      <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="2" />
      <path
        d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden>
      <path
        d="M21 14.3A8.5 8.5 0 1 1 9.7 3 7 7 0 0 0 21 14.3z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SystemIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor" />
    </svg>
  );
}

const ICONS: Record<ThemePreference, ReactNode> = {
  light: <SunIcon />,
  dark: <MoonIcon />,
  system: <SystemIcon />,
};

export function ThemeToggle({
  variant = 'sidebar',
  cycleSystem = false,
  collapsed = false,
}: Props) {
  const { preference, theme, setPreference, toggle } = useTheme();

  function onClick() {
    if (!cycleSystem) {
      toggle();
      return;
    }
    const order: ThemePreference[] = ['light', 'dark', 'system'];
    const next = order[(order.indexOf(preference) + 1) % order.length];
    setPreference(next);
  }

  const shown: ThemePreference = cycleSystem
    ? preference
    : theme === 'light'
      ? 'dark'
      : 'light';
  const label = cycleSystem
    ? LABELS[preference]
    : theme === 'light'
      ? 'Cambiar a modo nocturno'
      : 'Cambiar a modo claro';
  const iconOnly = variant === 'topbar' || collapsed;

  return (
    <button
      type="button"
      className={`theme-toggle theme-toggle-${variant}`}
      onClick={onClick}
      aria-label={cycleSystem ? `Cambiar tema. Actual: ${LABELS[preference]}` : label}
      title={label}
    >
      <span className="theme-icon" aria-hidden>
        {ICONS[shown]}
      </span>
      {!iconOnly ? (
        <span className="theme-label">{LABELS[cycleSystem ? preference : theme]}</span>
      ) : null}
    </button>
  );
}
