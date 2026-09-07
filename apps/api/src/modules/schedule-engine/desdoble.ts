/**
 * Desdoble por superposición de inspectores.
 *
 * Cuando tres inspectores caen en el mismo móvil, turno y día, se mueve a uno
 * al móvil que comparte su horario de entrada. Dos en un mismo móvil es reparto
 * normal y no se toca.
 *
 * Es una capa operativa: como `applyOperationalExceptions`, conserva la
 * cuadratura base de cada día (`baseMobile`) para que el movimiento no avance
 * ni recalcule la secuencia. Al día siguiente el inspector vuelve a su móvil.
 */
import type { ProjectedDay, ShiftCode } from './projection';

/**
 * Franjas horarias de entrada dentro de cada turno (RPASV002):
 *   TEMPRANA → móviles 1, 2 y 4   (M 05–13 · T 13–21 · N 21–05)
 *   TARDIA   → móviles 3 y 5      (M 07–15 · T 15–23 · N 23–07)
 */
export const FRANJA: Readonly<Record<number, 'TEMPRANA' | 'TARDIA'>> = {
  1: 'TEMPRANA',
  2: 'TEMPRANA',
  4: 'TEMPRANA',
  3: 'TARDIA',
  5: 'TARDIA',
};

/**
 * Destino de un desdoble: el móvil que comparte franja. Mover fuera de esta
 * tabla le cambiaría el horario de entrada al inspector.
 */
export const MOVIL_PAREJA: Readonly<Record<number, number>> = {
  1: 2,
  2: 1,
  3: 5,
  5: 3,
};

/** Móvil 4: comparte franja con 1 y 2, pero se gestiona manualmente. */
export const MOVIL_MANUAL = 4;

/** Máximo de inspectores tolerado en un móvil antes de desdoblar. */
export const CUPO_POR_MOVIL = 2;

export type EstadoDesdoble = 'RESUELTO' | 'SIN_DESTINO';

export type Desdoble = {
  date: string;
  turno: ShiftCode;
  movilOrigen: number;
  movilDestino: number | null;
  /** Los inspectores superpuestos, en orden alfabético. */
  inspectores: string[];
  /** A quién se movió. `null` si no hubo destino disponible. */
  movido: string | null;
  estado: EstadoDesdoble;
  /** Texto explicando qué pasó y por qué se eligió a esa persona. */
  motivo: string;
};

export type OpcionesDesdoble = {
  /**
   * Habilita el móvil 4 como destino cuando la pareja directa está llena.
   * Comparte franja con los móviles 1 y 2, pero al gestionarse a mano queda
   * deshabilitado salvo pedido expreso.
   */
  permitirMovil4?: boolean;
  /**
   * Si la pareja directa no tiene lugar, prueba con los demás móviles de la
   * MISMA franja horaria.
   *
   * Sin `permitirCruzarFranja`, nunca sale de la franja: mover a un móvil de
   * otro horario le cambiaría la hora de entrada. Si no queda destino con el
   * mismo horario, el caso queda SIN_DESTINO.
   */
  cualquierMovilDelTurno?: boolean;
  /**
   * Último recurso (Ideal): si la franja propia está completa, usa cualquier
   * móvil del mismo turno con lugar aunque cambie la hora de entrada.
   * Sin esto, un mes con más gente en temprana que cupos (6) no se materializa.
   */
  permitirCruzarFranja?: boolean;
};

type Contexto = {
  /** Veces que se desdobló a cada inspector en el período. */
  veces: Map<string, number>;
  /** Último día en que se desdobló a cada inspector. */
  ultimo: Map<string, string>;
  /** Puntero rotativo para desempatar cuando nadie fue desdoblado aún. */
  puntero: number;
  /** Orden estable de inspectores, para que el puntero sea reproducible. */
  orden: string[];
};

function claveSlot(date: string, mobile: number, shift: ShiftCode): string {
  return `${date}|${mobile}|${shift}`;
}

function diasEntre(desde: string, hasta: string): number {
  const ms = Date.parse(hasta + 'T12:00:00Z') - Date.parse(desde + 'T12:00:00Z');
  return Math.round(ms / 86_400_000);
}

