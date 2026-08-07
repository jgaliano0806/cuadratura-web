/**
 * Motor de proyección de cuadratura (doc 07_Algoritmo_Generacion_Cronograma).
 *
 * Ciclo 5×3 · turnos M→N→T · móviles según perfil.
 * El móvil avanza cada 4 bloques de trabajo completados (evidencia Excel Acosta/Gimenez).
 */

export type ShiftCode = 'M' | 'N' | 'T';
export type DayType = 'TRABAJO' | 'FRANCO';

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
  /** Bloques TRABAJO consecutivos con el mismo móvil ya cerrados antes del estado. */
  completedBlocksOnMobile: number;
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
  completedBlocksOnMobile: number;
  shifts: ShiftCode[];
  mobiles: number[];
};

const WORK_BLOCKS_PER_MOBILE = 4;

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

function codeFor(dayType: DayType, shift: ShiftCode | null, mobile: number | null): string {
  if (dayType === 'FRANCO') return 'F';
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

  return {
    date: input.referenceDate,
    cyclePosition: ((input.cyclePosition % 8) + 8) % 8,
    shift,
    mobile,
    shiftIndex,
    mobileIndex,
    completedBlocksOnMobile: Math.max(0, input.completedBlocksOnMobile),
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
    completedBlocksOnMobile,
    shifts,
    mobiles,
  } = state;

  // Cierre de bloque de trabajo (ciclo 4 → 5)
  if (from === 4 && to === 5) {
    completedBlocksOnMobile += 1;
    shift = null;
    mobile = null;
  }

  // Inicio de nuevo bloque de trabajo (ciclo 7 → 0)
  if (from === 7 && to === 0) {
    if (completedBlocksOnMobile >= WORK_BLOCKS_PER_MOBILE) {
      mobileIndex = (mobileIndex + 1) % mobiles.length;
      completedBlocksOnMobile = 0;
    }
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
    completedBlocksOnMobile,
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
    if (state.date >= dateFrom) {
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

export { WORK_BLOCKS_PER_MOBILE };
