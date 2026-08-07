export type ShiftCode = 'M' | 'T' | 'N';
export type DayType = 'TRABAJO' | 'FRANCO' | 'VACACION' | 'ENFERMEDAD';
export type IssueSeverity = 'ERROR' | 'ADVERTENCIA' | 'INFO';

export const ROLE_CODES = {
  ADMIN_SV: 'ADMINISTRACION_SEGURIDAD_VIAL',
  JEFE: 'JEFE_SECTOR',
  ADMIN_SYS: 'ADMINISTRADOR_SISTEMA',
  CONSULTA: 'CONSULTA',
  AUDITOR: 'AUDITOR',
} as const;

export type RoleCode = (typeof ROLE_CODES)[keyof typeof ROLE_CODES];

export const SHIFT_SEQUENCE = ['M', 'N', 'T'] as const;
export const MOBILE_SEQUENCE = [1, 5, 3, 2] as const;

export const VACATION_DURATIONS = [7, 14, 21, 28, 35] as const;

export interface AuthUserDto {
  id: string;
  username: string;
  displayName: string;
  roles: RoleCode[];
}

export interface LoginResponse {
  accessToken: string;
  user: AuthUserDto;
}

export interface GapRow {
  fecha_operativa: string;
  movil: number;
  turno: string;
  estado_aceptacion: string;
  motivo_hueco: string | null;
  responsable_aceptacion: string | null;
  version_id?: string;
}

export interface IssueDto {
  severity: IssueSeverity;
  code: string;
  detail: string;
  row?: number | null;
  column?: string | null;
  value?: string | null;
}
