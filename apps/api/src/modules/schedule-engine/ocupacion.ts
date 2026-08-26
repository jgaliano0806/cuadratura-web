/**
 * Ocupación de móviles.
 *
 * Responde cuántos inspectores quedaron asignados a cada móvil, turno y día, y
 * quiénes son. Es la vista que permite ver de un golpe dónde falta gente y
 * dónde sobra, antes y después de resolver los desdobles.
 *
 * No decide nada ni modifica el cronograma: solo cuenta lo que hay.
 * Las superposiciones las resuelve `resolverSuperposiciones` en `desdoble.ts`.
 */
import { FRANJA, CUPO_POR_MOVIL } from './desdoble';
import type { ProjectedDay, ShiftCode } from './projection';

/** Móviles que se cuentan en el tablero, incluido el 4 (gestión manual). */
export const MOVILES_OPERATIVOS = [1, 2, 3, 4, 5] as const;

export const TURNOS: readonly ShiftCode[] = ['M', 'N', 'T'] as const;

/**
 * - `HUECO`       nadie cubre el móvil en ese turno.
 * - `CUBIERTA`    un inspector: el reparto buscado.
 * - `DOBLE`       dos inspectores: reparto normal, no se toca.
 * - `SUPERPUESTA` tres o más: hay que desdoblar.
 */
export type EstadoOcupacion = 'HUECO' | 'CUBIERTA' | 'DOBLE' | 'SUPERPUESTA';

export type SlotOcupacion = {
  date: string;
  movil: number;
  turno: ShiftCode;
  franja: 'TEMPRANA' | 'TARDIA' | null;
  cantidad: number;
  /** Inspectores asignados, en orden alfabético. */
  inspectores: string[];
  estado: EstadoOcupacion;
};

export type ResumenDia = {
  date: string;
  trabajando: number;
  franco: number;
  huecos: number;
  superpuestos: number;
};

export type ResumenMovil = {
  movil: number;
  franja: 'TEMPRANA' | 'TARDIA' | null;
  huecos: number;
  cubiertas: number;
  dobles: number;
  superpuestas: number;
};

export function estadoDe(cantidad: number): EstadoOcupacion {
  if (cantidad === 0) return 'HUECO';
  if (cantidad === 1) return 'CUBIERTA';
  if (cantidad <= CUPO_POR_MOVIL) return 'DOBLE';
  return 'SUPERPUESTA';
}

function nombre(day: ProjectedDay): string {
  return day.inspectorName ?? day.positionCode;
}

/**
 * Ocupación de cada combinación móvil × turno × día del rango proyectado.
 *
 * Devuelve la grilla completa, incluidos los slots vacíos: un hueco es
 * información tan relevante como una superposición, y si se omitieran las
 * combinaciones sin nadie el tablero mentiría por ausencia.
 */
export function calcularOcupacion(
  days: ProjectedDay[],
  moviles: readonly number[] = MOVILES_OPERATIVOS,
): SlotOcupacion[] {
  const porSlot = new Map<string, string[]>();
  for (const day of days) {
    if (day.dayType !== 'TRABAJO' || day.mobile === null || !day.shift) continue;
    const clave = `${day.date}|${day.mobile}|${day.shift}`;
    const lista = porSlot.get(clave) ?? [];
    lista.push(nombre(day));
    porSlot.set(clave, lista);
  }

  const fechas = [...new Set(days.map((d) => d.date))].sort();
  const salida: SlotOcupacion[] = [];

  for (const date of fechas) {
    for (const movil of moviles) {
      for (const turno of TURNOS) {
        const inspectores = (porSlot.get(`${date}|${movil}|${turno}`) ?? []).sort();
        salida.push({
          date,
          movil,
          turno,
          franja: FRANJA[movil] ?? null,
          cantidad: inspectores.length,
          inspectores,
          estado: estadoDe(inspectores.length),
        });
      }
    }
  }
  return salida;
}

/** Cuánta gente trabaja y cuánta está de franco cada día, con huecos y superposiciones. */
export function resumenPorDia(
  days: ProjectedDay[],
  moviles: readonly number[] = MOVILES_OPERATIVOS,
): ResumenDia[] {
  const slots = calcularOcupacion(days, moviles);
  const porFecha = new Map<string, ResumenDia>();

  for (const date of [...new Set(days.map((d) => d.date))].sort()) {
    porFecha.set(date, {
      date,
      trabajando: 0,
      franco: 0,
      huecos: 0,
      superpuestos: 0,
    });
  }
  for (const day of days) {
    const fila = porFecha.get(day.date);
    if (!fila) continue;
    if (day.dayType === 'TRABAJO') fila.trabajando += 1;
    else if (day.dayType === 'FRANCO') fila.franco += 1;
  }
  for (const slot of slots) {
    const fila = porFecha.get(slot.date);
    if (!fila) continue;
    if (slot.estado === 'HUECO') fila.huecos += 1;
    if (slot.estado === 'SUPERPUESTA') fila.superpuestos += 1;
  }
  return [...porFecha.values()];
}

/** Totales por móvil sobre todo el rango. Sirve para ver si uno carga de más. */
export function resumenPorMovil(slots: SlotOcupacion[]): ResumenMovil[] {
  const porMovil = new Map<number, ResumenMovil>();
  for (const slot of slots) {
    const fila =
      porMovil.get(slot.movil) ??
      ({
        movil: slot.movil,
        franja: slot.franja,
        huecos: 0,
        cubiertas: 0,
        dobles: 0,
        superpuestas: 0,
      } satisfies ResumenMovil);
    if (slot.estado === 'HUECO') fila.huecos += 1;
    if (slot.estado === 'CUBIERTA') fila.cubiertas += 1;
    if (slot.estado === 'DOBLE') fila.dobles += 1;
    if (slot.estado === 'SUPERPUESTA') fila.superpuestas += 1;
    porMovil.set(slot.movil, fila);
  }
  return [...porMovil.values()].sort((a, b) => a.movil - b.movil);
}

/** Solo los slots que piden atención: sin cobertura o con tres o más. */
export function slotsConProblema(slots: SlotOcupacion[]): SlotOcupacion[] {
  return slots.filter(
    (s) => s.estado === 'HUECO' || s.estado === 'SUPERPUESTA',
  );
}
