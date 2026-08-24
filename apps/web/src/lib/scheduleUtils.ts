export type DayRow = {
  fecha_operativa: string;
  tipo_dia: string;
  codigo: string;
  turno?: string | null;
  movil: number | null;
  inspector: string | null;
  inspector_id?: string | null;
  legajo: string | null;
  posicion_codigo: string;
};

export type CoverageRow = {
  fecha_operativa: string;
  movil: number;
  turno: string;
  cantidad_asignada: number;
  estado: string;
};

export type DailyTotal = {
  fecha_operativa: string;
  francos: number;
  vacaciones: number;
  enfermedades: number;
  trabajos: number;
};

export type BoardResponse = {
  days: DayRow[];
  coverage: CoverageRow[];
  daily_totals: DailyTotal[];
  summary: {
    huecos: number;
    solapamientos: number;
    dias_con_vacaciones: number;
    asignaciones_vacacion: number;
  };
};

export type InspectorRow = {
  key: string;
  name: string;
  legajo: string;
};

export const WEEKDAYS_SHORT = ['D', 'L', 'M', 'X', 'J', 'V', 'S'] as const;
export const WEEKDAYS_LONG = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
] as const;
export const MONTHS_ES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
] as const;

export const SHIFTS = ['M', 'T', 'N'] as const;
export const SHIFT_LABEL: Record<string, string> = {
  M: 'Mañana',
  T: 'Tarde',
  N: 'Noche',
};

export function toDateOnly(value?: string | null) {
  if (!value) return '';
  const s = String(value);
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : s.slice(0, 10);
}

export function iso(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function eachDate(from: string, to: string): string[] {
  if (!from || !to || from > to) return [];
  const out: string[] = [];
  const cur = new Date(from + 'T12:00:00');
  const end = new Date(to + 'T12:00:00');
  while (cur <= end) {
    out.push(iso(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

export function monthBounds(anchor: string): { from: string; to: string } {
  const d = new Date((anchor || iso(new Date())) + 'T12:00:00');
  const from = new Date(d.getFullYear(), d.getMonth(), 1);
  const to = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return { from: iso(from), to: iso(to) };
}

export function shiftMonth(anchor: string, delta: number): { from: string; to: string } {
  const d = new Date((anchor || iso(new Date())) + 'T12:00:00');
  d.setMonth(d.getMonth() + delta);
  return monthBounds(iso(d));
}

export function monthLabel(from: string) {
  const d = new Date(from + 'T12:00:00');
  return `${MONTHS_ES[d.getMonth()]} ${d.getFullYear()}`;
}

export function weekdayLetter(isoDate: string) {
  const d = new Date(isoDate + 'T12:00:00');
  return WEEKDAYS_SHORT[d.getDay()];
}

export function weekdayLong(isoDate: string) {
  const d = new Date(isoDate + 'T12:00:00');
  return WEEKDAYS_LONG[d.getDay()];
}

export function rowKey(row: DayRow) {
  return row.legajo || row.inspector || row.posicion_codigo;
}

export function cellTone(codigo: string, tipo: string): string {
  if (tipo === 'VACACION' || codigo === 'V') return 'vacacion';
  if (tipo === 'ENFERMEDAD' || codigo === 'EF') return 'enfermedad';
  if (tipo === 'FRANCO' || codigo === 'F') return 'franco';
  if (codigo.startsWith('M')) return 'manana';
  if (codigo.startsWith('T')) return 'tarde';
  if (codigo.startsWith('N')) return 'noche';
  return 'neutral';
}

/** Etiqueta corta para celda SAP: "M · 1", "F", "V". */
export function cellShortLabel(cell: DayRow): string {
  if (cell.codigo === 'F' || cell.tipo_dia === 'FRANCO') return 'F';
  if (cell.codigo === 'V' || cell.tipo_dia === 'VACACION') return 'V';
  if (cell.codigo === 'EF' || cell.tipo_dia === 'ENFERMEDAD') return 'EF';
  if (/^[MTN]\d/.test(cell.codigo)) {
    const turno = cell.codigo[0];
    const movil = cell.movil ?? Number(cell.codigo.slice(1));
    return `${turno} · ${movil}`;
  }
  return cell.codigo;
}

export function cellDetailLabel(cell: DayRow): string {
  if (cell.codigo === 'F' || cell.tipo_dia === 'FRANCO') return 'Franco';
  if (cell.codigo === 'V' || cell.tipo_dia === 'VACACION') return 'Vacaciones';
  if (cell.codigo === 'EF' || cell.tipo_dia === 'ENFERMEDAD') return 'Enfermedad';
  if (/^[MTN]\d/.test(cell.codigo)) {
    const turno = SHIFT_LABEL[cell.codigo[0]] ?? cell.codigo[0];
    const movil = cell.movil ?? cell.codigo.slice(1);
    return `${turno} · Móvil ${movil}`;
  }
  return cell.codigo;
}

export function coverageClass(n: number) {
  if (n === 0) return 'cov-gap';
  if (n === 1) return 'cov-ok';
  return 'cov-overlap';
}

/** Agrupa fechas contiguas del mismo mes para encabezados. */
export function monthSpansHelper(
  dates: string[],
  monthNames: readonly string[] = MONTHS_ES,
): Array<{ label: string; span: number; key: string }> {
  const spans: Array<{ label: string; span: number; key: string }> = [];
  for (const d of dates) {
    const month = Number(d.slice(5, 7));
    const year = d.slice(0, 4);
    const label = `${monthNames[month - 1]} ${year}`;
    const last = spans[spans.length - 1];
    if (last && last.label === label) last.span += 1;
    else spans.push({ label, span: 1, key: `${year}-${month}` });
  }
  return spans;
}
