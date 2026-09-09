export type ShiftCode = 'M' | 'T' | 'N';
export type DayType = 'TRABAJO' | 'FRANCO' | 'VACACION' | 'ENFERMEDAD';
export type IssueSeverity = 'ERROR' | 'ADVERTENCIA' | 'INFO';

export const ROLE_CODES = {
  ADMIN_SV: 'ADMINISTRACION_SEGURIDAD_VIAL',
  JEFE: 'JEFE_SECTOR',
  ADMIN_SYS: 'ADMINISTRADOR_SISTEMA',
  CONSULTA: 'CONSULTA',
  AUDITOR: 'AUDITOR',
  RH: 'RECURSOS_HUMANOS',
} as const;

export type RoleCode = (typeof ROLE_CODES)[keyof typeof ROLE_CODES];

export const PERMISSION_CODES = {
  CUADRATURA_VER: 'CUADRATURA_VER',
  CUADRATURA_EDITAR: 'CUADRATURA_EDITAR',
  CUADRATURA_PLANIFICAR: 'CUADRATURA_PLANIFICAR',
  TIMER_CARGAR: 'TIMER_CARGAR',
  EXCEL_EXPORTAR: 'EXCEL_EXPORTAR',
  HUECOS_VER: 'HUECOS_VER',
  HUECO_JUSTIFICAR: 'HUECO_JUSTIFICAR',
  VACACIONES_VER: 'VACACIONES_VER',
  VACACIONES_GESTIONAR: 'VACACIONES_GESTIONAR',
  APROBACION_VER: 'APROBACION_VER',
  PLANIFICACION_CREAR: 'PLANIFICACION_CREAR',
  PLANIFICACION_ENVIAR_REVISION: 'PLANIFICACION_ENVIAR_REVISION',
  PLANIFICACION_OBSERVAR: 'PLANIFICACION_OBSERVAR',
  PLANIFICACION_APROBAR_PUBLICAR: 'PLANIFICACION_APROBAR_PUBLICAR',
  PLANIFICACION_CERRAR: 'PLANIFICACION_CERRAR',
  PERSONAS_GESTIONAR: 'PERSONAS_GESTIONAR',
  LICENCIAS_GESTIONAR: 'LICENCIAS_GESTIONAR',
  MOTIVOS_GESTIONAR: 'MOTIVOS_GESTIONAR',
  MOVILES_GESTIONAR: 'MOVILES_GESTIONAR',
  POSICIONES_GESTIONAR: 'POSICIONES_GESTIONAR',
  PERFILES_GESTIONAR: 'PERFILES_GESTIONAR',
  APARIENCIA_GESTIONAR: 'APARIENCIA_GESTIONAR',
  USUARIOS_ADMINISTRAR: 'USUARIOS_ADMINISTRAR',
  AUDITORIA_CONSULTAR: 'AUDITORIA_CONSULTAR',
  INICIALIZACION_EJECUTAR: 'INICIALIZACION_EJECUTAR',
} as const;

export type PermissionCode = (typeof PERMISSION_CODES)[keyof typeof PERMISSION_CODES];

