import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import ExcelJS from 'exceljs';
import {
  Issue,
  InitializationPreview,
  LinkedPair,
  ParsedBlock,
  ParsedDay,
  ParsedInspector,
} from './models';
import {
  normalizeCode,
  normalizeDisplayName,
  normalizeKey,
  normalizeSheetName,
} from './normalization';
import {
  applyOfficialLinkedPairRoles,
  detectLinkedPairs,
  isOfficialLinkedMember,
  OFFICIAL_LINKED_PAIR,
} from './linked-pair';

export { OFFICIAL_LINKED_PAIR, detectLinkedPairs } from './linked-pair';

const TARGET_SHEET_KEY = 'moviles cba 26 27';
const ALLOWED_CODES = new Set<string>([
  'F',
  'V',
  'EF',
  ...['M', 'T', 'N'].flatMap((s) =>
    [1, 2, 3, 4, 5].map((m) => `${s}${m}`),
  ),
]);
const SHIFT_SEQUENCE = ['M', 'N', 'T'];
const MOBILE_SEQUENCE = [1, 5, 3, 2];
/** Corte operativo de la inicialización: solo se importa hasta esta fecha inclusive. */
export const INITIALIZATION_CUTOFF = new Date(Date.UTC(2026, 6, 31)); // 2026-07-31
const M4_OFFSETS: Record<number, string> = {
  0: 'M4-P01',
  1: 'M4-P02',
  3: 'M4-P03',
  4: 'M4-P04',
  6: 'M4-P05',
};

