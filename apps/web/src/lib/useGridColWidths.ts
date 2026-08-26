import { useCallback, useEffect, useState, type MouseEvent } from 'react';

const KEY = 'cuad-grid-cols';

export type GridColKey = 'legajo' | 'name' | 'day';

const DEFAULTS: Record<GridColKey, number> = { legajo: 90, name: 224, day: 46 };
const LIMITS: Record<GridColKey, [number, number]> = {
  legajo: [56, 240],
  name: [120, 520],
  day: [32, 110],
};

function leer(): Record<GridColKey, number> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const p = JSON.parse(raw) as Partial<Record<GridColKey, number>>;
    return {
      legajo: clamp('legajo', p.legajo ?? DEFAULTS.legajo),
      name: clamp('name', p.name ?? DEFAULTS.name),
      day: clamp('day', p.day ?? DEFAULTS.day),
    };
  } catch {
    return { ...DEFAULTS };
  }
}

function clamp(key: GridColKey, n: number) {
  const [min, max] = LIMITS[key];
  return Math.round(Math.min(max, Math.max(min, n)));
}

export function useGridColWidths() {
  const [cols, setCols] = useState(leer);

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(cols));
  }, [cols]);

  const begin = useCallback((key: GridColKey, e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const start = cols[key];
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    const move = (ev: globalThis.MouseEvent) => {
      setCols((c) => ({ ...c, [key]: clamp(key, start + ev.clientX - startX) }));
    };
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  }, [cols]);

  return { cols, begin };
}
