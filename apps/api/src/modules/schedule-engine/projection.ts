/**
 * Motor de proyección de cuadratura (doc 07_Algoritmo_Generacion_Cronograma).
 *
 * Ciclo 5×3 · turnos M→N→T · móviles según perfil.
 *
 * El móvil avanza **un paso del ciclo por mes calendario**, resuelto en el
 * inicio del bloque: el primer bloque que arranca en el mes nuevo toma el móvil
 * nuevo (doc 07 §5, "el móvil que corresponda a su configuración y al período
 * de inicio"). Un bloque que cruza el fin de mes no se parte.
 *
 * No es "cada 4 bloques": 4 bloques son 32 días y un mes ~30,4, así que ambas
 * reglas coinciden unos 3 meses y después derivan. En la cuadratura ideal
 * jun–ago 2026 hay 10 de 32 tramos de móvil que duran 3 o 5 bloques, no 4.
 *
 * Un perfil de móvil fijo (móvil 4, Ruta 36) se expresa con `mobiles` de un solo
 * elemento: el módulo lo deja constante sin necesidad de un caso especial.
 *
 * Verificado contra `__fixtures__/cuadratura-ideal-2026.json` (100%).
 */

export type ShiftCode = 'M' | 'N' | 'T';
export type DayType =
  | 'TRABAJO'
  | 'FRANCO'
  | 'VACACION'
  | 'LICENCIA'
  | 'ENFERMEDAD'
  | 'HUECO';

export type ProjectionInput = {
  positionCode: string;
  positionId: string;
  inspectorId: string | null;
  inspectorName: string | null;
  referenceDate: string; // YYYY-MM-DD — día descrito por el estado
  cyclePosition: number; // 0..7
  shift: ShiftCode | null;
  mobile: number | null;
  shiftIndex: number | null;
  mobileIndex: number | null;
  shifts: ShiftCode[];
  mobiles: number[];
  /**
   * @deprecated Sin efecto desde la cadencia mensual. El móvil ya no depende de
   * cuántos bloques se completaron, sino del mes en que arranca cada bloque.
   * Se conserva para no romper los llamadores; se puede eliminar.
   */
  completedBlocksOnMobile?: number;
  /** Si hay vigencia de asignación, no se emiten días fuera de ese intervalo. */
  assignedFrom?: string | null;
  assignedTo?: string | null;
};

export type ProjectedDay = {
  date: string;
  positionCode: string;
  positionId: string;
  inspectorId: string | null;
  inspectorName: string | null;
  dayType: DayType;
  shift: ShiftCode | null;
  mobile: number | null;
  code: string;
  cyclePosition: number;
  /** Valores inmutables calculados por la cuadratura base. */
  baseDayType?: DayType;
  baseShift?: ShiftCode | null;
  baseMobile?: number | null;
  operationalExceptionId?: string;
};

export type OperationalException = {
  id: string;
  inspectorId: string;
  dateFrom: string;
  dateTo: string | null;
  dayType?: DayType;
  shift?: ShiftCode | null;
  mobile?: number | null;
};

export type EngineState = {
  date: string;
  cyclePosition: number;
  shift: ShiftCode | null;
  mobile: number | null;
  shiftIndex: number;
  mobileIndex: number;
  /** Inicio del bloque al que corresponde `mobileIndex`. Ancla de la cadencia. */
  mobileAnchorDate: string;
  /** Índice de móvil vigente en `mobileAnchorDate`. */
  mobileAnchorIndex: number;
  shifts: ShiftCode[];
  mobiles: number[];
};

export function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function diffDaysIso(a: string, b: string): number {
  const ms =
    Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z');
  return Math.round(ms / 86_400_000);
}

/** Meses calendario completos entre dos fechas ISO (b - a). Puede ser negativo. */
export function monthDiffIso(a: string, b: string): number {
  const [ay, am] = a.split('-').map(Number);
  const [by, bm] = b.split('-').map(Number);
  return (by - ay) * 12 + (bm - am);
}

/**
 * Móvil que corresponde a un bloque según el mes en que arranca.
 * Con `mobiles` de un solo elemento (móvil fijo) devuelve siempre ese índice.
 */
