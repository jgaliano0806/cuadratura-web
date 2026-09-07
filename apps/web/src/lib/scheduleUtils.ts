export type DayRow = {
  fecha_operativa: string;
  tipo_dia: string;
  codigo: string;
  turno?: string | null;
  movil: number | null;
  inspector: string | null;
  inspector_id?: string | null;
  nombres?: string | null;
  apellido?: string | null;
  legajo: string | null;
  posicion_codigo: string;
  licencia_codigo?: string | null;
  licencia_color_fondo?: string | null;
  licencia_color_letra?: string | null;
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
export const WEEKDAYS_ABBR = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'] as const;
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

export function addIsoDays(value: string, n: number): string {
  const d = new Date((value || iso(new Date())) + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return iso(d);
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

export function weekdayAbbrev(isoDate: string) {
  const d = new Date(isoDate + 'T12:00:00');
  return WEEKDAYS_ABBR[d.getDay()];
}

export function weekdayLong(isoDate: string) {
  const d = new Date(isoDate + 'T12:00:00');
  return WEEKDAYS_LONG[d.getDay()];
}

export function rowKey(row: DayRow) {
  return row.inspector_id || row.legajo || row.inspector || row.posicion_codigo;
}

/** Paleta canónica compartida entre cuadratura, leyenda y administración. */
export const TONE_PALETTE = {
  manana: { bg: '#2f6b28', fg: '#e8f6df', label: 'Mañana' },
  tarde: { bg: '#8a5c10', fg: '#fff1c4', label: 'Tarde' },
  noche: { bg: '#2d4480', fg: '#dce6fb', label: 'Noche' },
  franco: { bg: '#3d4340', fg: '#e4e7e0', label: 'Franco' },
  vacacion: { bg: '#7a331c', fg: '#f8ddd0', label: 'Vacaciones' },
  enfermedad: { bg: '#7a2424', fg: '#f8d4d4', label: 'Enfermedad' },
  neutral: { bg: '#3f4a42', fg: '#dfe3dc', label: 'Otro' },
} as const;

export type ToneKey = keyof typeof TONE_PALETTE;

let toneOverrides: Partial<Record<ToneKey, { bg: string; fg: string }>> = {};

export function setToneOverrides(
  next: Partial<Record<ToneKey, { bg: string; fg: string }>>,
) {
  toneOverrides = next;
}

export function resolveTone(tone: ToneKey) {
  const base = TONE_PALETTE[tone] ?? TONE_PALETTE.neutral;
  const over = toneOverrides[tone];
  return over ? { ...base, ...over } : base;
}

export function colorValido(value: string | null | undefined): string | undefined {
  const raw = value?.trim();
  if (!raw) return undefined;
  const v = raw.startsWith('#') ? raw.toUpperCase() : `#${raw.toUpperCase()}`;
  if (!/^#[0-9A-F]{6}$/.test(v) && !/^#[0-9A-F]{3}$/.test(v)) return undefined;
  const hex =
    v.length === 4
      ? `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`
      : v;
  if (hex === '#000000') return undefined;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  if (r + g + b < 24) return undefined;
  return hex;
}

export function boxIdDeCodigo(codigo: string | null | undefined) {
  const c = (codigo || '').trim().toUpperCase();
  if (c === 'V') return 'vacacion' as const;
  if (c === 'EF') return 'enfermedad' as const;
  if (c === 'F') return 'franco' as const;
  if (c === 'M' || /^M\d+$/.test(c)) return 'manana' as const;
  if (c === 'T' || /^T\d+$/.test(c)) return 'tarde' as const;
  if (c === 'N' || /^N\d+$/.test(c)) return 'noche' as const;
  return null;
}

export function resolveCodeColors(
  codigo: string | null | undefined,
  tipo: string,
  dbBg?: string | null,
  dbFg?: string | null,
  licenciaCodigo?: string | null,
): { bg: string; fg: string } | null {
  const tone = cellTone(codigo, tipo, licenciaCodigo) as ToneKey;
  const fallback = resolveTone(tone);
  if (tone !== 'neutral') return fallback;
  const bg = colorValido(dbBg);
  const fg = colorValido(dbFg);
  if (bg || fg) return { bg: bg || fallback.bg, fg: fg || fallback.fg };
  return fallback;
}

export function cellTone(
  codigo: string | null | undefined,
  tipo: string,
  licenciaCodigo?: string | null,
): string {
  const lic = (licenciaCodigo || '').trim().toUpperCase();
  const c = (codigo || '').trim().toUpperCase();
  const t = (tipo || '').trim().toUpperCase();
  if (lic === 'V' || c === 'V' || t === 'VACACION') return 'vacacion';
  if (lic === 'EF' || c === 'EF' || t === 'ENFERMEDAD') return 'enfermedad';
  if (c === 'M' || /^M\d+$/.test(c)) return 'manana';
  if (c === 'T' || /^T\d+$/.test(c)) return 'tarde';
  if (c === 'N' || /^N\d+$/.test(c)) return 'noche';
  if (lic === 'F' || c === 'F' || t === 'FRANCO') return 'franco';
  if (!c && !t) return 'neutral';
  return 'neutral';
}

/** Código de celda, igual que Administración → Códigos (T5, M1, F, V, EF, AC…). */
export function cellShortLabel(cell: DayRow): string {
  const lic = (cell.licencia_codigo || '').trim().toUpperCase();
  if (lic) return lic;
  if (cell.tipo_dia === 'VACACION') return 'V';
  if (cell.tipo_dia === 'ENFERMEDAD') return 'EF';
  const c = (cell.codigo || '').trim();
  if (c) return c;
  if (cell.tipo_dia === 'FRANCO') return 'F';
  if (cell.turno && cell.movil != null) return `${cell.turno}${cell.movil}`;
  return '';
}

export function cellDetailLabel(cell: DayRow): string {
  if (!cell.codigo && !cell.tipo_dia) return 'Sin dato';
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
