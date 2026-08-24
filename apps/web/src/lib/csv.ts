/**
 * Utilidades de exportación a CSV compatibles con Excel-es-AR:
 * - BOM UTF-8 para que Excel detecte acentos.
 * - Separador `;` (Excel latino usa ; por defecto).
 * - Escape RFC 4180: comillas duplicadas dentro de campos entre comillas.
 */

export function toCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",;\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function buildCsv(rows: unknown[][]): string {
  return rows.map((r) => r.map(toCsvCell).join(';')).join('\r\n');
}

export function downloadCsv(filename: string, rows: unknown[][]) {
  const csv = buildCsv(rows);
  const blob = new Blob(['\uFEFF' + csv], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 250);
}