function mobileIndexForBlock(
  blockStart: string,
  anchorBlockStart: string,
  anchorIndex: number,
  mobilesLength: number,
): number {
  if (mobilesLength <= 1) return 0;
  const months = monthDiffIso(anchorBlockStart, blockStart);
  return ((anchorIndex + months) % mobilesLength + mobilesLength) % mobilesLength;
}

function codeFor(dayType: DayType, shift: ShiftCode | null, mobile: number | null): string {
  if (dayType === 'FRANCO') return 'F';
  if (dayType === 'VACACION') return 'V';
  if (dayType === 'ENFERMEDAD') return 'EF';
  if (dayType === 'LICENCIA') return 'L';
  if (dayType === 'HUECO') return 'H';
  if (!shift || mobile === null) return 'F';
  return `${shift}${mobile}`;
}

export function createState(input: ProjectionInput): EngineState {
  const shifts = input.shifts.length ? input.shifts : (['M', 'N', 'T'] as ShiftCode[]);
  const mobiles = input.mobiles.length ? input.mobiles : [1, 5, 3, 2];

  let shiftIndex =
    input.shiftIndex ??
    (input.shift ? Math.max(0, shifts.indexOf(input.shift)) : 0);
  if (shiftIndex < 0) shiftIndex = 0;

  let mobileIndex =
    input.mobileIndex ??
    (input.mobile !== null ? Math.max(0, mobiles.indexOf(input.mobile)) : 0);
  if (mobileIndex < 0) mobileIndex = 0;

  const inWork = input.cyclePosition >= 0 && input.cyclePosition <= 4;
  const shift = inWork
    ? shifts[shiftIndex] ?? input.shift
    : null;
  const mobile = inWork
    ? mobiles[mobileIndex] ?? input.mobile
    : null;

  const cyclePosition = ((input.cyclePosition % 8) + 8) % 8;

  // El bloque vigente arrancó `cyclePosition` días atrás — también durante el
  // franco (posiciones 5..7), donde el móvil describe el bloque recién cerrado.
  const mobileAnchorDate = addDaysIso(input.referenceDate, -cyclePosition);

  return {
    date: input.referenceDate,
    cyclePosition,
    shift,
    mobile,
    shiftIndex,
    mobileIndex,
    mobileAnchorDate,
    mobileAnchorIndex: mobileIndex,
    shifts,
    mobiles,
  };
}

/** Avanza el estado al día calendario siguiente. */
export function advanceOneDay(state: EngineState): EngineState {
  const nextDate = addDaysIso(state.date, 1);
  const from = state.cyclePosition;
  const to = (from + 1) % 8;

  let {
    shift,
    mobile,
    shiftIndex,
    mobileIndex,
    mobileAnchorDate,
    mobileAnchorIndex,
    shifts,
    mobiles,
  } = state;

  // Cierre de bloque de trabajo (ciclo 4 → 5)
  if (from === 4 && to === 5) {
    shift = null;
    mobile = null;
  }

  // Inicio de nuevo bloque de trabajo (ciclo 7 → 0).
  // El móvil se resuelve por el mes en que arranca ESTE bloque; nunca a mitad
  // de bloque, de modo que un bloque que cruza el fin de mes no se parte.
  if (from === 7 && to === 0) {
    mobileIndex = mobileIndexForBlock(
      nextDate,
      mobileAnchorDate,
      mobileAnchorIndex,
      mobiles.length,
    );
    shiftIndex = (shiftIndex + 1) % shifts.length;
    shift = shifts[shiftIndex];
    mobile = mobiles[mobileIndex];
  }

  // Dentro de trabajo: conservar turno/móvil vigentes
  if (to >= 0 && to <= 4) {
    shift = shifts[shiftIndex];
    mobile = mobiles[mobileIndex];
  }

  // Dentro de franco
  if (to >= 5 && to <= 7) {
    shift = null;
    mobile = null;
  }

  return {
    date: nextDate,
    cyclePosition: to,
    shift,
    mobile,
    shiftIndex,
    mobileIndex,
    mobileAnchorDate,
    mobileAnchorIndex,
    shifts,
    mobiles,
  };
}

