export type IssueSeverity = 'ERROR' | 'ADVERTENCIA' | 'INFO';

export interface Issue {
  severity: IssueSeverity;
  code: string;
  detail: string;
  row?: number | null;
  column?: string | null;
  value?: string | null;
}

export interface ParsedDay {
  date: string;
  sourceCode: string;
  code: string;
  dayType: string;
  shift: string | null;
  mobile: number | null;
  isNovelty: boolean;
  month: string | null;
  cell: string;
}

export interface ParsedBlock {
  sequence: number;
  blockType: string;
  start: string;
  end: string;
  shift: string | null;
  mobile: number | null;
  partial: boolean;
}

export interface ParsedInspector {
  ordinal: number;
  sourceRow: number;
  sourceName: string;
  name: string;
  nameKey: string;
  employeeNo: string;
  days: ParsedDay[];
  blocks: ParsedBlock[];
  cycleOffset: number;
  positionCode: string;
  positionType: string;
  restGroupCode: string;
  profileCode: string;
  anchorDate: string | null;
  cycleStartPosition: number;
  initialShift: string | null;
  initialMobile: number | null;
  stateDate: string | null;
  stateCode: string;
  shiftIndex: number | null;
  mobileIndex: number | null;
  linkedGroupCode: string | null;
  linkedRole: string | null;
}

export interface LinkedPair {
  first: string;
  second: string;
  comparable_days: number;
}

export interface InitializationPreview {
  fileName: string;
  sheetName: string;
  sha256: string;
  dateFrom: string;
  dateTo: string;
  inspectors: ParsedInspector[];
  issues: Issue[];
  linkedPairs: LinkedPair[];
  metadata: Record<string, unknown>;
  isValid: boolean;
}

export function previewToApi(preview: InitializationPreview) {
  return {
    file_name: preview.fileName,
    sheet_name: preview.sheetName,
    sha256: preview.sha256,
    date_from: preview.dateFrom,
    date_to: preview.dateTo,
    inspectors: preview.inspectors.map((i) => ({
      ordinal: i.ordinal,
      source_row: i.sourceRow,
      source_name: i.sourceName,
      name: i.name,
      name_key: i.nameKey,
      employee_no: i.employeeNo,
      days: i.days.map((d) => ({
        date: d.date,
        source_code: d.sourceCode,
        code: d.code,
        day_type: d.dayType,
        shift: d.shift,
        mobile: d.mobile,
        is_novelty: d.isNovelty,
        month: d.month,
        cell: d.cell,
      })),
      blocks: i.blocks.map((b) => ({
        sequence: b.sequence,
        block_type: b.blockType,
        start: b.start,
        end: b.end,
        shift: b.shift,
        mobile: b.mobile,
        partial: b.partial,
      })),
      cycle_offset: i.cycleOffset,
      position_code: i.positionCode,
      position_type: i.positionType,
      rest_group_code: i.restGroupCode,
      profile_code: i.profileCode,
      anchor_date: i.anchorDate,
      cycle_start_position: i.cycleStartPosition,
      initial_shift: i.initialShift,
      initial_mobile: i.initialMobile,
      state_date: i.stateDate,
      state_code: i.stateCode,
      shift_index: i.shiftIndex,
      mobile_index: i.mobileIndex,
      linked_group_code: i.linkedGroupCode,
      linked_role: i.linkedRole,
    })),
    issues: preview.issues.map((issue) => ({
      severity: issue.severity,
      code: issue.code,
      detail: issue.detail,
      row: issue.row ?? null,
      column: issue.column ?? null,
      value: issue.value ?? null,
    })),
    linked_pairs: preview.linkedPairs,
    metadata: preview.metadata,
    is_valid: preview.isValid,
  };
}