/**
 * Elige a quién mover. El criterio reparte la carga sin mirar antigüedad ni
 * legajo: quien ingresó después no tiene por qué caer siempre.
 *
 *   1. el que menos veces fue desdoblado
 *   2. si empatan, el que hace más tiempo que no le toca
 *   3. si siguen empatados, por puntero rotativo
 */
export function elegirParaMover(
  candidatos: string[],
  fecha: string,
  ctx: Contexto,
): string {
  return [...candidatos].sort((a, b) => {
    const vecesA = ctx.veces.get(a) ?? 0;
    const vecesB = ctx.veces.get(b) ?? 0;
    if (vecesA !== vecesB) return vecesA - vecesB;

    const ultA = ctx.ultimo.get(a);
    const ultB = ctx.ultimo.get(b);
    const antigA = ultA ? diasEntre(ultA, fecha) : Number.MAX_SAFE_INTEGER;
    const antigB = ultB ? diasEntre(ultB, fecha) : Number.MAX_SAFE_INTEGER;
    if (antigA !== antigB) return antigB - antigA;

    const total = ctx.orden.length || 1;
    const posA = (ctx.orden.indexOf(a) - ctx.puntero + total) % total;
    const posB = (ctx.orden.indexOf(b) - ctx.puntero + total) % total;
    return posA - posB;
  })[0];
}

function motivoResuelto(
  origen: number,
  destino: number,
  turno: ShiftCode,
  movido: string,
  veces: number,
  mismoHorario: boolean,
): string {
  const desempate =
    veces === 0
      ? 'nunca había sido desdoblado en el período'
      : `es el que menos veces fue desdoblado (${veces} previas)`;
  const destinoTxt = mismoHorario
    ? `al móvil ${destino}, que comparte el mismo horario de entrada`
    : `al móvil ${destino} del mismo turno (franja completa: cambia hora de entrada solo ese día)`;
  return (
    `Tres inspectores asignados al móvil ${origen} en el turno ${turno}. ` +
    `Se movió a ${movido} ${destinoTxt}, conservando el turno. ` +
    `Se lo eligió porque ${desempate}. ` +
    `El cambio vale solo por este día: la cuadratura base no se altera.`
  );
}

function motivoSinDestino(
  origen: number,
  destino: number,
  turno: ShiftCode,
  permitirMovil4: boolean,
): string {
  const nota = permitirMovil4
    ? `El móvil ${MOVIL_MANUAL} tampoco tiene lugar.`
    : `El móvil ${MOVIL_MANUAL} comparte la franja y podría absorberlo, pero se ` +
      `gestiona manualmente y no se asigna de forma automática.`;
  return (
    `Tres inspectores asignados al móvil ${origen} en el turno ${turno}, pero ` +
    `el móvil ${destino} —el único con el mismo horario de entrada— ya tiene ` +
    `${CUPO_POR_MOVIL}. No hay destino sin cambiarle el horario de entrada al ` +
    `inspector. ${nota} Requiere resolución manual.`
  );
}

/**
 * Resuelve las superposiciones de un cronograma proyectado.
 *
 * No muta la entrada: devuelve los días con los movimientos aplicados y el
 * detalle justificado de cada uno.
 */