export function dayFromState(
  state: EngineState,
  meta: Pick<
    ProjectionInput,
    'positionCode' | 'positionId' | 'inspectorId' | 'inspectorName'
  >,
): ProjectedDay {
  const dayType: DayType =
    state.cyclePosition <= 4 ? 'TRABAJO' : 'FRANCO';
  return {
    date: state.date,
    positionCode: meta.positionCode,
    positionId: meta.positionId,
    inspectorId: meta.inspectorId,
    inspectorName: meta.inspectorName,
    dayType,
    shift: dayType === 'TRABAJO' ? state.shift : null,
    mobile: dayType === 'TRABAJO' ? state.mobile : null,
    code: codeFor(dayType, state.shift, state.mobile),
    cyclePosition: state.cyclePosition,
  };
}

/**
 * Proyecta días en [dateFrom, dateTo] inclusive.
 * El estado de entrada describe referenceDate; se avanza hasta cubrir el rango.
 */
export function projectRange(
  input: ProjectionInput,
  dateFrom: string,
  dateTo: string,
): ProjectedDay[] {
  if (dateFrom > dateTo) return [];

  let state = createState(input);
  const meta = {
    positionCode: input.positionCode,
    positionId: input.positionId,
    inspectorId: input.inspectorId,
    inspectorName: input.inspectorName,
  };

  // Avanzar hasta dateFrom si el estado está antes
  while (state.date < dateFrom) {
    state = advanceOneDay(state);
  }

  // Si el estado está después de dateFrom, no podemos retroceder con fidelidad
  if (state.date > dateFrom) {
    throw new Error(
      `Estado de ${input.positionCode} en ${input.referenceDate} queda en ${state.date}, posterior a ${dateFrom}`,
    );
  }

  const out: ProjectedDay[] = [];
  while (state.date <= dateTo) {
    const enAsignacion =
      (!input.assignedFrom || state.date >= input.assignedFrom) &&
      (!input.assignedTo || state.date <= input.assignedTo);
    if (state.date >= dateFrom && enAsignacion) {
      out.push(dayFromState(state, meta));
    }
    if (state.date === dateTo) break;
    state = advanceOneDay(state);
  }
  return out;
}

/**
 * Aplica destinos/turnos temporales como una capa operativa. Nunca alimenta el
 * estado del motor: cada día conserva su cuadratura base para que la excepción
 * no avance ni recalcule la secuencia futura.
 */
export function applyOperationalExceptions(
  days: ProjectedDay[],
  exceptions: OperationalException[],
): ProjectedDay[] {
  return days.map((day) => {
    const exception = exceptions
      .filter(
        (item) =>
          day.inspectorId === item.inspectorId &&
          day.date >= item.dateFrom &&
          (item.dateTo === null || day.date <= item.dateTo),
      )
      .sort((a, b) => b.dateFrom.localeCompare(a.dateFrom))[0];
    if (!exception) return day;

    const dayType = exception.dayType ?? day.dayType;
    const shift = dayType === 'TRABAJO' ? (exception.shift ?? day.shift) : null;
    const mobile = dayType === 'TRABAJO' ? (exception.mobile ?? day.mobile) : null;
    return {
      ...day,
      baseDayType: day.dayType,
      baseShift: day.shift,
      baseMobile: day.mobile,
      operationalExceptionId: exception.id,
      dayType,
      shift,
      mobile,
      code: codeFor(dayType, shift, mobile),
    };
  });
}

/** Agrupa días proyectados en bloques contiguos homogéneos (para materializar). */
export function groupIntoBlocks(days: ProjectedDay[]): Array<{
  dayType: DayType;
  start: string;
  end: string;
  shift: ShiftCode | null;
  mobile: number | null;
  days: ProjectedDay[];
}> {
  const blocks: Array<{
    dayType: DayType;
    start: string;
    end: string;
    shift: ShiftCode | null;
    mobile: number | null;
    days: ProjectedDay[];
  }> = [];

  for (const day of days) {
    const last = blocks[blocks.length - 1];
    const same =
      last &&
      last.dayType === day.dayType &&
      last.shift === day.shift &&
      last.mobile === day.mobile &&
      addDaysIso(last.end, 1) === day.date;

    if (same && last) {
      last.end = day.date;
      last.days.push(day);
    } else {
      blocks.push({
        dayType: day.dayType,
        start: day.date,
        end: day.date,
        shift: day.shift,
        mobile: day.mobile,
        days: [day],
      });
    }
  }
  return blocks;
}

/**
 * @deprecated La cadencia del móvil es mensual, no por cantidad de bloques.
 * Se conserva solo para no romper imports existentes.
 */
export const WORK_BLOCKS_PER_MOBILE = 4;
