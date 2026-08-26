const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export type DateRangeIssue = {
  field: 'from' | 'to' | 'range';
  message: string;
};

export type DateRangeOptions = {
  /** Ambos extremos obligatorios (default true). */
  required?: boolean;
  /** Cantidad máxima de días inclusive. */
  maxDays?: number;
  /** Límite inferior sugerido (inclusive). */
  minBound?: string;
  /** Límite superior sugerido (inclusive). */
  maxBound?: string;
  /** Si true, salir del bound es error; si false, solo aviso en range. */
  enforceBounds?: boolean;
};

/** Comprueba YYYY-MM-DD real (rechaza 2026-02-31). */
export function isIsoDate(value: string): boolean {
  if (!value || !ISO_DATE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(`${value}T12:00:00`);
  return (
    !Number.isNaN(dt.getTime()) &&
    dt.getFullYear() === y &&
    dt.getMonth() + 1 === m &&
    dt.getDate() === d
  );
}

export function daysInRange(from: string, to: string): number {
  const a = Date.parse(`${from}T12:00:00`);
  const b = Date.parse(`${to}T12:00:00`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000) + 1;
}

export function validateDateRange(
  from: string,
  to: string,
  options: DateRangeOptions = {},
): DateRangeIssue[] {
  const {
    required = true,
    maxDays,
    minBound,
    maxBound,
    enforceBounds = false,
  } = options;
  const issues: DateRangeIssue[] = [];

  if (!from) {
    if (required) issues.push({ field: 'from', message: 'Indicá la fecha desde.' });
  } else if (!isIsoDate(from)) {
    issues.push({ field: 'from', message: 'Fecha desde inválida.' });
  }

  if (!to) {
    if (required) issues.push({ field: 'to', message: 'Indicá la fecha hasta.' });
  } else if (!isIsoDate(to)) {
    issues.push({ field: 'to', message: 'Fecha hasta inválida.' });
  }

  if (from && to && isIsoDate(from) && isIsoDate(to)) {
    if (from > to) {
      issues.push({
        field: 'range',
        message: 'La fecha desde no puede ser posterior a hasta.',
      });
    } else if (maxDays != null) {
      const days = daysInRange(from, to);
      if (days > maxDays) {
        issues.push({
          field: 'range',
          message: `El rango no puede superar ${maxDays} días (tiene ${days}).`,
        });
      }
    }

    if (enforceBounds && minBound && isIsoDate(minBound) && from < minBound) {
      issues.push({
        field: 'from',
        message: `Desde no puede ser anterior a ${minBound}.`,
      });
    }
    if (enforceBounds && maxBound && isIsoDate(maxBound) && to > maxBound) {
      issues.push({
        field: 'to',
        message: `Hasta no puede ser posterior a ${maxBound}.`,
      });
    }
  }

  return issues;
}

export function firstIssueFor(
  issues: DateRangeIssue[],
  field: DateRangeIssue['field'],
) {
  return issues.find((i) => i.field === field)?.message ?? '';
}

const DMY = /^(\d{1,2})[/\-. ](\d{1,2})[/\-. ](\d{2,4})$/;

/** YYYY-MM-DD → dd/mm/aaaa. */
export function isoToDmy(value: string): string {
  if (!isIsoDate(value)) return '';
  const [y, m, d] = value.split('-');
  return `${d}/${m}/${y}`;
}

/** dd/mm/aaaa (también ISO o d-m-aa) → YYYY-MM-DD, o null. */
export function parseDmy(value: string): string | null {
  const t = value.trim();
  if (!t) return null;
  if (isIsoDate(t)) return t;
  const m = t.match(DMY);
  if (!m) return null;
  const dd = m[1].padStart(2, '0');
  const mm = m[2].padStart(2, '0');
  let yy = m[3];
  if (yy.length === 2) yy = Number(yy) >= 70 ? `19${yy}` : `20${yy}`;
  const iso = `${yy}-${mm}-${dd}`;
  return isIsoDate(iso) ? iso : null;
}
