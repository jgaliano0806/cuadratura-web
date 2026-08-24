/**
 * Presets de rango de fechas para la operación diaria.
 * Devuelven pares `{ from, to }` como YYYY-MM-DD calculados en TZ local.
 */

function iso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}
function addMonths(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth() + n, d.getDate());
}
function addDays(d: Date, n: number) {
  const c = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  c.setDate(c.getDate() + n);
  return c;
}

export type DateRange = { from: string; to: string };
export type PresetId =
  | 'today'
  | 'this-week'
  | 'this-month'
  | 'next-month'
  | 'next-30'
  | 'next-90'
  | 'ytd'
  | 'next-year';

export type Preset = { id: PresetId; label: string; range: () => DateRange };

/** Lunes-domingo de la semana actual. */
function thisWeek(today: Date): DateRange {
  const day = today.getDay();
  const diffToMonday = (day + 6) % 7;
  const monday = addDays(today, -diffToMonday);
  const sunday = addDays(monday, 6);
  return { from: iso(monday), to: iso(sunday) };
}

export function buildPresets(reference: Date = new Date()): Preset[] {
  const today = new Date(
    reference.getFullYear(),
    reference.getMonth(),
    reference.getDate(),
  );
  return [
    {
      id: 'today',
      label: 'Hoy',
      range: () => ({ from: iso(today), to: iso(today) }),
    },
    {
      id: 'this-week',
      label: 'Esta semana',
      range: () => thisWeek(today),
    },
    {
      id: 'this-month',
      label: 'Este mes',
      range: () => ({
        from: iso(startOfMonth(today)),
        to: iso(endOfMonth(today)),
      }),
    },
    {
      id: 'next-month',
      label: 'Próximo mes',
      range: () => {
        const start = startOfMonth(addMonths(today, 1));
        return { from: iso(start), to: iso(endOfMonth(start)) };
      },
    },
    {
      id: 'next-30',
      label: 'Próximos 30 días',
      range: () => ({ from: iso(today), to: iso(addDays(today, 29)) }),
    },
    {
      id: 'next-90',
      label: 'Próximos 90 días',
      range: () => ({ from: iso(today), to: iso(addDays(today, 89)) }),
    },
    {
      id: 'ytd',
      label: 'Año en curso',
      range: () => ({
        from: iso(new Date(today.getFullYear(), 0, 1)),
        to: iso(new Date(today.getFullYear(), 11, 31)),
      }),
    },
    {
      id: 'next-year',
      label: 'Próximos 12 meses',
      range: () => ({
        from: iso(today),
        to: iso(addDays(addMonths(today, 12), -1)),
      }),
    },
  ];
}

/** Devuelve el id del preset que coincide exactamente con `from/to`, o null. */
export function matchPreset(
  from: string,
  to: string,
  presets = buildPresets(),
): PresetId | null {
  for (const p of presets) {
    const r = p.range();
    if (r.from === from && r.to === to) return p.id;
  }
  return null;
}
