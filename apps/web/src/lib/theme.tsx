import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type ThemeMode = 'light' | 'dark';
export type ThemePreference = ThemeMode | 'system';

export type ThemeTint = {
  bg: string;
  text: string;
  sidebarBg: string;
  sidebarText: string;
};

export const THEME_DEFAULTS: Record<ThemeMode, ThemeTint> = {
  light: { bg: '#F5F7F4', text: '#0F1420', sidebarBg: '#14261C', sidebarText: '#F7F3EA' },
  dark: { bg: '#0B0F1A', text: '#E7EBF3', sidebarBg: '#060915', sidebarText: '#E7EBF3' },
};

type ThemeTintMap = Partial<Record<ThemeMode, Partial<ThemeTint>>>;

type ThemeContextValue = {
  /** Preferencia guardada por el usuario ('system' delega en OS). */
  preference: ThemePreference;
  /** Tema efectivo que hay aplicado ahora mismo. */
  theme: ThemeMode;
  setPreference: (p: ThemePreference) => void;
  toggle: () => void;
  colors: ThemeTint;
  setColors: (partial: Partial<ThemeTint>) => void;
  resetColors: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);
const STORAGE_KEY = 'sv_theme_v1';
const COLORS_KEY = 'sv_theme_colors_v1';

const HEX = /^#([0-9a-f]{6})$/i;

function readTintMap(): ThemeTintMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(COLORS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as ThemeTintMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function sanitizeHex(value: string | undefined): string | undefined {
  const v = value?.trim();
  return v && HEX.test(v) ? v.toUpperCase() : undefined;
}

function resolveTint(theme: ThemeMode, map: ThemeTintMap): ThemeTint {
  const base = THEME_DEFAULTS[theme];
  const custom = map[theme] ?? {};
  return {
    bg: sanitizeHex(custom.bg) ?? base.bg,
    text: sanitizeHex(custom.text) ?? base.text,
    sidebarBg: sanitizeHex(custom.sidebarBg) ?? base.sidebarBg,
    sidebarText: sanitizeHex(custom.sidebarText) ?? base.sidebarText,
  };
}

const APP_VARS = [
  '--bg',
  '--bg-gradient',
  '--surface',
  '--surface-2',
  '--surface-elevated',
  '--surface-input',
  '--text',
  '--text-strong',
  '--text-muted',
  '--text-inverse',
  '--ink',
  '--muted',
  '--paper',
  '--border',
  '--border-strong',
] as const;

const SIDEBAR_VARS = [
  '--sidebar-bg',
  '--sidebar-fg',
  '--sidebar-fg-muted',
  '--sidebar-border',
  '--sidebar-active-bg',
] as const;

function clearVars(root: HTMLElement, names: readonly string[]) {
  for (const name of names) root.style.removeProperty(name);
}

function applyTint(theme: ThemeMode, tint: ThemeTint) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const base = THEME_DEFAULTS[theme];
  const appCustom = tint.bg !== base.bg || tint.text !== base.text;
  const sideCustom = tint.sidebarBg !== base.sidebarBg || tint.sidebarText !== base.sidebarText;
  root.classList.toggle('has-custom-theme', appCustom || sideCustom);

  if (appCustom) {
    const bg = tint.bg;
    const text = tint.text;
    root.style.setProperty('--bg', bg);
    root.style.setProperty('--bg-gradient', bg);
    root.style.setProperty('--surface', `color-mix(in srgb, ${bg} 88%, ${text} 12%)`);
    root.style.setProperty('--surface-2', `color-mix(in srgb, ${bg} 92%, ${text} 8%)`);
    root.style.setProperty('--surface-elevated', `color-mix(in srgb, ${bg} 84%, ${text} 16%)`);
    root.style.setProperty('--surface-input', `color-mix(in srgb, ${bg} 90%, ${text} 10%)`);
    root.style.setProperty('--text', text);
    root.style.setProperty('--text-strong', text);
    root.style.setProperty('--text-muted', `color-mix(in srgb, ${text} 62%, ${bg} 38%)`);
    root.style.setProperty('--text-inverse', bg);
    root.style.setProperty('--ink', text);
    root.style.setProperty('--muted', `color-mix(in srgb, ${text} 62%, ${bg} 38%)`);
    root.style.setProperty('--paper', `color-mix(in srgb, ${bg} 92%, ${text} 8%)`);
    root.style.setProperty('--border', `color-mix(in srgb, ${text} 18%, ${bg} 82%)`);
    root.style.setProperty('--border-strong', `color-mix(in srgb, ${text} 28%, ${bg} 72%)`);
  } else {
    clearVars(root, APP_VARS);
  }

  if (sideCustom) {
    const sideBg = tint.sidebarBg;
    const sideFg = tint.sidebarText;
    root.style.setProperty('--sidebar-bg', sideBg);
    root.style.setProperty('--sidebar-fg', sideFg);
    root.style.setProperty('--sidebar-fg-muted', `color-mix(in srgb, ${sideFg} 62%, ${sideBg} 38%)`);
    root.style.setProperty('--sidebar-border', `color-mix(in srgb, ${sideFg} 18%, ${sideBg} 82%)`);
    root.style.setProperty('--sidebar-active-bg', `color-mix(in srgb, ${sideFg} 14%, transparent)`);
  } else {
    clearVars(root, SIDEBAR_VARS);
  }
}

