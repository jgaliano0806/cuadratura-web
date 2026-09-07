import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from './auth';

export type CuadPanelId = 'timer' | 'ocupacion' | 'desdobles';

export type CuadPanel = {
  id: CuadPanelId;
  label: string;
  visible: boolean;
};

export const CUAD_PANEL_DEFAULTS: CuadPanel[] = [
  { id: 'timer', label: 'Timer', visible: true },
  { id: 'ocupacion', label: 'Ocupación', visible: true },
  { id: 'desdobles', label: 'Desdobles', visible: true },
];

const PREFIX = 'sv_cuad_paneles_v1:';

function merge(saved: CuadPanel[] | undefined): CuadPanel[] {
  if (!saved?.length) return CUAD_PANEL_DEFAULTS.map((d) => ({ ...d }));
  const byId = new Map(saved.map((x) => [x.id, x]));
  const seen = new Set<string>();
  const ordered: CuadPanel[] = [];
  for (const item of saved) {
    const base = CUAD_PANEL_DEFAULTS.find((d) => d.id === item.id);
    if (!base || seen.has(item.id)) continue;
    seen.add(item.id);
    ordered.push({ ...base, visible: item.visible !== false });
  }
  for (const d of CUAD_PANEL_DEFAULTS) {
    if (seen.has(d.id)) continue;
    ordered.push({ ...d });
  }
  return ordered;
}

function read(key: string): CuadPanel[] {
  if (typeof window === 'undefined') return CUAD_PANEL_DEFAULTS.map((d) => ({ ...d }));
  try {
    const raw = window.localStorage.getItem(key);
    return merge(raw ? (JSON.parse(raw) as CuadPanel[]) : undefined);
  } catch {
    return CUAD_PANEL_DEFAULTS.map((d) => ({ ...d }));
  }
}

export function useCuadPaneles() {
  const { user } = useAuth();
  const key = `${PREFIX}${user?.id ?? 'anon'}`;
  const [paneles, setPaneles] = useState<CuadPanel[]>(() => read(key));

  useEffect(() => {
    setPaneles(read(key));
  }, [key]);

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(paneles));
    } catch {
      /* quota / privacidad */
    }
  }, [key, paneles]);

  const toggle = useCallback((id: CuadPanelId) => {
    setPaneles((prev) => prev.map((p) => (p.id === id ? { ...p, visible: !p.visible } : p)));
  }, []);

  const move = useCallback((id: CuadPanelId, dir: -1 | 1) => {
    setPaneles((prev) => {
      const i = prev.findIndex((p) => p.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      const tmp = next[i];
      next[i] = next[j];
      next[j] = tmp;
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setPaneles(CUAD_PANEL_DEFAULTS.map((d) => ({ ...d })));
  }, []);

  const visibles = useMemo(() => paneles.filter((p) => p.visible), [paneles]);

  return { paneles, visibles, toggle, move, reset };
}
