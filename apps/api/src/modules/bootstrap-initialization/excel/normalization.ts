const SPACE_RE = /\s+/g;
const DOT_RE = /\s*\.\s*/g;

export function collapseSpaces(value: string): string {
  return value.trim().replace(SPACE_RE, ' ');
}

export function normalizeDisplayName(value: string): string {
  let next = (value || '').normalize('NFKC');
  next = next.replace(/[’`]/g, "'");
  next = collapseSpaces(next);
  next = next.replace(DOT_RE, '.');
  return next;
}

export function normalizeKey(value: string): string {
  let next = normalizeDisplayName(value);
  next = next.normalize('NFD').replace(/\p{M}/gu, '');
  next = next.toLowerCase();
  next = next.replace(/[^a-z0-9]+/g, ' ');
  return collapseSpaces(next);
}

export function normalizeSheetName(value: string): string {
  return normalizeKey(value);
}

export function normalizeCode(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  return collapseSpaces(String(value)).toUpperCase().replace(/ /g, '');
}