export function resolverSuperposiciones(
  days: ProjectedDay[],
  opciones: OpcionesDesdoble = {},
): { days: ProjectedDay[]; desdobles: Desdoble[] } {
  const permitirMovil4 = opciones.permitirMovil4 ?? false;
  const cualquierMovilDelTurno = opciones.cualquierMovilDelTurno ?? false;
  const permitirCruzarFranja = opciones.permitirCruzarFranja ?? false;
  const resultado = days.map((d) => ({ ...d }));
  const desdobles: Desdoble[] = [];

  // Índice mutable por slot, para que cada movimiento afecte al siguiente.
  const porSlot = new Map<string, ProjectedDay[]>();
  for (const day of resultado) {
    if (day.dayType !== 'TRABAJO' || day.mobile === null || !day.shift) continue;
    const clave = claveSlot(day.date, day.mobile, day.shift);
    const lista = porSlot.get(clave) ?? [];
    lista.push(day);
    porSlot.set(clave, lista);
  }

  const nombre = (d: ProjectedDay) => d.inspectorName ?? d.positionCode;
  const ctx: Contexto = {
    veces: new Map(),
    ultimo: new Map(),
    puntero: 0,
    orden: [...new Set(resultado.map(nombre))].sort(),
  };

  const fechas = [...new Set(resultado.map((d) => d.date))].sort();
  const turnos: ShiftCode[] = ['M', 'N', 'T'];
  const todosMoviles = Object.keys(FRANJA).map(Number).sort((a, b) => a - b);

  function conCupo(fecha: string, m: number, turno: ShiftCode): boolean {
    return (porSlot.get(claveSlot(fecha, m, turno)) ?? []).length < CUPO_POR_MOVIL;
  }

  function destinosConLugar(
    fecha: string,
    movil: number,
    turno: ShiftCode,
  ): number[] {
    const ordered: number[] = [];
    const push = (m?: number) => {
      if (m && m !== movil && !ordered.includes(m)) ordered.push(m);
    };
    push(MOVIL_PAREJA[movil]);
    if (permitirMovil4 && FRANJA[movil] === FRANJA[MOVIL_MANUAL]) {
      push(MOVIL_MANUAL);
    }
    if (cualquierMovilDelTurno) {
      for (const [n, franja] of Object.entries(FRANJA)) {
        if (franja === FRANJA[movil]) push(Number(n));
      }
    }
    const mismaFranja = ordered.filter(
      (m) => FRANJA[m] === FRANJA[movil] && conCupo(fecha, m, turno),
    );
    if (mismaFranja.length || !permitirCruzarFranja) return mismaFranja;

    // Último recurso: otro móvil del mismo turno (cambia hora de entrada).
    for (const m of todosMoviles) push(m);
    return ordered.filter((m) => conCupo(fecha, m, turno));
  }

  for (const fecha of fechas) {
    const moviles = [
      ...new Set(
        [...porSlot.keys()]
          .filter((k) => k.startsWith(`${fecha}|`))
          .map((k) => Number(k.split('|')[1])),
      ),
    ].sort((a, b) => a - b);
    for (const movil of moviles.length ? moviles : [1, 2, 3, 5]) {
      for (const turno of turnos) {
        let ocupantes = porSlot.get(claveSlot(fecha, movil, turno)) ?? [];
        while (ocupantes.length > CUPO_POR_MOVIL) {
          const inspectores = ocupantes.map(nombre).sort();
          const pareja = MOVIL_PAREJA[movil];
          const destino = destinosConLugar(fecha, movil, turno)[0];

          if (destino === undefined) {
            desdobles.push({
              date: fecha,
              turno,
              movilOrigen: movil,
              movilDestino: null,
              inspectores,
              movido: null,
              estado: 'SIN_DESTINO',
              motivo: motivoSinDestino(movil, pareja ?? movil, turno, permitirMovil4),
            });
            break;
          }

          const elegido = elegirParaMover(inspectores, fecha, ctx);
          const dia = ocupantes.find((d) => nombre(d) === elegido)!;
          const vecesPrevias = ctx.veces.get(elegido) ?? 0;
          const mismoHorario = FRANJA[movil] != null && FRANJA[movil] === FRANJA[destino];

          dia.baseDayType = dia.baseDayType ?? dia.dayType;
          dia.baseShift = dia.baseShift ?? dia.shift;
          dia.baseMobile = dia.baseMobile ?? dia.mobile;
          dia.mobile = destino;
          dia.code = `${turno}${destino}`;

          ocupantes = ocupantes.filter((d) => d !== dia);
          porSlot.set(claveSlot(fecha, movil, turno), ocupantes);
          const destinoLista = porSlot.get(claveSlot(fecha, destino, turno)) ?? [];
          destinoLista.push(dia);
          porSlot.set(claveSlot(fecha, destino, turno), destinoLista);

          ctx.veces.set(elegido, vecesPrevias + 1);
          ctx.ultimo.set(elegido, fecha);
          ctx.puntero = (ctx.orden.indexOf(elegido) + 1) % (ctx.orden.length || 1);

          desdobles.push({
            date: fecha,
            turno,
            movilOrigen: movil,
            movilDestino: destino,
            inspectores,
            movido: elegido,
            estado: 'RESUELTO',
            motivo: motivoResuelto(
              movil,
              destino,
              turno,
              elegido,
              vecesPrevias,
              mismoHorario,
            ),
          });
        }
      }
    }
  }

  return { days: resultado, desdobles };
}