export const PERMISSION_GROUPS: Array<{
  id: string;
  label: string;
  items: Array<{ codigo: PermissionCode; label: string; descripcion: string }>;
}> = [
  {
    id: 'cuadratura',
    label: 'Cuadratura',
    items: [
      {
        codigo: PERMISSION_CODES.CUADRATURA_VER,
        label: 'Ver cuadratura, ocupación y Timer',
        descripcion: 'Entra a la grilla, ocupación y Timer. No puede cambiar nada.',
      },
      {
        codigo: PERMISSION_CODES.CUADRATURA_EDITAR,
        label: 'Editar Real (códigos, enroques)',
        descripcion: 'Cambia el Real: códigos, enroques y novedades del día.',
      },
      {
        codigo: PERMISSION_CODES.CUADRATURA_PLANIFICAR,
        label: 'Generar y aplicar Ideal',
        descripcion: 'Arma o vuelve a generar la capa Ideal.',
      },
      {
        codigo: PERMISSION_CODES.TIMER_CARGAR,
        label: 'Cargar y guardar Timer',
        descripcion: 'Completa el Timer y lo guarda. El Excel sale a su nombre.',
      },
      {
        codigo: PERMISSION_CODES.EXCEL_EXPORTAR,
        label: 'Descargar Excel y planillas',
        descripcion: 'Baja el Excel de la cuadratura y las planillas por móvil.',
      },
    ],
  },
  {
    id: 'novedades',
    label: 'Novedades y flujo',
    items: [
      {
        codigo: PERMISSION_CODES.HUECOS_VER,
        label: 'Ver huecos',
        descripcion: 'Ve los huecos pendientes. No los justifica.',
      },
      {
        codigo: PERMISSION_CODES.HUECO_JUSTIFICAR,
        label: 'Justificar huecos',
        descripcion: 'Marca un hueco como justificado.',
      },
      {
        codigo: PERMISSION_CODES.VACACIONES_VER,
        label: 'Ver vacaciones',
        descripcion: 'Ve el listado de vacaciones. No carga ni modifica.',
      },
      {
        codigo: PERMISSION_CODES.VACACIONES_GESTIONAR,
        label: 'Cargar vacaciones',
        descripcion: 'Carga o modifica vacaciones del plantel.',
      },
      {
        codigo: PERMISSION_CODES.APROBACION_VER,
        label: 'Ver aprobación de versiones',
        descripcion: 'Ve el estado de las versiones: borrador, revisión, publicado.',
      },
      {
        codigo: PERMISSION_CODES.PLANIFICACION_CREAR,
        label: 'Crear o reabrir borrador',
        descripcion: 'Abre un período en borrador o reabre uno observado.',
      },
      {
        codigo: PERMISSION_CODES.PLANIFICACION_ENVIAR_REVISION,
        label: 'Enviar a revisión',
        descripcion: 'Manda el borrador al jefe para que lo revise.',
      },
      {
        codigo: PERMISSION_CODES.PLANIFICACION_OBSERVAR,
        label: 'Observar una versión',
        descripcion: 'Devuelve una versión con comentarios, sin publicarla.',
      },
      {
        codigo: PERMISSION_CODES.PLANIFICACION_APROBAR_PUBLICAR,
        label: 'Aprobar y publicar',
        descripcion: 'Aprueba el cronograma y lo deja vigente.',
      },
      {
        codigo: PERMISSION_CODES.PLANIFICACION_CERRAR,
        label: 'Cerrar un período',
        descripcion: 'Cierra el período para que no se siga editando.',
      },
    ],
  },
  {
    id: 'admin',
    label: 'Administración',
    items: [
      {
        codigo: PERMISSION_CODES.PERSONAS_GESTIONAR,
        label: 'Personas',
        descripcion: 'Altas, bajas y ficha: legajo, sección y secuencia.',
      },
      {
        codigo: PERMISSION_CODES.LICENCIAS_GESTIONAR,
        label: 'Códigos de cuadratura',
        descripcion: 'Catálogo de códigos: nombre, color, SAP y si está activo.',
      },
      {
        codigo: PERMISSION_CODES.MOTIVOS_GESTIONAR,
        label: 'Motivos del Timer',
        descripcion: 'Los motivos que se eligen al cargar el Timer.',
      },
      {
        codigo: PERMISSION_CODES.MOVILES_GESTIONAR,
        label: 'Móviles',
        descripcion: 'Alta y datos de los móviles.',
      },
      {
        codigo: PERMISSION_CODES.POSICIONES_GESTIONAR,
        label: 'Posiciones',
        descripcion: 'Plazas de la secuencia (el asiento en el móvil).',
      },
      {
        codigo: PERMISSION_CODES.PERFILES_GESTIONAR,
        label: 'Perfiles de rotación',
        descripcion: 'Cómo rota la secuencia entre móviles y turnos.',
      },
      {
        codigo: PERMISSION_CODES.APARIENCIA_GESTIONAR,
        label: 'Apariencia',
        descripcion: 'Colores de fondo y letras de la app, en este navegador.',
      },
      {
        codigo: PERMISSION_CODES.USUARIOS_ADMINISTRAR,
        label: 'Usuarios y claves',
        descripcion: 'Crea usuarios, resetea la clave y asigna tipo, permisos y secciones.',
      },
      {
        codigo: PERMISSION_CODES.AUDITORIA_CONSULTAR,
        label: 'Actividad',
        descripcion: 'Ve quién hizo qué: ingresos, cambios y pedidos de clave.',
      },
      {
        codigo: PERMISSION_CODES.INICIALIZACION_EJECUTAR,
        label: 'Inicialización técnica',
        descripcion: 'Tareas de arranque del sistema. No es del día a día.',
      },
    ],
  },
];