function readPreference(): ThemePreference {
  if (typeof window === 'undefined') return 'system';
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw;
  } catch {
    /* localStorage podría no estar disponible */
  }
  return 'system';
}

function systemTheme(): ThemeMode {
  if (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-color-scheme: dark)').matches
  ) {
    return 'dark';
  }
  return 'light';
}

function applyTheme(theme: ThemeMode) {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', theme);
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute('content', theme === 'dark' ? '#0B0F1A' : '#F5F7F4');
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPref] = useState<ThemePreference>(readPreference);
  const [systemMode, setSystemMode] = useState<ThemeMode>(systemTheme);
  const [tintMap, setTintMap] = useState<ThemeTintMap>(readTintMap);

  const theme: ThemeMode = preference === 'system' ? systemMode : preference;
  const colors = useMemo(() => resolveTint(theme, tintMap), [theme, tintMap]);

  useEffect(() => {
    applyTheme(theme);
    applyTint(theme, colors);
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', colors.bg);
  }, [theme, colors]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, preference);
    } catch {
      /* ignorar quota / privacidad */
    }
  }, [preference]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) =>
      setSystemMode(e.matches ? 'dark' : 'light');
    if (mql.addEventListener) mql.addEventListener('change', onChange);
    else mql.addListener(onChange);
    return () => {
      if (mql.removeEventListener) mql.removeEventListener('change', onChange);
      else mql.removeListener(onChange);
    };
  }, []);

  const setPreference = useCallback((p: ThemePreference) => setPref(p), []);
  const toggle = useCallback(
    () => setPref(theme === 'dark' ? 'light' : 'dark'),
    [theme],
  );
  const setColors = useCallback((partial: Partial<ThemeTint>) => {
    setTintMap((prev) => {
      const current = resolveTint(theme, prev);
      const next: ThemeTintMap = {
        ...prev,
        [theme]: {
          bg: sanitizeHex(partial.bg) ?? current.bg,
          text: sanitizeHex(partial.text) ?? current.text,
          sidebarBg: sanitizeHex(partial.sidebarBg) ?? current.sidebarBg,
          sidebarText: sanitizeHex(partial.sidebarText) ?? current.sidebarText,
        },
      };
      try {
        window.localStorage.setItem(COLORS_KEY, JSON.stringify(next));
      } catch {
        /* ignorar quota / privacidad */
      }
      return next;
    });
  }, [theme]);
  const resetColors = useCallback(() => {
    setTintMap((prev) => {
      const next = { ...prev };
      delete next[theme];
      try {
        window.localStorage.setItem(COLORS_KEY, JSON.stringify(next));
      } catch {
        /* ignorar quota / privacidad */
      }
      return next;
    });
  }, [theme]);

  const value = useMemo<ThemeContextValue>(
    () => ({ preference, theme, setPreference, toggle, colors, setColors, resetColors }),
    [preference, theme, setPreference, toggle, colors, setColors, resetColors],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme fuera de ThemeProvider');
  return ctx;
}
