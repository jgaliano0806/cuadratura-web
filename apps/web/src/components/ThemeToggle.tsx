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

const ICONS: Record<ThemePreference, string> = {
  light: '☀',
  dark: '☾',
  system: '◐',
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

  const shown = cycleSystem ? preference : theme;
  const label = LABELS[shown];
  const icon = ICONS[shown];

  return (
    <button
      type="button"
      className={`theme-toggle theme-toggle-${variant}`}
      onClick={onClick}
      aria-label={`Cambiar tema. Actual: ${label}`}
      title={`${label} — click para cambiar`}
    >
      <span className="theme-icon" aria-hidden>
        {icon}
      </span>
      {!collapsed ? <span className="theme-label">{label}</span> : null}
    </button>
  );
}