export const ADMIN_PERMISSIONS: PermissionCode[] = [
  PERMISSION_CODES.PERSONAS_GESTIONAR,
  PERMISSION_CODES.LICENCIAS_GESTIONAR,
  PERMISSION_CODES.MOTIVOS_GESTIONAR,
  PERMISSION_CODES.MOVILES_GESTIONAR,
  PERMISSION_CODES.POSICIONES_GESTIONAR,
  PERMISSION_CODES.PERFILES_GESTIONAR,
  PERMISSION_CODES.APARIENCIA_GESTIONAR,
  PERMISSION_CODES.USUARIOS_ADMINISTRAR,
  PERMISSION_CODES.AUDITORIA_CONSULTAR,
];

const VER_BASE: PermissionCode[] = [
  PERMISSION_CODES.CUADRATURA_VER,
  PERMISSION_CODES.EXCEL_EXPORTAR,
  PERMISSION_CODES.HUECOS_VER,
  PERMISSION_CODES.VACACIONES_VER,
  PERMISSION_CODES.APROBACION_VER,
];

export const ROLE_DEFAULT_PERMISSIONS: Record<RoleCode, PermissionCode[]> = {
  [ROLE_CODES.CONSULTA]: VER_BASE,
  [ROLE_CODES.AUDITOR]: [...VER_BASE, PERMISSION_CODES.AUDITORIA_CONSULTAR],
  [ROLE_CODES.RH]: [
    ...VER_BASE,
    PERMISSION_CODES.PERSONAS_GESTIONAR,
    PERMISSION_CODES.LICENCIAS_GESTIONAR,
    PERMISSION_CODES.MOTIVOS_GESTIONAR,
    PERMISSION_CODES.VACACIONES_GESTIONAR,
    PERMISSION_CODES.APARIENCIA_GESTIONAR,
  ],
  [ROLE_CODES.JEFE]: [
    ...VER_BASE,
    PERMISSION_CODES.CUADRATURA_EDITAR,
    PERMISSION_CODES.TIMER_CARGAR,
    PERMISSION_CODES.HUECO_JUSTIFICAR,
    PERMISSION_CODES.VACACIONES_GESTIONAR,
    PERMISSION_CODES.PLANIFICACION_OBSERVAR,
    PERMISSION_CODES.PLANIFICACION_APROBAR_PUBLICAR,
    PERMISSION_CODES.PLANIFICACION_CERRAR,
    PERMISSION_CODES.PERSONAS_GESTIONAR,
    PERMISSION_CODES.LICENCIAS_GESTIONAR,
    PERMISSION_CODES.MOTIVOS_GESTIONAR,
    PERMISSION_CODES.MOVILES_GESTIONAR,
    PERMISSION_CODES.APARIENCIA_GESTIONAR,
  ],
  [ROLE_CODES.ADMIN_SV]: [
    ...VER_BASE,
    PERMISSION_CODES.CUADRATURA_EDITAR,
    PERMISSION_CODES.CUADRATURA_PLANIFICAR,
    PERMISSION_CODES.TIMER_CARGAR,
    PERMISSION_CODES.HUECO_JUSTIFICAR,
    PERMISSION_CODES.VACACIONES_GESTIONAR,
    PERMISSION_CODES.PLANIFICACION_CREAR,
    PERMISSION_CODES.PLANIFICACION_ENVIAR_REVISION,
    PERMISSION_CODES.PLANIFICACION_OBSERVAR,
    PERMISSION_CODES.PLANIFICACION_APROBAR_PUBLICAR,
    PERMISSION_CODES.PLANIFICACION_CERRAR,
    PERMISSION_CODES.PERSONAS_GESTIONAR,
    PERMISSION_CODES.LICENCIAS_GESTIONAR,
    PERMISSION_CODES.MOTIVOS_GESTIONAR,
    PERMISSION_CODES.MOVILES_GESTIONAR,
    PERMISSION_CODES.POSICIONES_GESTIONAR,
    PERMISSION_CODES.PERFILES_GESTIONAR,
    PERMISSION_CODES.APARIENCIA_GESTIONAR,
    PERMISSION_CODES.USUARIOS_ADMINISTRAR,
    PERMISSION_CODES.AUDITORIA_CONSULTAR,
  ],
  [ROLE_CODES.ADMIN_SYS]: Object.values(PERMISSION_CODES),
};

