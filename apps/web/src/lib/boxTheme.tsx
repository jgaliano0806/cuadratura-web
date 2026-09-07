import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  TONE_PALETTE,
  setToneOverrides,
  type ToneKey,
} from './scheduleUtils';

export type BoxId = Exclude<ToneKey, 'neutral'>;
export type OcId = 'hueco' | 'cubierta' | 'doble' | 'super';
export type TopbarId = 'hora' | 'fecha' | 'operador';

export type ColorBox = {
  id: string;
  label: string;
  bg: string;
  fg: string;
  visible: boolean;
};

export const BOX_DEFAULTS: ColorBox[] = [
  { id: 'manana', label: 'Mañana', bg: TONE_PALETTE.manana.bg, fg: TONE_PALETTE.manana.fg, visible: true },
  { id: 'tarde', label: 'Tarde', bg: TONE_PALETTE.tarde.bg, fg: TONE_PALETTE.tarde.fg, visible: true },
  { id: 'noche', label: 'Noche', bg: TONE_PALETTE.noche.bg, fg: TONE_PALETTE.noche.fg, visible: true },
  { id: 'franco', label: 'Franco', bg: TONE_PALETTE.franco.bg, fg: TONE_PALETTE.franco.fg, visible: true },
  { id: 'vacacion', label: 'Vacaciones', bg: TONE_PALETTE.vacacion.bg, fg: TONE_PALETTE.vacacion.fg, visible: true },
  { id: 'enfermedad', label: 'Enfermedad', bg: TONE_PALETTE.enfermedad.bg, fg: TONE_PALETTE.enfermedad.fg, visible: true },
];

export const OC_DEFAULTS: ColorBox[] = [
  { id: 'hueco', label: 'Sin cobertura', bg: '#3A1018', fg: '#F8D0D0', visible: true },
  { id: 'cubierta', label: 'Un inspector', bg: '#2F6B28', fg: '#E8F6DF', visible: true },
  { id: 'doble', label: 'Dos (normal)', bg: '#8A5C10', fg: '#FFF1C4', visible: true },
  { id: 'super', label: 'Tres o más', bg: '#7A1020', fg: '#FFFFFF', visible: true },
];

export const TOPBAR_DEFAULTS: Array<{ id: TopbarId; label: string; visible: boolean }> = [
  { id: 'hora', label: 'Hora actual', visible: true },
  { id: 'fecha', label: 'Fecha', visible: true },
  { id: 'operador', label: 'Operador', visible: true },
];

type BoxState = {
  boxes: ColorBox[];
  ocupacion: ColorBox[];
  topbar: Array<{ id: TopbarId; label: string; visible: boolean }>;
};

const STORAGE_KEY = 'sv_box_theme_v1';
const HEX = /^#([0-9a-f]{6})$/i;

function mergeList<T extends { id: string }>(saved: T[] | undefined, defaults: T[]): T[] {
  if (!saved?.length) return defaults.map((d) => ({ ...d }));
  const byId = new Map(saved.map((x) => [x.id, x]));
  const seen = new Set<string>();
  const ordered: T[] = [];
  for (const item of saved) {
    const base = defaults.find((d) => d.id === item.id);
    if (!base || seen.has(item.id)) continue;
    seen.add(item.id);
    ordered.push({ ...base, ...item, id: base.id, label: base.label });
  }
  for (const d of defaults) {
    if (seen.has(d.id)) continue;
    ordered.push({ ...d });
  }
  return ordered;
}

function readState(): BoxState {
  if (typeof window === 'undefined') {
    return { boxes: BOX_DEFAULTS, ocupacion: OC_DEFAULTS, topbar: TOPBAR_DEFAULTS };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<BoxState>) : {};
    return {
      boxes: mergeList(parsed.boxes, BOX_DEFAULTS),
      ocupacion: mergeList(parsed.ocupacion, OC_DEFAULTS),
      topbar: mergeList(parsed.topbar, TOPBAR_DEFAULTS),
    };
  } catch {
    return {
      boxes: BOX_DEFAULTS.map((d) => ({ ...d })),
      ocupacion: OC_DEFAULTS.map((d) => ({ ...d })),
      topbar: TOPBAR_DEFAULTS.map((d) => ({ ...d })),
    };
  }
}

function applyCss(state: BoxState) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  for (const b of state.boxes) {
    root.style.setProperty(`--tone-${b.id}-bg`, b.bg);
    root.style.setProperty(`--tone-${b.id}-fg`, b.fg);
  }
  for (const o of state.ocupacion) {
    root.style.setProperty(`--oc-${o.id}-bg`, o.bg);
    root.style.setProperty(`--oc-${o.id}-fg`, o.fg);
  }
  const overrides: Partial<Record<ToneKey, { bg: string; fg: string }>> = {};
  for (const b of state.boxes) {
    overrides[b.id as ToneKey] = { bg: b.bg, fg: b.fg };
  }
  setToneOverrides(overrides);
}

type Ctx = BoxState & {
  patchBox: (group: 'boxes' | 'ocupacion', id: string, patch: Partial<ColorBox>) => void;
  moveBox: (group: 'boxes' | 'ocupacion' | 'topbar', id: string, dir: -1 | 1) => void;
  toggleTopbar: (id: TopbarId) => void;
  resetBoxes: () => void;
};

const BoxThemeContext = createContext<Ctx | null>(null);

export function BoxThemeProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<BoxState>(readState);

  useEffect(() => {
    applyCss(state);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }, [state]);

  const patchBox = useCallback((group: 'boxes' | 'ocupacion', id: string, patch: Partial<ColorBox>) => {
    setState((prev) => ({
      ...prev,
      [group]: prev[group].map((b) => {
        if (b.id !== id) return b;
        const next = { ...b, ...patch };
        if (patch.bg && !HEX.test(patch.bg)) next.bg = b.bg;
        if (patch.fg && !HEX.test(patch.fg)) next.fg = b.fg;
        return next;
      }),
    }));
  }, []);

  const moveBox = useCallback((group: 'boxes' | 'ocupacion' | 'topbar', id: string, dir: -1 | 1) => {
    setState((prev) => {
      const list = [...prev[group]] as Array<{ id: string }>;
      const i = list.findIndex((x) => x.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= list.length) return prev;
      const tmp = list[i];
      list[i] = list[j];
      list[j] = tmp;
      return { ...prev, [group]: list };
    });
  }, []);

  const toggleTopbar = useCallback((id: TopbarId) => {
    setState((prev) => ({
      ...prev,
      topbar: prev.topbar.map((t) => (t.id === id ? { ...t, visible: !t.visible } : t)),
    }));
  }, []);

  const resetBoxes = useCallback(() => {
    setState({
      boxes: BOX_DEFAULTS.map((d) => ({ ...d })),
      ocupacion: OC_DEFAULTS.map((d) => ({ ...d })),
      topbar: TOPBAR_DEFAULTS.map((d) => ({ ...d })),
    });
  }, []);

  const value = useMemo<Ctx>(
    () => ({ ...state, patchBox, moveBox, toggleTopbar, resetBoxes }),
    [state, patchBox, moveBox, toggleTopbar, resetBoxes],
  );

  return <BoxThemeContext.Provider value={value}>{children}</BoxThemeContext.Provider>;
}

export function useBoxTheme(): Ctx {
  const ctx = useContext(BoxThemeContext);
  if (!ctx) throw new Error('useBoxTheme fuera de BoxThemeProvider');
  return ctx;
}