export function excelColumn(indexZeroBased: number): string {
  let value = indexZeroBased + 1;
  let result = '';
  while (value) {
    const rem = (value - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}

export function asDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    // ExcelJS entrega fechas en UTC; usar getters UTC evita el -1 día en husos negativos.
    return new Date(
      Date.UTC(
        value.getUTCFullYear(),
        value.getUTCMonth(),
        value.getUTCDate(),
      ),
    );
  }
  if (typeof value === 'number' && value >= 40000 && value <= 70000) {
    const epoch = Date.UTC(1899, 11, 30);
    return new Date(epoch + value * 86400000);
  }
  return null;
}

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, days: number): Date {
  const next = new Date(d.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function diffDays(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / 86400000);
}

export function classifyCode(
  code: string,
): [string, string | null, number | null, boolean] {
  if (code === 'F') return ['FRANCO', null, null, false];
  if (code === 'V') return ['VACACION', null, null, true];
  if (code === 'EF') return ['ENFERMEDAD', null, null, true];
  if (/^[MTN][1-5]$/.test(code)) {
    return ['TRABAJO', code[0], Number(code[1]), false];
  }
  throw new Error(code);
}

export function forwardFill(values: unknown[]): Array<string | null> {
  const result: Array<string | null> = [];
  let current: string | null = null;
  for (const value of values) {
    if (value !== null && value !== undefined && String(value).trim()) {
      current = String(value).trim();
    }
    result.push(current);
  }
  return result;
}

export function inferCycleOffset(days: ParsedDay[], origin: Date): number {
  let bestScore = -1;
  let bestOffset = 0;
  for (let offset = 0; offset < 8; offset++) {
    let valid = 0;
    let correct = 0;
    for (const day of days) {
      if (day.isNovelty) continue;
      const actual = day.dayType === 'FRANCO' ? 'F' : 'W';
      const phase = ((diffDays(new Date(day.date + 'T00:00:00Z'), origin) - offset) % 8 + 8) % 8;
      const expected = phase < 5 ? 'W' : 'F';
      valid += 1;
      correct += actual === expected ? 1 : 0;
    }
    const score = valid ? correct / valid : 0;
    if (score > bestScore) {
      bestScore = score;
      bestOffset = offset;
    }
  }
  return bestOffset;
}

export function makeBlocks(days: ParsedDay[]): ParsedBlock[] {
  const eligible = days.filter((d) => !d.isNovelty);
  const blocks: ParsedBlock[] = [];
  let current: ParsedDay[] = [];
  let sequence = 0;

  const flush = () => {
    if (!current.length) return;
    sequence += 1;
    const first = current[0];
    const last = current[current.length - 1];
    const expected = first.dayType === 'FRANCO' ? 3 : 5;
    blocks.push({
      sequence,
      blockType: first.dayType === 'FRANCO' ? 'FRANCO' : 'TRABAJO',
      start: first.date,
      end: last.date,
      shift: first.shift,
      mobile: first.mobile,
      partial: current.length !== expected,
    });
    current = [];
  };

  for (const day of eligible) {
    let same = current.length > 0 &&
      diffDays(new Date(day.date + 'T00:00:00Z'), new Date(current[current.length - 1].date + 'T00:00:00Z')) === 1;
    if (current.length) {
      if (current[0].dayType === 'FRANCO') {
        same = same && day.dayType === 'FRANCO';
      } else {
        same =
          same &&
          day.dayType === 'TRABAJO' &&
          day.code === current[0].code;
      }
    }
    if (!same && current.length) {
      flush();
    }
    current.push(day);
  }
  flush();
  return blocks;
}

export function assignPositions(
  inspectors: ParsedInspector[],
  origin: Date,
  linkedPairs: LinkedPair[],
): void {
  const linkedNames = new Set(linkedPairs.flatMap((p) => [p.first, p.second]));
  const pairAnchor = toIso(addDays(origin, OFFICIAL_LINKED_PAIR.cycleOffset));

  for (const inspector of inspectors) {
    inspector.cycleOffset = inferCycleOffset(inspector.days, origin);
    inspector.anchorDate = toIso(addDays(origin, inspector.cycleOffset));
    inspector.cycleStartPosition = 0;
    const lastValid =
      [...inspector.days].reverse().find((d) => !d.isNovelty) ??
      inspector.days[inspector.days.length - 1];
    inspector.stateDate = lastValid.date;
    inspector.stateCode = lastValid.code;
    inspector.initialShift = lastValid.shift;
    inspector.initialMobile = lastValid.mobile;
    if (lastValid.shift && SHIFT_SEQUENCE.includes(lastValid.shift)) {
      inspector.shiftIndex = SHIFT_SEQUENCE.indexOf(lastValid.shift);
    }
    if (
      lastValid.mobile !== null &&
      MOBILE_SEQUENCE.includes(lastValid.mobile)
    ) {
      inspector.mobileIndex = MOBILE_SEQUENCE.indexOf(lastValid.mobile);
    }

    // RN-032: Haro/Ramos se asignan solo vía dupla oficial (M4-P03 / EXT).
    if (linkedNames.has(inspector.name) || isOfficialLinkedMember(inspector)) {
      inspector.positionCode = '';
      continue;
    }

    const hasM4 = inspector.days.some((d) => d.mobile === 4);
    if (hasM4 && M4_OFFSETS[inspector.cycleOffset]) {
      // Evitar que otro inspector ocupe M4-P03 (reservada a la dupla).
      if (M4_OFFSETS[inspector.cycleOffset] === OFFICIAL_LINKED_PAIR.mobile4Position) {
        inspector.positionCode = `GEN-${String(inspector.ordinal).padStart(3, '0')}`;
        inspector.positionType = 'GENERAL';
        inspector.restGroupCode = `GF-GEN-${String(inspector.ordinal).padStart(3, '0')}`;
        inspector.profileCode = 'ROTACION_GENERAL';
      } else {
        inspector.positionCode = M4_OFFSETS[inspector.cycleOffset];
        inspector.positionType = 'MOVIL4';
        inspector.restGroupCode = `GF-${inspector.positionCode}`;
        inspector.profileCode = 'MOVIL4_FIJO';
      }
    } else {
      inspector.positionCode = `GEN-${String(inspector.ordinal).padStart(3, '0')}`;
      inspector.positionType = 'GENERAL';
      inspector.restGroupCode = `GF-GEN-${String(inspector.ordinal).padStart(3, '0')}`;
      inspector.profileCode = 'ROTACION_GENERAL';
    }
  }

  for (const pair of linkedPairs) {
    applyOfficialLinkedPairRoles(inspectors, pair, pairAnchor);
  }
}

function cellValue(cell: ExcelJS.Cell): unknown {
  const v = cell.value as unknown;
  if (v && typeof v === 'object' && 'result' in (v as object)) {
    return (v as { result: unknown }).result;
  }
  if (v && typeof v === 'object' && 'text' in (v as object)) {
    return (v as { text: string }).text;
  }
  if (v && typeof v === 'object' && 'richText' in (v as object)) {
    return ((v as { richText: Array<{ text: string }> }).richText || [])
      .map((t) => t.text)
      .join('');
  }
  return v ?? null;
}

async function loadSheetMatrix(
  filePath: string,
): Promise<{ sheetName: string; values: unknown[][]; sha256: string; fileName: string }> {
  const bytes = await readFile(filePath);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const workbook = new ExcelJS.Workbook();
  // exceljs typings accept Buffer
  await workbook.xlsx.load(bytes as unknown as ExcelJS.Buffer);

  const matches = workbook.worksheets.filter(
    (ws) => normalizeSheetName(ws.name) === TARGET_SHEET_KEY,
  );
  if (matches.length !== 1) {
    throw new Error(
      `Se esperaba una única hoja exacta 'Móviles Cba 26-27'; encontradas: ${matches
        .map((s) => s.name)
        .join(', ')}`,
    );
  }
  const sheet = matches[0];
  const maxCol = Math.min(sheet.columnCount || 400, 400);
  const maxRow = Math.min(sheet.rowCount || 56, 56);
  const values: unknown[][] = [];
  for (let r = 1; r <= maxRow; r++) {
    const row: unknown[] = [];
    for (let c = 1; c <= maxCol; c++) {
      row.push(cellValue(sheet.getRow(r).getCell(c)));
    }
    values.push(row);
  }
  return {
    sheetName: sheet.name,
    values,
    sha256,
    fileName: filePath.split(/[/\\]/).pop() ?? 'cronograma.xlsx',
  };
}

export async function parseExcel(filePath: string): Promise<InitializationPreview> {
  const { sheetName, values, sha256, fileName } = await loadSheetMatrix(filePath);
  const issues: Issue[] = [];

  let headerIndex: number | null = null;
  for (let idx = 0; idx < values.length; idx++) {
    const row = values[idx];
    if (row && normalizeKey(String(row[0] ?? '')) === 'inspector de movil') {
      headerIndex = idx;
      break;
    }
  }
  if (headerIndex === null) {
    throw new Error("No se encontró la fila 'INSPECTOR DE MÓVIL'");
  }

  const allDateColumns: Array<[number, Date]> = [];
  for (let col = 2; col < values[headerIndex].length; col++) {
    const parsed = asDate(values[headerIndex][col]);
    if (parsed) allDateColumns.push([col, parsed]);
  }
  if (!allDateColumns.length) {
    throw new Error('No se encontraron fechas operativas');
  }
  for (let i = 0; i < allDateColumns.length - 1; i++) {
    const prev = allDateColumns[i][1];
    const curr = allDateColumns[i + 1][1];
    if (diffDays(curr, prev) !== 1) {
      issues.push({
        severity: 'ERROR',
        code: 'FECHAS_NO_CONTIGUAS',
        detail: `Salto entre ${toIso(prev)} y ${toIso(curr)}`,
      });
    }
  }

  const inspectorRowIndexes: number[] = [];
  let blankCount = 0;
  for (let rowIndex = headerIndex + 1; rowIndex < values.length; rowIndex++) {
    const row = values[rowIndex] ?? [];
    const ordinalRaw = row[0];
    const nameRaw = row[1];
    if (typeof ordinalRaw === 'string' && normalizeKey(ordinalRaw) === 'movil') {
      break;
    }
    if (
      (ordinalRaw === null || ordinalRaw === undefined || ordinalRaw === '') &&
      (nameRaw === null || nameRaw === undefined || nameRaw === '')
    ) {
      blankCount += 1;
      if (blankCount >= 2) break;
      continue;
    }
    if (
      !(ordinalRaw === null || ordinalRaw === undefined || ordinalRaw === '') &&
      (nameRaw === null || nameRaw === undefined || nameRaw === '')
    ) {
      break;
    }
    blankCount = 0;
    if (
      !(ordinalRaw === null || ordinalRaw === undefined || ordinalRaw === '') &&
      !(nameRaw === null || nameRaw === undefined || nameRaw === '')
    ) {
      inspectorRowIndexes.push(rowIndex);
    }
  }

  const dateColumns: Array<[number, Date]> = [];
  let firstIncomplete: [number, Date] | null = null;
  for (const [col, currentDate] of allDateColumns) {
    if (diffDays(currentDate, INITIALIZATION_CUTOFF) > 0) {
      break;
    }
    let complete = true;
    for (const rowIndex of inspectorRowIndexes) {
      const raw =
        col < (values[rowIndex]?.length ?? 0) ? values[rowIndex][col] : null;
      if (!ALLOWED_CODES.has(normalizeCode(raw))) {
        complete = false;
        break;
      }
    }
    if (complete && firstIncomplete === null) {
      dateColumns.push([col, currentDate]);
    } else {
      firstIncomplete = firstIncomplete ?? [col, currentDate];
    }
  }
  if (!dateColumns.length) {
    throw new Error('No existe un tramo histórico completo hasta el corte de inicialización');
  }
  const afterCutoff = allDateColumns.filter(
    ([, d]) => diffDays(d, INITIALIZATION_CUTOFF) > 0,
  ).length;
  issues.push({
    severity: 'ADVERTENCIA',
    code: 'CORTE_INICIALIZACION',
    detail: `Inicialización limitada al ${toIso(INITIALIZATION_CUTOFF)} inclusive (${dateColumns.length} días). Se ignoraron ${afterCutoff} columnas posteriores del Excel.`,
  });
  if (firstIncomplete !== null && diffDays(firstIncomplete[1], INITIALIZATION_CUTOFF) <= 0) {
    issues.push({
      severity: 'ADVERTENCIA',
      code: 'COLUMNAS_INCOMPLETAS_ANTES_DEL_CORTE',
      detail: `Había columnas incompletas desde ${toIso(firstIncomplete[1])} antes del corte ${toIso(INITIALIZATION_CUTOFF)}`,
    });
  }

  const monthRowIndex = Math.max(headerIndex - 2, 0);
  const months = forwardFill(values[monthRowIndex] ?? []);
  const inspectors: ParsedInspector[] = [];
  let expectedOrdinal = 1;
  blankCount = 0;

  for (let rowIndex = headerIndex + 1; rowIndex < values.length; rowIndex++) {
    const row = values[rowIndex] ?? [];
    const ordinalRaw = row[0];
    const nameRaw = row[1];
    if (typeof ordinalRaw === 'string' && normalizeKey(ordinalRaw) === 'movil') {
      break;
    }
    if (
      (ordinalRaw === null || ordinalRaw === undefined || ordinalRaw === '') &&
      (nameRaw === null || nameRaw === undefined || nameRaw === '')
    ) {
      blankCount += 1;
      if (blankCount >= 2) break;
      continue;
    }
    if (
      !(ordinalRaw === null || ordinalRaw === undefined || ordinalRaw === '') &&
      (nameRaw === null || nameRaw === undefined || nameRaw === '')
    ) {
      break;
    }
    blankCount = 0;

    const ordinal = Number(ordinalRaw);
    if (!Number.isFinite(ordinal)) {
      issues.push({
        severity: 'ERROR',
        code: 'ORDINAL_INVALIDO',
        detail: 'La primera columna debe ser numérica',
        row: rowIndex + 1,
        column: 'A',
        value: String(ordinalRaw),
      });
      continue;
    }
    if (!nameRaw) {
      issues.push({
        severity: 'ERROR',
        code: 'NOMBRE_VACIO',
        detail: 'Inspector sin nombre',
        row: rowIndex + 1,
        column: 'B',
      });
      continue;
    }
    if (ordinal !== expectedOrdinal) {
      issues.push({
        severity: 'ERROR',
        code: 'ORDINAL_NO_CONTIGUO',
        detail: `Se esperaba ${expectedOrdinal} y se encontró ${ordinal}`,
        row: rowIndex + 1,
        column: 'A',
        value: String(ordinal),
      });
    }
    expectedOrdinal = ordinal + 1;
    const name = normalizeDisplayName(String(nameRaw));
    const inspector: ParsedInspector = {
      ordinal,
      sourceRow: rowIndex + 1,
      sourceName: String(nameRaw),
      name,
      nameKey: normalizeKey(name),
      employeeNo: `EXCEL-${String(ordinal).padStart(3, '0')}`,
      days: [],
      blocks: [],
      cycleOffset: 0,
      positionCode: '',
      positionType: 'GENERAL',
      restGroupCode: '',
      profileCode: 'ROTACION_GENERAL',
      anchorDate: null,
      cycleStartPosition: 0,
      initialShift: null,
      initialMobile: null,
      stateDate: null,
      stateCode: 'F',
      shiftIndex: null,
      mobileIndex: null,
      linkedGroupCode: null,
      linkedRole: null,
    };

    for (const [col, currentDate] of dateColumns) {
      const raw = col < row.length ? row[col] : null;
      const code = normalizeCode(raw);
      const cell = `${excelColumn(col)}${rowIndex + 1}`;
      if (!code) {
        issues.push({
          severity: 'ERROR',
          code: 'CODIGO_VACIO',
          detail: `Código vacío para ${name} el ${toIso(currentDate)}`,
          row: rowIndex + 1,
          column: excelColumn(col),
        });
        continue;
      }
      if (!ALLOWED_CODES.has(code)) {
        issues.push({
          severity: 'ERROR',
          code: 'CODIGO_INVALIDO',
          detail: `Código no reconocido: ${code}`,
          row: rowIndex + 1,
          column: excelColumn(col),
          value: String(raw),
        });
        continue;
      }
      const [dayType, shift, mobile, novelty] = classifyCode(code);
      inspector.days.push({
        date: toIso(currentDate),
        sourceCode: String(raw),
        code,
        dayType,
        shift,
        mobile,
        isNovelty: novelty,
        month: months[col],
        cell,
      });
    }
    inspector.blocks = makeBlocks(inspector.days);
    inspectors.push(inspector);
  }

  const linked = detectLinkedPairs(inspectors);
  issues.push(...linked.issues);
  const linkedPairs = linked.pairs;
  assignPositions(inspectors, dateColumns[0][1], linkedPairs);

  const positionCodes = inspectors.map((i) => i.positionCode);
  const duplicates = new Set(
    positionCodes.filter((c) => positionCodes.filter((x) => x === c).length > 1),
  );
  for (const code of [...duplicates].sort()) {
    issues.push({
      severity: 'ERROR',
      code: 'POSICION_DUPLICADA',
      detail: `Más de un inspector fue asignado a ${code}`,
    });
  }

  const coverage = new Map<string, string[]>();
  for (const inspector of inspectors) {
    for (const day of inspector.days) {
      if (day.dayType !== 'TRABAJO' || day.mobile === null || !day.shift) continue;
      const key = `${day.date}|${day.mobile}|${day.shift}`;
      const list = coverage.get(key) ?? [];
      list.push(inspector.name);
      coverage.set(key, list);
    }
  }
  for (const [key, names] of [...coverage.entries()].sort()) {
    if (names.length <= 2) continue;
    const [date, mobile, shift] = key.split('|');
    issues.push({
      severity: 'ADVERTENCIA',
      code: 'COBERTURA_EXCEDIDA_HISTORICA',
      detail: `${date} móvil ${mobile} turno ${shift}: ${names.length} personas (${names.join(', ')}). Se importa en BASE; PLANIFICADA exigirá máximo 2.`,
    });
  }

  return {
    fileName,
    sheetName,
    sha256,
    dateFrom: toIso(dateColumns[0][1]),
    dateTo: toIso(dateColumns[dateColumns.length - 1][1]),
    inspectors,
    issues,
    linkedPairs,
    metadata: {
      header_row: headerIndex + 1,
      date_columns: dateColumns.length,
      source_date_to: toIso(allDateColumns[allDateColumns.length - 1][1]),
      historical_cutoff: toIso(dateColumns[dateColumns.length - 1][1]),
      initialization_cutoff: toIso(INITIALIZATION_CUTOFF),
      merged_header_strategy:
        'forward-fill solo en encabezados; nunca en filas operativas',
      allowed_codes: [...ALLOWED_CODES].sort(),
    },
    isValid: !issues.some((i) => i.severity === 'ERROR'),
  };
}