export const ROLE_TIPO_ORDEN: RoleCode[] = [
  ROLE_CODES.ADMIN_SYS,
  ROLE_CODES.JEFE,
  ROLE_CODES.RH,
  ROLE_CODES.AUDITOR,
  ROLE_CODES.CONSULTA,
];

export const ROLE_META: Record<RoleCode, { nombre: string; descripcion: string }> = {
  [ROLE_CODES.ADMIN_SYS]: {
    nombre: 'Administrador del sistema',
    descripcion: 'Gestiona todo: usuarios, catálogos, cuadratura y flujo.',
  },
  [ROLE_CODES.ADMIN_SV]: {
    nombre: 'Administrador del sistema',
    descripcion: 'Gestiona todo: usuarios, catálogos, cuadratura y flujo.',
  },
  [ROLE_CODES.JEFE]: {
    nombre: 'Jefe del sector',
    descripcion: 'Aprueba, publica y edita el Real. No administra usuarios. Qué ve lo definen las secciones.',
  },
  [ROLE_CODES.RH]: {
    nombre: 'Recursos humanos',
    descripcion: 'Personas y catálogos. No administra usuarios. Qué ve lo definen las secciones.',
  },
  [ROLE_CODES.AUDITOR]: {
    nombre: 'Auditor',
    descripcion: 'Solo consulta y trazabilidad. Qué ve lo definen las secciones.',
  },
  [ROLE_CODES.CONSULTA]: {
    nombre: 'Consulta',
    descripcion: 'Solo lectura. Qué ve lo definen las secciones.',
  },
};

export function tipoPrincipal(roles: string[]): RoleCode {
  const mapped = roles.map((r) =>
    r === ROLE_CODES.ADMIN_SV ? ROLE_CODES.ADMIN_SYS : r,
  );
  return ROLE_TIPO_ORDEN.find((t) => mapped.includes(t)) ?? ROLE_CODES.CONSULTA;
}

export function defaultsDeTipo(tipo: string): PermissionCode[] {
  if (tipo in ROLE_DEFAULT_PERMISSIONS) {
    return [...ROLE_DEFAULT_PERMISSIONS[tipo as RoleCode]];
  }
  return [...VER_BASE];
}

export type AlcanceSecciones = {
  seccionesTodas: boolean;
  secciones: string[];
};

export function veSeccion(
  alcance: AlcanceSecciones | null | undefined,
  seccion?: string | null,
): boolean {
  if (!alcance) return false;
  if (alcance.seccionesTodas) return true;
  return alcance.secciones.includes((seccion || 'MOVILES').trim());
}

export const SHIFT_SEQUENCE = ['M', 'N', 'T'] as const;
export const MOBILE_SEQUENCE = [1, 5, 3, 2] as const;
/** Móviles de cuadratura propia Ruta 36 (no rotan en la secuencia general). */
export const RUTA36_MOBILES = [6, 7] as const;

export const VACATION_DURATIONS = [7, 14, 21, 28, 35] as const;

/**
 * Tope de seguridad para consultas y proyecciones. La versión 2.7 no impone
 * un límite operativo de planificación: este valor sólo evita que un rango
 * accidentalmente enorme congele el navegador o la base. Ajustar si hiciera
 * falta ampliar el horizonte.
 */
export const PLANNING_MAX_DAYS = 3660;

export interface AuthUserDto {
  id: string;
  username: string;
  displayName: string;
  roles: RoleCode[];
  permissions: PermissionCode[];
  seccionesTodas: boolean;
  secciones: string[];
  legajo?: string | null;
  apellido?: string | null;
  nombres?: string | null;
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
