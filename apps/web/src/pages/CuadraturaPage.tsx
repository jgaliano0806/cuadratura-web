/**
 * Cuadratura: una grilla, dos capas.
 * Ideal = ciclo inferido (consulta + 2 archivos).
 * Real  = esa ideal más las situaciones registradas.
 * Si todavía no hay cambios, la real muestra el ciclo: no hay pantalla vacía.
 */
import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent, type MouseEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { ConfirmDialog, DateField, DateRangePresets, EmptyState, ExcelMenu, FilterPicker, Modal, PeoplePicker, SearchSelect, useToast } from '../components/ui';
import type { Person } from '../components/ui';
import { isoToDmy } from '../lib/dateRange';
import {
  ShiftCell,
  DayDetailPanel,
  OcupacionBoard,
  OcupacionPackProvider,
  TimerBoard,
  type Licencia,
} from '../components/schedule';
import { PlantelSwitch } from '../components/PlantelSwitch';
import {
  ambitosDelAlcance,
  etiquetaPersonaRol,
  etiquetaPersonas,
  etiquetaSeccion,
  parseAmbito,
  parsePlanteles,
  plantelListo,
  plantelPorDefecto,
  plantelesDelAlcance,
  PLANTELES,
  seccionesDePlanteles,
  type AmbitoId,
  type PlantelId,
} from '../lib/plantel';
import { apellidoYNombre, legajoMostrar } from '../lib/personLabel';
import { useAuth } from '../lib/auth';
import { PERMISSION_CODES } from '@plataforma/shared';
import { useGridColWidths } from '../lib/useGridColWidths';
import {
  addIsoDays,
  SHIFT_LABEL,
  SHIFTS,
  eachDate,
  iso,
  monthBounds,
  monthLabel,
  monthSpansHelper,
  rowKey,
  shiftMonth,
  toDateOnly,
  weekdayAbbrev,
  cellShortLabel,
  diaPasa,
  type BoardResponse,
  type DayRow,
  type FiltrosGrilla,
} from '../lib/scheduleUtils';
import { useBoxTheme } from '../lib/boxTheme';
import { useCuadPaneles } from '../lib/cuadPaneles';

type Capa = 'PLANIFICADA' | 'REAL';
type Vista = 'plan' | 'real';
type Pack = 'cuadratura' | 'planillas';

type Version = {
  id: string;
  periodo_desde?: string;
  periodo_hasta?: string;
};

type Inspector = Person;

type TipoCambio = 'CODIGO' | 'ENROQUE';

type AlcanceIdeal = {
  kind: 'seleccion' | 'filas' | 'columnas';
  inspectorIds: string[] | null;
  dateFrom: string;
  dateTo: string;
  mensaje: string;
};

const TIPOS_CAMBIO: Array<{ valor: TipoCambio; etiqueta: string }> = [
  { valor: 'CODIGO', etiqueta: 'Código' },
  { valor: 'ENROQUE', etiqueta: 'Enroque' },
];

const CONSOLA_W_KEY = { plan: 'cuad-consola-w-plan', real: 'cuad-consola-w-real' } as const;
const CONSOLA_W_MIN = 220;
const CONSOLA_W_MAX = 560;
const CONSOLA_W_DEF = { plan: 248, real: 320 };

function clampConsolaW(n: number, cap = CONSOLA_W_MAX) {
  return Math.round(Math.min(cap, Math.max(CONSOLA_W_MIN, n)));
}

function leerConsolaW(capa: Vista) {
  const propio = Number(localStorage.getItem(CONSOLA_W_KEY[capa]));
  if (Number.isFinite(propio)) return clampConsolaW(propio);
  const viejo = Number(localStorage.getItem('cuad-consola-w'));
  return Number.isFinite(viejo) ? clampConsolaW(viejo) : CONSOLA_W_DEF[capa];
}


/** Superposición de 3 que no se pudo resolver sin cambiar el horario de entrada. */
type CasoSinDestino = {
  fecha: string;
  turno: string;
  turno_texto: string;
  movil: number;
  hora_entrada: string | null;
  inspectores: string[];
  motivo: string;
};

function mensaje(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return 'Error inesperado';
}

function diasSolapa(v: Version, desde: string, hasta: string): number {
  const a = toDateOnly(v.periodo_desde);
  const b = toDateOnly(v.periodo_hasta);
  if (!a || !b || a > hasta || b < desde) return 0;
  const from = a > desde ? a : desde;
  const to = b < hasta ? b : hasta;
  const t0 = Date.parse(`${from}T12:00:00`);
  const t1 = Date.parse(`${to}T12:00:00`);
  if (!Number.isFinite(t0) || !Number.isFinite(t1) || t1 < t0) return 0;
  return Math.round((t1 - t0) / 86400000) + 1;
}

function elegir(versiones: Version[], desde: string, hasta: string): Version | null {
  let best: Version | null = null;
  let bestScore = -1;
  for (const v of versiones) {
    const n = diasSolapa(v, desde, hasta);
    if (n <= 0) continue;
    const a = toDateOnly(v.periodo_desde);
    const b = toDateOnly(v.periodo_hasta);
    const cubreTodo = Boolean(a && b && a <= desde && b >= hasta);
    const span =
      a && b
        ? Math.round(
            (Date.parse(`${b}T12:00:00`) - Date.parse(`${a}T12:00:00`)) / 86400000,
          ) + 1
        : 0;
    const score = (cubreTodo ? 1_000_000 : 0) + n * 10 + span;
    if (score > bestScore) {
      best = v;
      bestScore = score;
    }
  }
  return best;
}

function fechaCorta(isoDate: string) {
  const m = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}` : isoDate;
}

function primerDato(versiones: Version[]): string {
  const fechas = versiones
    .map((v) => toDateOnly(v.periodo_desde))
    .filter((f): f is string => Boolean(f))
    .sort();
  return fechas[0] ?? '';
}

function ultimoDato(versiones: Version[]): string {
  const fechas = versiones
    .map((v) => toDateOnly(v.periodo_hasta))
    .filter((f): f is string => Boolean(f))
    .sort();
  return fechas[fechas.length - 1] ?? '';
}

function rangoAGenerar(
  cubiertoHasta: string,
  from: string,
  to: string,
): { from: string; to: string } | null {
  if (!from || !to || from > to) return null;
  if (!cubiertoHasta) return { from, to };
  if (to <= cubiertoHasta) return null;
  const hueco = addIsoDays(cubiertoHasta, 1);
  return { from: hueco > from ? hueco : from, to };
}

function etiquetaRango(from: string, to: string) {
  return `${fechaCorta(from)} → ${fechaCorta(to)}`;
}

function esFinDeSemana(f: string): boolean {
  const d = new Date(f + 'T12:00:00').getDay();
  return d === 0 || d === 6;
}

type Seleccion = {
  cell: DayRow;
  focus: string;
  anchor: string;
  dateFrom: string;
  dateTo: string;
};

function parseCodigo(valor: string): {
  shift?: 'M' | 'T' | 'N';
  mobile?: number;
  kind?: 'VACACION' | 'LICENCIA' | 'FERIADO' | 'ENFERMEDAD';
  licenciaId?: string;
} | null {
  if (!valor) return null;
  if (valor.startsWith('TM:')) {
    const rest = valor.slice(3);
    const shift = rest[0];
    const mobile = Number(rest.slice(1));
    if (shift !== 'M' && shift !== 'T' && shift !== 'N') return null;
    if (!Number.isFinite(mobile) || mobile < 1) return null;
    return { shift, mobile };
  }
  if (valor === 'A:FERIADO') return { kind: 'FERIADO' };
  if (valor === 'A:VACACION') return { kind: 'VACACION' };
  if (valor === 'A:ENFERMEDAD') return { kind: 'ENFERMEDAD' };
  if (valor.startsWith('L:')) return { kind: 'LICENCIA', licenciaId: valor.slice(2) };
  return null;
}

function agrupar(
  board: BoardResponse | null,
  filtros: FiltrosGrilla,
  catalogo?: Set<string>,
  personas?: Map<string, Person>,
) {
  const mapa = new Map<
    string,
    { nombre: string; legajo: string; seccion: string; dias: Map<string, DayRow> }
  >();
  const cruza = Boolean(filtros.licencias.length || filtros.moviles.length || filtros.turnos.length);
  for (const d of board?.days ?? []) {
    if (!d.inspector_id) continue;
    if (catalogo && !catalogo.has(d.inspector_id)) continue;
    const k = d.inspector_id;
    const fuente = personas?.get(k) ?? d;
    const seccionId = personas?.get(k)?.seccion || 'MOVILES';
    const entrada = mapa.get(k) ?? {
      nombre: apellidoYNombre(fuente),
      legajo: legajoMostrar(fuente.legajo),
      seccion: etiquetaSeccion(seccionId),
      dias: new Map<string, DayRow>(),
    };
    entrada.dias.set(d.fecha_operativa, d);
    mapa.set(k, entrada);
  }
  return [...mapa.entries()]
    .map(([k, v]) => ({ key: k, ...v }))
    .filter((r) => {
      if (filtros.inspectores.length && !filtros.inspectores.includes(r.key)) return false;
      if (cruza && ![...r.dias.values()].some((d) => diaPasa(d, filtros))) return false;
      return true;
    })
    .sort(
      (a, b) =>
        a.seccion.localeCompare(b.seccion, 'es') ||
        a.nombre.localeCompare(b.nombre, 'es') ||
        a.legajo.localeCompare(b.legajo),
    );
}

function siguienteCelda(
  filas: { dias: Map<string, DayRow> }[],
  fechas: string[],
  ri: number,
  ci: number,
  dr: number,
  dc: number,
  filtros: FiltrosGrilla,
  cruza: boolean,
  hastaElFinal: boolean,
): { cell: DayRow; date: string } | null {
  let r = ri;
  let c = ci;
  let last: { cell: DayRow; date: string } | null = null;
  while (true) {
    r += dr;
    c += dc;
    if (r < 0 || r >= filas.length || c < 0 || c >= fechas.length) break;
    const d = filas[r].dias.get(fechas[c]);
    if (!d || (cruza && !diaPasa(d, filtros))) continue;
    last = { cell: d, date: fechas[c] };
    if (!hastaElFinal) return last;
  }
  return last;
}

function enCampoEditable(el: EventTarget | null) {
  if (!(el instanceof HTMLElement)) return false;
  if (el.closest('input, textarea, select, [contenteditable="true"]')) return true;
  if (el.closest('[role="listbox"], [role="menu"], dialog, .modal')) return true;
  return false;
}

function ColResizer({ onDrag }: { onDrag: (e: MouseEvent<HTMLSpanElement>) => void }) {
  return (
    <span
      className="col-resizer"
      role="separator"
      aria-orientation="vertical"
      onMouseDown={onDrag}
    />
  );
}

function claveDia(d: DayRow) {
  return `${rowKey(d)}|${toDateOnly(d.fecha_operativa)}`;
}

function celdaHueco(
  inspectorId: string,
  fecha: string,
  extra?: { inspector?: string | null; legajo?: string | null },
): DayRow {
  return {
    fecha_operativa: fecha,
    tipo_dia: '',
    codigo: '',
    turno: null,
    movil: null,
    inspector: extra?.inspector ?? null,
    inspector_id: inspectorId,
    legajo: extra?.legajo ?? null,
    posicion_codigo: '',
  };
}

function celdasDelRango(
  board: BoardResponse | null,
  inspectorId: string | null | undefined,
  from: string,
  to: string,
  extra?: { inspector?: string | null; legajo?: string | null },
): DayRow[] {
  if (!inspectorId || !from || !to) return [];
  const mapa = new Map<string, DayRow>();
  for (const d of board?.days ?? []) {
    if (d.inspector_id !== inspectorId) continue;
    const f = toDateOnly(d.fecha_operativa);
    if (f >= from && f <= to) mapa.set(f, d);
  }
  return eachDate(from, to).map(
    (f) => mapa.get(f) ?? celdaHueco(inspectorId, f, extra),
  );
}

function esDiff(celda: DayRow, otra: DayRow | undefined): boolean {
  return Boolean(
    otra && (otra.codigo !== celda.codigo || otra.tipo_dia !== celda.tipo_dia),
  );
}

function contarDiffs(plan: BoardResponse | null, real: BoardResponse | null): number {
  if (!plan || !real) return 0;
  const mapa = new Map<string, DayRow>();
  for (const d of plan.days) mapa.set(claveDia(d), d);
  let n = 0;
  for (const d of real.days) {
    const otra = mapa.get(claveDia(d));
    if (otra && esDiff(d, otra)) n += 1;
  }
  return n;
}

/** Real = Ideal + novedades. Si un día no tiene cambio, se ve el ciclo. */
function fusionarReal(
  plan: BoardResponse | null,
  real: BoardResponse | null,
): BoardResponse | null {
  if (!real?.days?.length) return plan;
  if (!plan?.days?.length) return real;
  const overlay = new Map<string, DayRow>();
  for (const d of real.days) overlay.set(claveDia(d), d);
  const days = plan.days.map((d) => overlay.get(claveDia(d)) ?? d);
  const vistos = new Set(days.map(claveDia));
  for (const d of real.days) {
    if (!vistos.has(claveDia(d))) days.push(d);
  }
  return { ...real, days };
}

function Grilla({
  board,
  fechas,
  hoy,
  filtros,
  catalogo,
  personas,
  mostrarSeccion,
  cargando,
  vacio,
  seleccion,
  contra,
  soloCambios,
  onSelect,
  cubiertoHasta,
}: {
  board: BoardResponse | null;
  fechas: string[];
  hoy: string;
  filtros: FiltrosGrilla;
  catalogo?: Set<string>;
  personas?: Map<string, Person>;
  mostrarSeccion?: boolean;
  cargando: boolean;
  vacio: string;
  seleccion: Seleccion | null;
  contra: BoardResponse | null;
  soloCambios?: boolean;
  onSelect: (cell: DayRow, date: string, opts?: { extend?: boolean }) => void;
  /** Último día con ciclo generado; fechas posteriores se marcan como pendientes. */
  cubiertoHasta?: string;
}) {
  const filas = useMemo(
    () => agrupar(board, filtros, catalogo, personas),
    [board, filtros, catalogo, personas],
  );
  const meses = useMemo(() => monthSpansHelper(fechas), [fechas]);
  const { cols, begin } = useGridColWidths();
  const cruza = Boolean(
    filtros.licencias.length || filtros.moviles.length || filtros.turnos.length,
  );
  const contraMap = useMemo(() => {
    const m = new Map<string, DayRow>();
    for (const d of contra?.days ?? []) {
      m.set(`${rowKey(d)}|${d.fecha_operativa}`, d);
    }
    return m;
  }, [contra]);
  const filasVista = useMemo(() => {
    if (!soloCambios) return filas;
    return filas.filter((fila) =>
      fechas.some((f) => {
        const celda = fila.dias.get(f);
        if (!celda) return false;
        return esDiff(celda, contraMap.get(`${fila.key}|${f}`));
      }),
    );
  }, [filas, fechas, contraMap, soloCambios]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [cajaW, setCajaW] = useState(0);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const medir = () => setCajaW(el.clientWidth);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [filasVista.length, fechas.length]);

  const vis = useMemo(() => {
    const legMin = 56;
    const nameMin = 96;
    const seccionMin = mostrarSeccion ? 64 : 0;
    const dayMin = 32;
    if (cajaW < 120) {
      return {
        legajo: cols.legajo,
        name: cols.name,
        seccion: mostrarSeccion ? cols.seccion : 0,
        day: cols.day,
      };
    }
    const frozenCap = Math.max(legMin + nameMin + seccionMin, Math.floor(cajaW * 0.48));
    const seccion = mostrarSeccion
      ? Math.min(cols.seccion, Math.max(seccionMin, Math.round(frozenCap * 0.22)))
      : 0;
    const restoFrozen = frozenCap - seccion;
    const legajo = Math.min(cols.legajo, Math.max(legMin, Math.round(restoFrozen * 0.3)));
    const name = Math.min(cols.name, Math.max(nameMin, restoFrozen - legajo));
    const rest = Math.max(dayMin, cajaW - legajo - name - seccion);
    const n = Math.max(1, fechas.length);
    const dayFit = Math.floor(rest / n);
    const day = Math.min(cols.day, Math.max(dayMin, dayFit));
    return { legajo, name, seccion, day };
  }, [cajaW, cols, fechas.length, mostrarSeccion]);

  useEffect(() => {
    if (!seleccion) return;
    const el = scrollRef.current?.querySelector<HTMLElement>('.sap-cell.selected');
    if (!el) return;
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const ae = document.activeElement;
    if (
      ae instanceof HTMLElement &&
      (ae === document.body || ae.closest('.sap-cell, .sap-grid-scroll, .sap-grid'))
    ) {
      el.focus({ preventScroll: true });
    }
  }, [seleccion]);

  useEffect(() => {
    if (!seleccion || !filasVista.length || !fechas.length) return;
    // El evento de window es el del DOM, no el sintético de React: el import de
    // arriba trae `KeyboardEvent` de React y taparía al global.
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (enCampoEditable(e.target)) return;
      if (e.key === 'Tab' && (e.ctrlKey || e.metaKey || e.altKey)) return;
      const inGrid =
        e.target instanceof HTMLElement &&
        Boolean(e.target.closest('.sap-grid-scroll, .sap-cell'));
      const ri = filasVista.findIndex((f) => f.key === rowKey(seleccion.cell));
      const ci = fechas.indexOf(seleccion.focus);
      if (ri < 0 || ci < 0) return;
      const jump = e.ctrlKey || e.metaKey;
      let next: { cell: DayRow; date: string } | null = null;
      if (e.key === 'ArrowLeft' || (e.key === 'Tab' && e.shiftKey && inGrid)) {
        next = siguienteCelda(
          filasVista,
          fechas,
          ri,
          ci,
          0,
          -1,
          filtros,
          cruza,
          e.key === 'Tab' ? false : jump,
        );
      } else if (e.key === 'ArrowRight' || (e.key === 'Tab' && inGrid)) {
        next = siguienteCelda(
          filasVista,
          fechas,
          ri,
          ci,
          0,
          1,
          filtros,
          cruza,
          e.key === 'Tab' ? false : jump,
        );
      } else if (e.key === 'ArrowUp') {
        next = siguienteCelda(filasVista, fechas, ri, ci, -1, 0, filtros, cruza, jump);
      } else if (e.key === 'ArrowDown') {
        next = siguienteCelda(filasVista, fechas, ri, ci, 1, 0, filtros, cruza, jump);
      } else if (e.key === 'Home') {
        next = siguienteCelda(filasVista, fechas, ri, ci, 0, -1, filtros, cruza, true);
      } else if (e.key === 'End') {
        next = siguienteCelda(filasVista, fechas, ri, ci, 0, 1, filtros, cruza, true);
      } else {
        return;
      }
      e.preventDefault();
      if (next) {
        onSelect(next.cell, next.date, {
          extend: e.shiftKey && e.key !== 'Tab',
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [seleccion, filasVista, fechas, filtros, cruza, onSelect]);

  // Solo skeleton en la primera carga. Si ya hay tablero, se mantiene visible
  // mientras llega el nuevo rango (evita el parpadeo al filtrar fechas).
  if (cargando && !board) {
    return (
      <div className="cuad-skel" aria-hidden>
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="cuad-skel-row">
            <span className="cuad-skel-legajo" />
            <span className="cuad-skel-name" />
            {Array.from({ length: 10 }).map((__, j) => (
              <span key={j} className="cuad-skel-cell" />
            ))}
          </div>
        ))}
      </div>
    );
  }

  if (!board || filas.length === 0) {
    return <EmptyState compact title={vacio} />;
  }
  if (filasVista.length === 0) {
    return (
      <EmptyState
        compact
        title="Nadie cambió respecto de la Ideal"
        description="Mostrá la cuadratura completa o ampliá el período."
      />
    );
  }

  return (
    <div
      className={`sap-grid-scroll${cargando ? ' is-refreshing' : ''}`}
      ref={scrollRef}
      aria-busy={cargando || undefined}
    >
      <table
        className={`sap-grid${cruza ? ' is-filtering' : ''}${mostrarSeccion ? ' has-seccion' : ''}`}
        style={
          {
            '--sap-legajo-w': `${vis.legajo}px`,
            '--sap-name-w': `${vis.name}px`,
            '--sap-seccion-w': `${vis.seccion}px`,
            '--sap-day-w': `${vis.day}px`,
          } as CSSProperties
        }
      >
        <thead>
          <tr className="sap-month-row">
            <th className="sap-sticky-legajo">
              <ColResizer onDrag={(e) => begin('legajo', e)} />
            </th>
            <th className="sap-sticky-name">
              <ColResizer onDrag={(e) => begin('name', e)} />
            </th>
            {mostrarSeccion ? (
              <th className="sap-sticky-seccion">
                <ColResizer onDrag={(e) => begin('seccion', e)} />
              </th>
            ) : null}
            {meses.map((m) => (
              <th key={m.key} colSpan={m.span} className="sap-month-cell">
                <span className="sap-month-label">{m.label}</span>
              </th>
            ))}
          </tr>
          <tr>
            <th className="sap-sticky-legajo">
              Legajo
              <ColResizer onDrag={(e) => begin('legajo', e)} />
            </th>
            <th className="sap-sticky-name">
              Apellido y Nombre
              <ColResizer onDrag={(e) => begin('name', e)} />
            </th>
            {mostrarSeccion ? (
              <th className="sap-sticky-seccion">
                Sección
                <ColResizer onDrag={(e) => begin('seccion', e)} />
              </th>
            ) : null}
            {fechas.map((f) => (
              <th
                key={f}
                title={f}
                className={`${f === hoy ? 'is-today' : ''}${
                  esFinDeSemana(f) ? ' is-weekend' : ''
                }`}
              >
                <span className="sap-wd">{weekdayAbbrev(f)}</span>
                <span className="sap-day">{f.slice(8, 10)}</span>
                <ColResizer onDrag={(e) => begin('day', e)} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filasVista.map((fila) => (
            <tr key={fila.key}>
              <th className="sap-sticky-legajo">{fila.legajo}</th>
              <th className="sap-sticky-name" scope="row" title={fila.nombre}>
                {fila.nombre}
              </th>
              {mostrarSeccion ? (
                <th className="sap-sticky-seccion" title={fila.seccion}>
                  {fila.seccion}
                </th>
              ) : null}
              {fechas.map((f) => {
                const celda = fila.dias.get(f);
                const oculta = Boolean(celda && cruza && !diaPasa(celda, filtros));
                const coincide = Boolean(celda && cruza && diaPasa(celda, filtros));
                const misma = Boolean(
                  seleccion && rowKey(seleccion.cell) === fila.key,
                );
                const enRango =
                  misma &&
                  f >= seleccion!.dateFrom &&
                  f <= seleccion!.dateTo;
                const vacia =
                  celda ??
                  celdaHueco(fila.key, f, {
                    inspector: fila.nombre,
                    legajo: fila.legajo,
                  });
                if (!celda) {
                  if (soloCambios) return <td key={f} className="sap-empty" />;
                  const fueraCiclo = Boolean(cubiertoHasta && f > cubiertoHasta);
                  return (
                    <td
                      key={f}
                      className={`${esFinDeSemana(f) ? 'is-weekend' : ''}`.trim() || undefined}
                    >
                      <ShiftCell
                        cell={vacia}
                        date={f}
                        selected={misma && seleccion!.focus === f}
                        rangeSelected={enRango && seleccion!.focus !== f}
                        onSelect={fueraCiclo ? undefined : onSelect}
                      />
                    </td>
                  );
                }
                const otra = contraMap.get(`${fila.key}|${f}`);
                const differs = esDiff(celda, otra);
                if (soloCambios && !differs) {
                  return <td key={f} className="sap-empty" />;
                }
                return (
                  <td
                    key={f}
                    className={`${esFinDeSemana(f) ? 'is-weekend' : ''}${
                      oculta ? ' is-filtered' : coincide ? ' is-match' : ''
                    }`.trim() || undefined}
                  >
                    <ShiftCell
                      cell={celda}
                      date={f}
                      differs={differs}
                      selected={misma && seleccion!.focus === f}
                      rangeSelected={enRango && seleccion!.focus !== f}
                      onSelect={oculta ? undefined : onSelect}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CuadraturaPage() {
  const toast = useToast();
  const { user, hasPermission } = useAuth();
  const puedeEditar = hasPermission(PERMISSION_CODES.CUADRATURA_EDITAR);
  const puedePlanificar = hasPermission(PERMISSION_CODES.CUADRATURA_PLANIFICAR);
  const [params, setParams] = useSearchParams();
  const inicial = useMemo(() => monthBounds(iso(new Date())), []);
  const hoy = useMemo(() => iso(new Date()), []);
  const capa: Vista = params.get('vista') === 'real' ? 'real' : 'plan';
  const alcance = useMemo(
    () => ({
      seccionesTodas: user?.seccionesTodas ?? true,
      secciones: user?.secciones ?? [],
    }),
    [user],
  );
  const permitidos = useMemo(() => plantelesDelAlcance(alcance), [alcance]);
  const ambitosOk = useMemo(() => ambitosDelAlcance(alcance), [alcance]);
  const sinAlcance = Boolean(user) && !alcance.seccionesTodas && alcance.secciones.length === 0;
  const ambitoRaw = parseAmbito(params.get('ambito'), params.get('plantel'));
  const ambito = ambitosOk.includes(ambitoRaw) ? ambitoRaw : (ambitosOk[0] ?? ambitoRaw);
  const planteles = parsePlanteles(params.get('plantel'), ambito, permitidos);
  const plantel = planteles[0] ?? plantelPorDefecto(ambito, permitidos);
  const { boxes } = useBoxTheme();
  const { paneles } = useCuadPaneles();
  const leyendaBoxes = useMemo(() => boxes.filter((b) => b.visible), [boxes]);
  const mostrarSeccion = planteles.length > 1;
  const plantelLabel =
    planteles.length === 1
      ? (PLANTELES.find((p) => p.id === plantel)?.title ?? 'Inspectores')
      : planteles
          .map((id) => PLANTELES.find((p) => p.id === id)?.title ?? id)
          .join(' · ');
  const personasLabel = [...new Set(planteles.map(etiquetaPersonas))].length === 1
    ? etiquetaPersonas(plantel)
    : 'Personas';
  const personaRol = [...new Set(planteles.map(etiquetaPersonaRol))].length === 1
    ? etiquetaPersonaRol(plantel)
    : 'Persona';

  const [desde, setDesde] = useState(() => params.get('from') || inicial.from);
  const [hasta, setHasta] = useState(() => params.get('to') || inicial.to);
  const desdeVista = useDeferredValue(desde);
  const hastaVista = useDeferredValue(hasta);

  const [planes, setPlanes] = useState<Version[]>([]);
  const [reales, setReales] = useState<Version[]>([]);
  const [boardPlan, setBoardPlan] = useState<BoardResponse | null>(null);
  const [boardReal, setBoardReal] = useState<BoardResponse | null>(null);
  /** Rango del último calendar cargado (columnas no saltan hasta tener datos). */
  const [rangoPlan, setRangoPlan] = useState<{ from: string; to: string } | null>(null);
  const [rangoReal, setRangoReal] = useState<{ from: string; to: string } | null>(null);
  const [cargandoPlan, setCargandoPlan] = useState(false);
  const [cargandoReal, setCargandoReal] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [versionesListas, setVersionesListas] = useState(false);
  const pedidoHuecoRef = useRef('');
  const [falloHueco, setFalloHueco] = useState('');

  /**
   * Casos donde tres inspectores coinciden en un móvil y no hay destino con el
   * mismo horario de entrada. No se resuelven solos: los muestra para que una
   * persona decida.
   */
  const [casosManuales, setCasosManuales] = useState<CasoSinDestino[]>([]);
  const [avisoAntes, setAvisoAntes] = useState('');

  const [seleccion, setSeleccion] = useState<Seleccion | null>(null);
  const [filtroInspectores, setFiltroInspectores] = useState<string[]>([]);
  const [filtroLicencias, setFiltroLicencias] = useState<string[]>([]);
  const [filtroMoviles, setFiltroMoviles] = useState<string[]>([]);
  const [filtroTurnos, setFiltroTurnos] = useState<string[]>([]);
  const [soloCambios, setSoloCambios] = useState(false);
  const [licencias, setLicencias] = useState<Licencia[]>([]);

  const [inspectores, setInspectores] = useState<Inspector[] | null>(null);
  const [movilesActivos, setMovilesActivos] = useState<number[]>([]);
  const [cbInspector, setCbInspector] = useState('');
  const [cbTipo, setCbTipo] = useState<TipoCambio>('CODIGO');
  const [cbCodigo, setCbCodigo] = useState('');
  const [cbCon, setCbCon] = useState('');
  const [cbDesde, setCbDesde] = useState('');
  const [cbHasta, setCbHasta] = useState('');
  const [cbMotivo, setCbMotivo] = useState('');
  const [cbObservacion, setCbObservacion] = useState('');
  const [motivosCat, setMotivosCat] = useState<Array<{ id: string; nombre: string }>>([]);
  const [consola, setConsola] = useState(() => localStorage.getItem('cuad-consola') !== '0');
  const [anchosSide, setAnchosSide] = useState(() => ({
    plan: leerConsolaW('plan'),
    real: leerConsolaW('real'),
  }));
  const workRef = useRef<HTMLDivElement>(null);
  const [exportPendiente, setExportPendiente] = useState<Pack | null>(null);
  const [confirmKind, setConfirmKind] = useState<null | 'cambio' | 'ideal'>(null);
  const [idealPendiente, setIdealPendiente] = useState<AlcanceIdeal | null>(null);

  const datoDesde = useMemo(() => primerDato([...planes, ...reales]), [planes, reales]);
  /** Último día con filas reales en la grilla Ideal (el periodo del cronograma a veces se adelanta). */
  const cubiertoHastaDatos = useMemo(() => {
    let max = '';
    for (const d of boardPlan?.days ?? []) {
      if (d.fecha_operativa > max) max = d.fecha_operativa;
    }
    return max;
  }, [boardPlan]);
  const cubiertoHastaMeta = useMemo(
    () => ultimoDato(planes.length ? planes : reales),
    [planes, reales],
  );
  const cubiertoHasta = useMemo(() => {
    // Si ya cargamos el tablero Ideal, el periodo del cronograma no alcanza:
    // a veces dice "hasta octubre" pero septiembre no tiene días.
    if (boardPlan) return cubiertoHastaDatos;
    return cubiertoHastaMeta;
  }, [boardPlan, cubiertoHastaDatos, cubiertoHastaMeta]);
  const hueco = useMemo(
    () => (versionesListas ? rangoAGenerar(cubiertoHasta, desdeVista, hastaVista) : null),
    [versionesListas, cubiertoHasta, desdeVista, hastaVista],
  );
  const plan = useMemo(() => elegir(planes, desdeVista, hastaVista), [planes, desdeVista, hastaVista]);
  const real = useMemo(() => elegir(reales, desdeVista, hastaVista), [reales, desdeVista, hastaVista]);
  const mesPrevioFuera = Boolean(datoDesde && shiftMonth(desde, -1).to < datoDesde);
  const diffs = useMemo(
    () => contarDiffs(boardPlan, boardReal),
    [boardPlan, boardReal],
  );
  const esMes = useMemo(() => {
    const b = monthBounds(desde);
    return b.from === desde && b.to === hasta;
  }, [desde, hasta]);

  const esIdeal = capa === 'plan';
  const licenciasActivas = useMemo(
    () => licencias.filter((l) => l.activo),
    [licencias],
  );
  const opcionesCodigo = useMemo(() => {
    const tm = movilesActivos.flatMap((m) =>
      SHIFTS.map((t) => ({
        grupo: 'Turno · móvil',
        valor: `TM:${t}${m}`,
        etiqueta: `${t}${m} · ${SHIFT_LABEL[t]} ${m}`,
      })),
    );
    const sit = [
      { grupo: 'Situación', valor: 'A:FERIADO', etiqueta: 'F · Franco' },
      { grupo: 'Situación', valor: 'A:VACACION', etiqueta: 'V · Vacaciones' },
      { grupo: 'Situación', valor: 'A:ENFERMEDAD', etiqueta: 'EF · Enfermedad' },
    ];
    const lic = licenciasActivas.map((l) => ({
      grupo: 'Códigos',
      valor: `L:${l.id}`,
      etiqueta: `${l.codigo} · ${l.horario || l.nombre}`,
    }));
    return [...tm, ...sit, ...lic];
  }, [movilesActivos, licenciasActivas]);
  const opcionesCodigoBuscar = useMemo(
    () =>
      opcionesCodigo.map((o) => ({
        id: o.valor,
        label: o.etiqueta,
        group: o.grupo,
        search: `${o.etiqueta} ${o.valor}`,
      })),
    [opcionesCodigo],
  );
  const filtros = useMemo<FiltrosGrilla>(
    () => ({
      inspectores: filtroInspectores,
      licencias: filtroLicencias,
      moviles: filtroMoviles,
      turnos: filtroTurnos,
    }),
    [filtroInspectores, filtroLicencias, filtroMoviles, filtroTurnos],
  );
  const inspectoresVista = useMemo(() => {
    const secs = new Set<string>(seccionesDePlanteles(planteles));
    return (inspectores ?? []).filter((p) => secs.has(p.seccion || 'MOVILES'));
  }, [inspectores, planteles]);
  const plantelOk =
    planteles.some(plantelListo) || Boolean(inspectores && inspectoresVista.length > 0);
  const opcionesInspectores = useMemo(
    () =>
      inspectoresVista.map((p) => {
        const nom = apellidoYNombre(p);
        const leg = (p.legajo || '').trim();
        const label = leg && !/^SV-GEN-/i.test(leg) ? `${leg} - ${nom}` : nom;
        return {
          id: p.id,
          label,
          search: [p.legajo, p.apellido, p.nombres, p.nombre_completo]
            .filter(Boolean)
            .join(' '),
        };
      }),
    [inspectoresVista],
  );
  const opcionesLicencias = useMemo(
    () =>
      licenciasActivas.map((l) => ({
        id: l.codigo,
        label: `${l.codigo} · ${l.horario || l.nombre}`,
        search: `${l.codigo} ${l.codigo_sap || ''} ${l.horario || l.nombre}`,
      })),
    [licenciasActivas],
  );
  const opcionesMoviles = useMemo(
    () =>
      [...movilesActivos]
        .sort((a, b) => a - b)
        .map((n) => ({ id: String(n), label: String(n) })),
    [movilesActivos],
  );
  const opcionesTurnos = useMemo(
    () => SHIFTS.map((s) => ({ id: s, label: SHIFT_LABEL[s] })),
    [],
  );
  const catalogoInspectores = useMemo(
    () => (inspectores ? new Set(inspectoresVista.map((i) => i.id)) : undefined),
    [inspectores, inspectoresVista],
  );
  const personasPorId = useMemo(
    () => new Map((inspectores ?? []).map((p) => [p.id, p])),
    [inspectores],
  );
  /** En Real, el ciclo de Ideal y encima los cambios. */
  const board = esIdeal ? boardPlan : fusionarReal(boardPlan, boardReal);
  const celdasRango = useMemo(() => {
    if (!seleccion) return [];
    const from = cbDesde || seleccion.dateFrom;
    const to = cbHasta || seleccion.dateTo;
    return celdasDelRango(
      board,
      seleccion.cell.inspector_id,
      from,
      to,
      { inspector: seleccion.cell.inspector, legajo: seleccion.cell.legajo },
    );
  }, [board, seleccion, cbDesde, cbHasta]);
  const cargando = esIdeal ? cargandoPlan : Boolean(real) ? cargandoReal : cargandoPlan;
  const versionExport = esIdeal ? plan : real ?? plan;

  const recargarVersiones = useCallback(async () => {
    const [p, r] = await Promise.all([
      api<Version[]>('/planning/versions?capa=PLANIFICADA'),
      api<Version[]>('/planning/versions?capa=REAL'),
    ]);
    setPlanes(p);
    setReales(r);
    return { planes: p, reales: r };
  }, []);

  useEffect(() => {
    let cancelado = false;
    void recargarVersiones()
      .catch((e) => {
        if (!cancelado) toast.push({ tone: 'error', message: mensaje(e) });
      })
      .finally(() => {
        if (!cancelado) setVersionesListas(true);
      });
    return () => {
      cancelado = true;
    };
  }, [recargarVersiones, toast.push]);

  const seqPlan = useRef(0);
  const seqReal = useRef(0);

  const cargarCapa = useCallback(
    async (capa: Capa, versionId: string | undefined) => {
      const setBoard = capa === 'PLANIFICADA' ? setBoardPlan : setBoardReal;
      const setRango = capa === 'PLANIFICADA' ? setRangoPlan : setRangoReal;
      const setCargando = capa === 'PLANIFICADA' ? setCargandoPlan : setCargandoReal;
      const seqRef = capa === 'PLANIFICADA' ? seqPlan : seqReal;
      const seq = ++seqRef.current;
      if (!versionId) {
        if (seq === seqRef.current) {
          setBoard(null);
          setRango(null);
          setCargando(false);
        }
        return;
      }
      setCargando(true);
      const from = desdeVista;
      const to = hastaVista;
      try {
        const q = new URLSearchParams({ date_from: from, date_to: to });
        const board = await api<BoardResponse>(`/planning/${versionId}/calendar?${q}`);
        if (seq !== seqRef.current) return;
        setBoard(board);
        setRango({ from, to });
      } catch (e) {
        if (seq !== seqRef.current) return;
        toast.push({ tone: 'error', message: mensaje(e) });
        setBoard(null);
        setRango(null);
      } finally {
        if (seq === seqRef.current) setCargando(false);
      }
    },
    [desdeVista, hastaVista, toast.push],
  );

  useEffect(() => {
    const h = window.setTimeout(() => {
      void cargarCapa('PLANIFICADA', plan?.id);
    }, 80);
    return () => window.clearTimeout(h);
  }, [cargarCapa, plan?.id]);

  useEffect(() => {
    const h = window.setTimeout(() => {
      void cargarCapa('REAL', real?.id);
    }, 80);
    return () => window.clearTimeout(h);
  }, [cargarCapa, real?.id]);

  useEffect(() => {
    function recargarCatalogos() {
      api<Inspector[]>('/operations/inspectors')
        .then(setInspectores)
        .catch(() => setInspectores([]));
      api<Licencia[]>('/operations/licencias')
        .then(setLicencias)
        .catch(() => setLicencias([]));
      api<Array<{ numero: number }>>('/operations/mobiles')
        .then((rows) => setMovilesActivos(rows.map((r) => r.numero)))
        .catch(() => setMovilesActivos([]));
      api<Array<{ id: string; nombre: string }>>('/operations/timer-motivos')
        .then(setMotivosCat)
        .catch(() => setMotivosCat([]));
    }
    recargarCatalogos();
    function onFocus() {
      recargarCatalogos();
    }
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, []);

  useEffect(() => {
    if (!datoDesde) return;
    if (hasta < datoDesde) {
      const b = monthBounds(datoDesde);
      setDesde(datoDesde);
      setHasta(b.to);
      return;
    }
    if (desde < datoDesde) setDesde(datoDesde);
  }, [datoDesde, desde, hasta]);

  useEffect(() => {
    if (!seleccion) return;
    if (seleccion.cell.inspector_id) setCbInspector(seleccion.cell.inspector_id);
    setCbDesde(seleccion.dateFrom);
    setCbHasta(seleccion.dateTo);
    if (cbCon && cbCon === (seleccion.cell.inspector_id || '')) setCbCon('');
  }, [seleccion]);

  function avisarSinDatosAntes() {
    if (!datoDesde) return;
    const msg = `No se disponen datos antes del ${isoToDmy(datoDesde)}.`;
    setAvisoAntes(msg);
    toast.warning(msg);
  }

  function aplicarRango(from: string, to: string) {
    if (!from || !to) return;
    let f = from;
    let t = to;
    if (datoDesde) {
      if (t < datoDesde) {
        const b = monthBounds(datoDesde);
        f = datoDesde;
        t = b.to;
        avisarSinDatosAntes();
      } else if (f < datoDesde) {
        f = datoDesde;
        avisarSinDatosAntes();
      } else {
        setAvisoAntes('');
      }
    }
    if (f > t) t = f;
    setDesde(f);
    setHasta(t);
    setSeleccion((prev) => {
      if (!prev) return prev;
      const df = prev.dateFrom < f ? f : prev.dateFrom;
      const dt = prev.dateTo > t ? t : prev.dateTo;
      if (df > dt) return null;
      return { ...prev, dateFrom: df, dateTo: dt, anchor: df, focus: dt };
    });
    // Si el Hasta supera lo ya generado, reintentar predicción automática
    setFalloHueco('');
    pedidoHuecoRef.current = '';
  }

  function seleccionar(cell: DayRow, date: string, opts?: { extend?: boolean }) {
    setSeleccion((prev) => {
      if (opts?.extend && prev) {
        if (rowKey(prev.cell) !== rowKey(cell)) return prev;
        const lo = prev.anchor <= date ? prev.anchor : date;
        const hi = prev.anchor <= date ? date : prev.anchor;
        return { cell, focus: date, anchor: prev.anchor, dateFrom: lo, dateTo: hi };
      }
      if (
        prev &&
        rowKey(prev.cell) === rowKey(cell) &&
        prev.focus === date
      ) {
        return null;
      }
      return { cell, focus: date, anchor: date, dateFrom: date, dateTo: date };
    });
  }

  function setRangoForm(from: string, to: string) {
    if (!from && !to) {
      setCbDesde('');
      setCbHasta('');
      return;
    }
    let f = from && to ? (from <= to ? from : to) : from || to;
    let t = from && to ? (from <= to ? to : from) : from || to;
    if (datoDesde && f < datoDesde) {
      f = datoDesde;
      avisarSinDatosAntes();
    }
    setCbDesde(f);
    setCbHasta(t);
    setSeleccion((prev) => {
      if (!prev) return prev;
      return { ...prev, dateFrom: f, dateTo: t, anchor: f, focus: t };
    });
    setDesde((d) => (f && f < d ? f : d));
    setHasta((h) => (t && t > h ? t : h));
  }

  function setConsolaAbierta(abierta: boolean) {
    setConsola(abierta);
    localStorage.setItem('cuad-consola', abierta ? '1' : '0');
  }

  const capaAncho: Vista = capa;
  const sideW = anchosSide[capaAncho];

  function topeAnchoConsola() {
    const w = workRef.current?.clientWidth ?? 0;
    if (w < 480) return CONSOLA_W_MAX;
    return Math.min(CONSOLA_W_MAX, Math.max(CONSOLA_W_MIN, Math.floor(w * 0.5)));
  }

  function setSideW(n: number) {
    setAnchosSide((a) => ({ ...a, [capaAncho]: n }));
  }

  useEffect(() => {
    localStorage.setItem(CONSOLA_W_KEY[capaAncho], String(sideW));
  }, [capaAncho, sideW]);

  useEffect(() => {
    function encajar() {
      const cap = topeAnchoConsola();
      setAnchosSide((a) => ({
        plan: clampConsolaW(a.plan, cap),
        real: clampConsolaW(a.real, cap),
      }));
    }
    window.addEventListener('resize', encajar);
    encajar();
    return () => window.removeEventListener('resize', encajar);
  }, []);

  function beginSideResize(e: MouseEvent<HTMLSpanElement>) {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const start = sideW;
    const capaDrag = capaAncho;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    const move = (ev: globalThis.MouseEvent) => {
      const next = clampConsolaW(start + (startX - ev.clientX), topeAnchoConsola());
      setAnchosSide((a) => ({ ...a, [capaDrag]: next }));
    };
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  }

  function setAmbito(id: AmbitoId) {
    setParams(
      (prev) => {
        const n = new URLSearchParams(prev);
        n.set('ambito', id);
        n.set('plantel', plantelPorDefecto(id, permitidos));
        return n;
      },
      { replace: true },
    );
    setSeleccion(null);
  }

  function setPlanteles(ids: PlantelId[]) {
    const next = ids.length ? ids : [plantelPorDefecto(ambito, permitidos)];
    setParams(
      (prev) => {
        const n = new URLSearchParams(prev);
        n.set('plantel', next.join(','));
        n.set('ambito', ambito);
        return n;
      },
      { replace: true },
    );
    setFiltroInspectores([]);
    setSeleccion(null);
  }

  function setVista(v: Vista) {
    setParams(
      (prev) => {
        const n = new URLSearchParams(prev);
        n.set('vista', v === 'real' ? 'real' : 'ideal');
        return n;
      },
      { replace: true },
    );
    setSeleccion(null);
  }

  function irMes(delta: number) {
    if (delta < 0 && mesPrevioFuera) {
      avisarSinDatosAntes();
      return;
    }
    const b = shiftMonth(desde, delta);
    aplicarRango(b.from, b.to);
  }

  const inferirRango = useCallback(
    async (genFrom: string, genTo: string, vistaFrom?: string, vistaTo?: string) => {
      if (genFrom > genTo) {
        toast.push({
          tone: 'error',
          message: 'La fecha de inicio debe ser anterior o igual al fin.',
        });
        return;
      }
      const vf = vistaFrom ?? desdeVista;
      const vt = vistaTo ?? hastaVista;
      setOcupado(`Armando el ciclo ${etiquetaRango(genFrom, genTo)}…`);
      try {
        await api('/schedule-engine/apply', {
          method: 'POST',
          body: JSON.stringify({ date_from: genFrom, date_to: genTo }),
        });
        await api('/schedule-engine/apply-real', {
          method: 'POST',
          body: JSON.stringify({ date_from: genFrom, date_to: genTo }),
        });
        setCasosManuales([]);
        setFalloHueco('');
        const { planes: p, reales: r } = await recargarVersiones();
        await Promise.all([
          cargarCapa('PLANIFICADA', elegir(p, vf, vt)?.id),
          cargarCapa('REAL', elegir(r, vf, vt)?.id),
        ]);
        toast.push({
          tone: 'success',
          message: `Ciclo armado ${etiquetaRango(genFrom, genTo)}.`,
        });
      } catch (err) {
        const cuerpo =
          err instanceof ApiError
            ? (err.body as { casos_a_resolver?: CasoSinDestino[] } | undefined)
            : undefined;
        if (cuerpo?.casos_a_resolver?.length) {
          setCasosManuales(cuerpo.casos_a_resolver);
        }
        toast.push({ tone: 'error', message: mensaje(err) });
        throw err;
      } finally {
        setOcupado(null);
      }
    },
    [cargarCapa, desdeVista, hastaVista, recargarVersiones, toast],
  );

  useEffect(() => {
    if (!puedePlanificar) return;
    if (!hueco || ocupado) return;
    const key = `${hueco.from}:${hueco.to}`;
    if (falloHueco === key || pedidoHuecoRef.current === key) return;
    pedidoHuecoRef.current = key;
    void inferirRango(hueco.from, hueco.to, desdeVista, hastaVista).catch(() => {
      pedidoHuecoRef.current = '';
      setFalloHueco(key);
    });
  }, [puedePlanificar, hueco, ocupado, falloHueco, inferirRango, desdeVista, hastaVista]);

  async function recargarReal() {
    const { reales: r } = await recargarVersiones();
    await cargarCapa('REAL', elegir(r, desdeVista, hastaVista)?.id);
  }

  function diasCambio() {
    if (!cbDesde || !cbHasta || cbDesde > cbHasta) return 0;
    return (
      Math.round(
        (Date.parse(`${cbHasta}T12:00:00Z`) - Date.parse(`${cbDesde}T12:00:00Z`)) /
          86_400_000,
      ) + 1
    );
  }

  function validarCambio(): string | null {
    if (esIdeal) return 'La ideal es solo consulta.';
    if (!cbInspector) return `Elegí un ${personaRol.toLowerCase()}.`;
    if (!cbDesde || !cbHasta || cbDesde > cbHasta) return 'Revisá el rango de fechas.';
    if (cbTipo === 'ENROQUE') {
      if (!cbCon) return 'Elegí con quién se enroca.';
      if (cbCon === cbInspector) return 'El enroque es entre dos inspectores distintos.';
      return null;
    }
    const parsed = parseCodigo(cbCodigo);
    if (!parsed) return 'Elegí el código.';
    if (parsed.kind === 'LICENCIA' && !parsed.licenciaId) return 'Elegí el código de ausentismo.';
    if (parsed.mobile != null && !movilesActivos.includes(parsed.mobile)) {
      return 'Ese móvil no está en Administración. Elegí uno del catálogo.';
    }
    return null;
  }

  function reasonOperativo() {
    const m = cbMotivo.trim();
    const o = cbObservacion.trim();
    if (!m && !o) return undefined;
    return `${m} · ${o}`;
  }

  function pedirCambio(e: FormEvent) {
    e.preventDefault();
    const err = validarCambio();
    if (err) {
      toast.push({ tone: 'error', message: err });
      return;
    }
    setConfirmKind('cambio');
  }

  function nombresAlcance(ids: string[]) {
    const etiquetas = ids.map((id) =>
      apellidoYNombre(
        (inspectores ?? []).find((p) => p.id === id) ?? { nombre_completo: '—' },
      ),
    );
    if (etiquetas.length <= 3) return etiquetas.join(', ');
    return `${etiquetas.slice(0, 2).join(', ')} y ${etiquetas.length - 2} más`;
  }

  function personasVolverIdeal() {
    if (cbInspector) return [cbInspector];
    return filtroInspectores;
  }

  function resolverVolverIdeal(): AlcanceIdeal | { error: string } {
    const ids = personasVolverIdeal();
    const hayPersonas = ids.length > 0;
    const hayFechas = Boolean(cbDesde && cbHasta && cbDesde <= cbHasta);
    if (!hayPersonas && !hayFechas) {
      return { error: 'Elegí persona(s) o fechas.' };
    }
    if (hayPersonas && hayFechas) {
      const dias =
        Math.round(
          (Date.parse(`${cbHasta}T12:00:00Z`) - Date.parse(`${cbDesde}T12:00:00Z`)) /
            86_400_000,
        ) + 1;
      return {
        kind: 'seleccion',
        inspectorIds: ids,
        dateFrom: cbDesde,
        dateTo: cbHasta,
        mensaje: `Vas a volver a Ideal ${nombresAlcance(ids)} del ${isoToDmy(cbDesde)} al ${isoToDmy(cbHasta)} (${dias} día${dias === 1 ? '' : 's'}). Se borra lo de Real; esos días quedan como en Ideal.`,
      };
    }
    if (hayPersonas) {
      return {
        kind: 'filas',
        inspectorIds: ids,
        dateFrom: desdeVista,
        dateTo: hastaVista,
        mensaje: `Vas a volver a Ideal las filas de ${nombresAlcance(ids)} en lo visible (${isoToDmy(desdeVista)} → ${isoToDmy(hastaVista)}). Se borra lo de Real; esos días quedan como en Ideal.`,
      };
    }
    return {
      kind: 'columnas',
      inspectorIds: null,
      dateFrom: cbDesde,
      dateTo: cbHasta,
      mensaje: `Vas a volver a Ideal las columnas del ${isoToDmy(cbDesde)} al ${isoToDmy(cbHasta)} (todas las personas). Se borra lo de Real; esos días quedan como en Ideal.`,
    };
  }

  function pedirVolverIdeal() {
    if (esIdeal) return;
    const r = resolverVolverIdeal();
    if ('error' in r) {
      toast.push({ tone: 'error', message: r.error });
      return;
    }
    setIdealPendiente(r);
    setConfirmKind('ideal');
  }

  async function ejecutarVolverIdeal(alcance?: AlcanceIdeal | null) {
    const r = alcance ?? idealPendiente;
    if (!r) return false;
    const dias =
      Math.round(
        (Date.parse(`${r.dateTo}T12:00:00Z`) - Date.parse(`${r.dateFrom}T12:00:00Z`)) /
          86_400_000,
      ) + 1;
    const quien = r.inspectorIds ? nombresAlcance(r.inspectorIds) : 'todos';
    setOcupado(`Volviendo a Ideal ${dias} día(s)…`);
    try {
      let cleared = 0;
      let restored = 0;
      const ids = r.inspectorIds;
      if (!ids) {
        const res = await api<{ cleared: number; restored?: number }>(
          '/schedule-engine/clear-range',
          {
            method: 'POST',
            body: JSON.stringify({
              date_from: r.dateFrom,
              date_to: r.dateTo,
              reason: reasonOperativo(),
              rematerialize: true,
            }),
          },
        );
        cleared = res.cleared;
        restored = res.restored ?? 0;
      } else {
        for (let i = 0; i < ids.length; i++) {
          const res = await api<{ cleared: number; restored?: number }>(
            '/schedule-engine/clear-range',
            {
              method: 'POST',
              body: JSON.stringify({
                inspector_id: ids[i],
                date_from: r.dateFrom,
                date_to: r.dateTo,
                reason: reasonOperativo(),
                rematerialize: true,
              }),
            },
          );
          cleared += res.cleared;
          restored += res.restored ?? 0;
        }
      }
      await recargarReal();
      toast.push({
        tone: 'success',
        message:
          restored || cleared
            ? `Real volvió a Ideal · ${quien} · ${dias} día(s).`
            : `Nada que volver en ese rango · ${quien}.`,
      });
      return true;
    } catch (err) {
      toast.push({ tone: 'error', message: mensaje(err) });
      return false;
    } finally {
      setOcupado(null);
    }
  }

  async function ejecutarCambio() {
    const err = validarCambio();
    if (err) {
      toast.push({ tone: 'error', message: err });
      return;
    }
    const dias = diasCambio();
    if (cbTipo === 'ENROQUE') {
      setOcupado(`Enrocando ${dias} día(s)…`);
      try {
        await api('/schedule-engine/swap', {
          method: 'POST',
          body: JSON.stringify({
            inspector_a_id: cbInspector,
            inspector_b_id: cbCon,
            date_from: cbDesde,
            date_to: cbHasta,
            reason: reasonOperativo(),
            rematerialize: true,
          }),
        });
        setSeleccion(null);
        setCbMotivo('');
        setCbObservacion('');
        await recargarReal();
        toast.push({
          tone: 'success',
          message: `Enroque en la real · ${dias} día(s). La ideal no se tocó.`,
        });
      } catch (err2) {
        toast.push({ tone: 'error', message: mensaje(err2) });
      } finally {
        setOcupado(null);
      }
      return;
    }

    const parsed = parseCodigo(cbCodigo);
    if (!parsed) return;
    setOcupado(`Registrando ${dias} día(s)…`);
    try {
      if (parsed.shift) {
        await api('/schedule-engine/assignment', {
          method: 'POST',
          body: JSON.stringify({
            inspector_id: cbInspector,
            date_from: cbDesde,
            date_to: cbHasta,
            shift: parsed.shift,
            mobile: parsed.mobile,
            reason: reasonOperativo(),
            rematerialize: true,
          }),
        });
      } else {
        await api('/schedule-engine/absence', {
          method: 'POST',
          body: JSON.stringify({
            inspector_id: cbInspector,
            date_from: cbDesde,
            date_to: cbHasta,
            kind: parsed.kind,
            reason: reasonOperativo(),
            ...(parsed.licenciaId ? { catalogo_licencia_id: parsed.licenciaId } : {}),
            rematerialize: true,
          }),
        });
      }
      setSeleccion(null);
      setCbMotivo('');
      setCbObservacion('');
      await recargarReal();
      toast.push({
        tone: 'success',
        message: `Registrado en la real · ${dias} día(s). La ideal no se tocó.`,
      });
    } catch (err2) {
      toast.push({ tone: 'error', message: mensaje(err2) });
    } finally {
      setOcupado(null);
    }
  }

  const hayFiltrosExport =
    filtroInspectores.length > 0 ||
    filtroLicencias.length > 0 ||
    filtroMoviles.length > 0 ||
    filtroTurnos.length > 0;

  const resumenFiltrosExport = [
    filtroLicencias.length ? `Códigos ${filtroLicencias.join(', ')}` : '',
    filtroMoviles.length ? `Móviles ${filtroMoviles.join(', ')}` : '',
    filtroTurnos.length ? `Turnos ${filtroTurnos.join(', ')}` : '',
    filtroInspectores.length
      ? `${filtroInspectores.length} inspector${filtroInspectores.length === 1 ? '' : 'es'}`
      : '',
  ].filter(Boolean);

  function pedirExportar(pack: Pack) {
    if (!versionExport) {
      toast.push({ tone: 'error', message: 'No hay cuadratura para exportar.' });
      return;
    }
    if (hayFiltrosExport) {
      setExportPendiente(pack);
      return;
    }
    void exportar(pack, false);
  }

  async function exportar(pack: Pack, conFiltros: boolean) {
    if (!versionExport) {
      toast.push({ tone: 'error', message: 'No hay cuadratura para exportar.' });
      return;
    }
    setExportPendiente(null);
    setOcupado('Armando el Excel…');
    try {
      const base = import.meta.env.VITE_API_URL || '/api';
      const q = new URLSearchParams({ pack });
      if (desdeVista) q.set('from', desdeVista);
      if (hastaVista) q.set('to', hastaVista);
      const secciones = seccionesDePlanteles(planteles);
      if (secciones.length) q.set('secciones', secciones.join(','));
      if (conFiltros) {
        if (filtroInspectores.length) q.set('inspectores', filtroInspectores.join(','));
        if (filtroLicencias.length) q.set('codigos', filtroLicencias.join(','));
        if (filtroMoviles.length) q.set('moviles', filtroMoviles.join(','));
        if (filtroTurnos.length) q.set('turnos', filtroTurnos.join(','));
      }
      const res = await fetch(
        `${base}/exports/version/${versionExport.id}.xlsx?${q}`,
        {
          headers: { Authorization: `Bearer ${localStorage.getItem('sv_token') ?? ''}` },
        },
      );
      if (!res.ok) throw new Error('No se pudo generar el archivo');
      const blob = await res.blob();
      const nombre =
        res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] ??
        `${pack === 'planillas' ? 'Planillas' : 'Cuadratura'}.xlsx`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = nombre;
      a.click();
      URL.revokeObjectURL(url);
      toast.push({
        tone: 'success',
        message: conFiltros ? `Descargado con filtros: ${nombre}` : `Descargado: ${nombre}`,
      });
    } catch (e) {
      toast.push({ tone: 'error', message: mensaje(e) });
    } finally {
      setOcupado(null);
    }
  }

  const fechas = useMemo(() => {
    // Mientras llega el calendar nuevo, se mantienen las columnas del tablero
    // actual: evita celdas vacías / parpadeo al cambiar Desde–Hasta.
    const r = esIdeal ? rangoPlan : rangoReal;
    const loading = esIdeal ? cargandoPlan : cargandoReal;
    if (loading && r) return eachDate(r.from, r.to);
    return eachDate(desdeVista, hastaVista);
  }, [esIdeal, rangoPlan, rangoReal, cargandoPlan, cargandoReal, desdeVista, hastaVista]);
  // Versión con período “cubierto” pero sin filas en el rango visible = vacío real.
  const hayCiclo = Boolean(boardPlan?.days?.length);
  const asideVisible = consola;
  const diasForm = diasCambio();
  const accionForm = cbTipo === 'ENROQUE' ? 'Enrocar' : 'Aplicar';
  const personaA = (inspectores ?? []).find((p) => p.id === cbInspector);
  const personaB = (inspectores ?? []).find((p) => p.id === cbCon);
  const codigoA = useMemo(() => {
    if (!cbInspector || !cbDesde || !board) return '';
    const d = board.days.find(
      (x) => x.inspector_id === cbInspector && toDateOnly(x.fecha_operativa) === cbDesde,
    );
    return d ? cellShortLabel(d) : '';
  }, [board, cbInspector, cbDesde]);
  const codigoB = useMemo(() => {
    if (!cbCon || !cbDesde || !board) return '';
    const d = board.days.find(
      (x) => x.inspector_id === cbCon && toDateOnly(x.fecha_operativa) === cbDesde,
    );
    return d ? cellShortLabel(d) : '';
  }, [board, cbCon, cbDesde]);

  return (
    <div className="stack cuad-page">
      {casosManuales.length > 0 && (
        <section className="cuad-aviso" role="alert">
          <div className="cuad-aviso-head">
            <strong>
              {casosManuales.length} caso{casosManuales.length > 1 ? 's' : ''} para
              resolver a mano
            </strong>
            <button
              type="button"
              className="btn sm"
              onClick={() => setCasosManuales([])}
            >
              Cerrar
            </button>
          </div>
          <p>
            Tres inspectores coinciden en el mismo móvil y turno, y los otros
            móviles con la misma hora de entrada ya están completos. No se movió a
            nadie: hacerlo le cambiaría el horario de entrada a la persona.
          </p>
          <table className="cuad-aviso-tabla">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Turno</th>
                <th>Móvil</th>
                <th>Entrada</th>
                <th>Los tres inspectores</th>
              </tr>
            </thead>
            <tbody>
              {casosManuales.map((c, i) => (
                <tr key={`${c.fecha}-${c.movil}-${c.turno}-${i}`}>
                  <td>{isoToDmy(c.fecha)}</td>
                  <td>{c.turno_texto}</td>
                  <td>{c.movil}</td>
                  <td>{c.hora_entrada ?? '—'}</td>
                  <td>{c.inspectores.join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="cuad-aviso-pie">
            Resolvelos moviendo a uno con «Cambio de turno / móvil», y volvé a
            generar.
          </p>
        </section>
      )}

      <header className="cuad-head">
        <div className="cuad-head-top">
          <div className="cuad-head-brand">
            <h1>Cuadratura</h1>
            <p className="cuad-head-kicker">{plantelLabel}</p>
          </div>
          <PlantelSwitch
            ambito={ambito}
            planteles={planteles}
            onAmbito={setAmbito}
            onPlanteles={setPlanteles}
            permitidos={permitidos}
            ambitos={ambitosOk}
          >
            <div className="cuad-vista" role="tablist" aria-label="Capa">
              <button
                type="button"
                role="tab"
                aria-selected={esIdeal}
                className={esIdeal ? 'active' : undefined}
                onClick={() => setVista('plan')}
              >
                Ideal
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={!esIdeal}
                className={esIdeal ? undefined : 'active real'}
                onClick={() => setVista('real')}
              >
                Real
              </button>
            </div>
          </PlantelSwitch>
        </div>
        <form
          className="cuad-workbar"
          onSubmit={(e) => {
            e.preventDefault();
          }}
        >
          <div className="cuad-period" role="group" aria-label="Período">
            <div className="cuad-month" role="group" aria-label="Mes">
              <button
                type="button"
                className="btn secondary sm"
                title={
                  mesPrevioFuera && datoDesde
                    ? `No se disponen datos antes del ${isoToDmy(datoDesde)}`
                    : 'Mes anterior'
                }
                onClick={() => irMes(-1)}
              >
                ‹
              </button>
              <strong>
                {esMes ? monthLabel(desde) : `${isoToDmy(desde)} → ${isoToDmy(hasta)}`}
              </strong>
              <button type="button" className="btn secondary sm" onClick={() => irMes(1)}>
                ›
              </button>
            </div>
            <div className="cuad-range" role="group" aria-label="Desde y hasta">
              <DateField
                id="cuad-desde"
                aria-label="Desde"
                value={desde}
                onChange={(v) => aplicarRango(v, hasta)}
              />
              <span className="cuad-range-sep" aria-hidden>
                –
              </span>
              <DateField
                id="cuad-hasta"
                aria-label="Hasta"
                value={hasta}
                onChange={(v) => aplicarRango(desde, v)}
              />
            </div>
            <DateRangePresets
              from={desde}
              to={hasta}
              onApply={aplicarRango}
              compact
              include={['this-week', 'this-month', 'next-month']}
            />
          </div>
          <div className="cuad-workbar-sep" aria-hidden />
          <div className="cuad-filters">
            <FilterPicker
              id="cuad-insp"
              aria-label={personasLabel}
              summaryLabel={personasLabel}
              options={opcionesInspectores}
              values={filtroInspectores}
              onChange={setFiltroInspectores}
              allLabel="Todos"
              placeholder="Buscar legajo, apellido o nombre…"
            />
            <FilterPicker
              id="cuad-lic"
              aria-label="Códigos"
              summaryLabel="Códigos"
              options={opcionesLicencias}
              values={filtroLicencias}
              onChange={setFiltroLicencias}
              allLabel="Todos"
              placeholder="Buscar código…"
            />
            <FilterPicker
              id="cuad-mov"
              aria-label="Móviles"
              summaryLabel="Móviles"
              options={opcionesMoviles}
              values={filtroMoviles}
              onChange={setFiltroMoviles}
              allLabel="Todos"
              variant="pills"
            />
            <FilterPicker
              id="cuad-tur"
              aria-label="Turnos"
              summaryLabel="Turnos"
              options={opcionesTurnos}
              values={filtroTurnos}
              onChange={setFiltroTurnos}
              allLabel="Todos"
              variant="pills"
            />
            {!esIdeal ? (
              <label className="cuad-filter-check">
                <input
                  type="checkbox"
                  checked={soloCambios}
                  onChange={(e) => setSoloCambios(e.target.checked)}
                />
                Cambios{diffs ? ` (${diffs})` : ''}
              </label>
            ) : null}
          </div>
          {avisoAntes ? (
            <p className="cuad-aviso" role="status">
              {avisoAntes}
            </p>
          ) : null}
          {ocupado ? (
            <p className="cuad-busy" role="status">
              {ocupado}
            </p>
          ) : null}
        </form>
      </header>

      {sinAlcance ? (
        <EmptyState
          title="Sin secciones"
          description="Pedile a un administrador que te asigne las secciones que podés ver."
        />
      ) : !plantelOk ? (
        <EmptyState
          title={`${plantelLabel} próximamente`}
          description="Este plantel se habilita cuando estén cargados sus códigos y personas."
        />
      ) : (
      <>
      {!hayCiclo && !cargando && !ocupado ? (
        <EmptyState
          title={
            esIdeal
              ? 'Todavía no hay ciclo en este período'
              : 'Todavía no hay ciclo para mostrar'
          }
          description={
            falloHueco
              ? 'No se pudo armar el ciclo. Revisá el mensaje y reintentá.'
              : esIdeal
                ? 'Elegí Desde / Hasta. Si el período no tiene ciclo, se arma solo.'
                : 'Primero tiene que existir el ciclo en Ideal. Después las situaciones que registres acá arman la real.'
          }
          action={
            falloHueco ? (
              <button
                type="button"
                className="btn primary"
                onClick={() => {
                  pedidoHuecoRef.current = '';
                  setFalloHueco('');
                }}
              >
                Reintentar
              </button>
            ) : !esIdeal ? (
              <button
                type="button"
                className="btn primary"
                onClick={() => setVista('plan')}
              >
                Ir a Ideal
              </button>
            ) : undefined
          }
        />
      ) : (
        <section className={`panel cuad-layer is-${esIdeal ? 'plan' : 'real'}`}>
          <ul className="cuad-legend" aria-label="Leyenda">
            {leyendaBoxes.map((item) => (
              <li key={item.id}>
                <span
                  className="cuad-swatch"
                  style={{ background: item.bg, color: item.fg, borderColor: item.fg }}
                />
                {item.label}
              </li>
            ))}
            {!esIdeal && diffs > 0 && (
              <li>
                <span className="cuad-swatch differs" />
                Distinto de la ideal
              </li>
            )}
            <li className="cuad-legend-action">
              <ExcelMenu
                busy={ocupado === 'Armando el Excel…'}
                disabled={!!ocupado || !versionExport}
                items={[
                  {
                    id: 'cuadratura',
                    label: 'Cuadratura',
                    hint: 'Grilla inspector × día',
                  },
                  {
                    id: 'planillas',
                    label: 'Planillas',
                    hint: 'Una hoja por móvil',
                  },
                ]}
                onPick={(id) => pedirExportar(id as Pack)}
              />
              {!consola ? (
                <button
                  type="button"
                  className="btn secondary sm"
                  onClick={() => setConsolaAbierta(true)}
                >
                  Mostrar detalle
                </button>
              ) : null}
            </li>
          </ul>
          <div
            ref={workRef}
            className={`cuad-work${asideVisible ? (esIdeal ? ' is-consulta' : '') : ' is-solo'}`}
            style={
              asideVisible
                ? ({ '--cuad-side-w': `${sideW}px` } as CSSProperties)
                : undefined
            }
          >
            <div className="cuad-layer-main">
          <Grilla
            board={board}
            fechas={fechas}
            hoy={hoy}
            filtros={filtros}
            catalogo={catalogoInspectores}
            personas={personasPorId}
            mostrarSeccion={mostrarSeccion}
            cargando={cargando}
            vacio={
              inspectores && inspectoresVista.length === 0
                ? 'No hay personas en las cuadraturas elegidas. Incorporalas en Administración o sumá otra cuadratura.'
                : !board?.days?.length
                  ? esIdeal
                    ? 'Todavía no hay ciclo en este período.'
                    : 'Todavía no hay ciclo real en este período.'
                  : 'Nadie coincide con los filtros elegidos.'
            }
            seleccion={seleccion}
            contra={esIdeal ? null : boardPlan}
            soloCambios={!esIdeal && soloCambios}
            onSelect={seleccionar}
            cubiertoHasta={cubiertoHasta || undefined}
          />
            </div>
            {asideVisible ? (
              <span
                className="cuad-side-resizer"
                role="separator"
                aria-orientation="vertical"
                aria-label={esIdeal ? 'Ancho del detalle' : 'Ancho de la consola'}
                title="Arrastrá para agrandar o achicar. Doble clic restaura el tamaño."
                onMouseDown={beginSideResize}
                onDoubleClick={() =>
                  setSideW(clampConsolaW(CONSOLA_W_DEF[capaAncho], topeAnchoConsola()))
                }
              />
            ) : null}
            {asideVisible ? (
            <aside className={`cuad-side${esIdeal ? ' is-consulta' : ''}${seleccion ? '' : ' is-empty'}`} aria-label={esIdeal ? 'Detalle de la celda' : 'Consola de la celda'}>
              <div className="cuad-side-head">
                <strong>{esIdeal ? 'Detalle' : 'Consola'}</strong>
                <button
                  type="button"
                  className="btn secondary sm"
                  onClick={() => setConsolaAbierta(false)}
                >
                  Ocultar
                </button>
              </div>
              {seleccion ? (
                <DayDetailPanel
                  embedded
                  cell={seleccion.cell}
                  dateFrom={!esIdeal && cbDesde ? cbDesde : seleccion.dateFrom}
                  dateTo={!esIdeal && cbHasta ? cbHasta : seleccion.dateTo}
                  rango={celdasRango}
                  editable={false}
                  busy={!!ocupado}
                  onClose={() => setSeleccion(null)}
                />
              ) : null}
              {!esIdeal && !puedeEditar ? (
                <p className="muted">Solo lectura. Este tipo no edita el Real.</p>
              ) : null}
              {!esIdeal && puedeEditar ? (
                    <form className="cuad-change" onSubmit={pedirCambio}>
                      {diasForm > 0 ? (
                      <p className="cuad-side-range">
                        Se aplica a <strong>{diasForm}</strong> día
                        {diasForm === 1 ? '' : 's'}.
                      </p>
                      ) : null}
                      <div className="field">
                        <span className="cuad-side-label" id="cb-tipo-label">Qué es</span>
                        <div
                          className="plantel-switch cuad-change-switch"
                          role="tablist"
                          aria-labelledby="cb-tipo-label"
                        >
                          {TIPOS_CAMBIO.map((t) => (
                            <button
                              key={t.valor}
                              type="button"
                              role="tab"
                              aria-selected={cbTipo === t.valor}
                              className={cbTipo === t.valor ? 'active' : undefined}
                              onClick={() => setCbTipo(t.valor)}
                            >
                              {t.etiqueta}
                            </button>
                          ))}
                        </div>
                      </div>
                      {cbTipo === 'ENROQUE' ? (
                        <>
                          <div className="field">
                            <label htmlFor="cb-insp">Este</label>
                            <PeoplePicker
                              id="cb-insp"
                              people={inspectoresVista}
                              value={cbInspector}
                              allowClear
                              onChange={(id) => {
                                setCbInspector(id);
                                if (id === cbCon) setCbCon('');
                              }}
                              placeholder="Buscar legajo, apellido o nombre…"
                            />
                          </div>
                          <div className="field">
                            <label htmlFor="cb-con">Con</label>
                            <PeoplePicker
                              id="cb-con"
                              people={inspectoresVista.filter((p) => p.id !== cbInspector)}
                              value={cbCon}
                              allowClear
                              onChange={setCbCon}
                              placeholder="Con quién se enroca…"
                            />
                          </div>
                          {cbInspector ? (
                            <p className="cuad-enroque-par">
                              {apellidoYNombre(personaA ?? { nombre_completo: '—' })}
                              {codigoA ? ` ${codigoA}` : ''}
                              {' ↔ '}
                              {cbCon
                                ? `${apellidoYNombre(personaB ?? { nombre_completo: '—' })}${codigoB ? ` ${codigoB}` : ''}`
                                : '…'}
                            </p>
                          ) : null}
                        </>
                      ) : (
                        <>
                          <div className="field">
                            <label htmlFor="cb-insp">{personaRol}</label>
                            <PeoplePicker
                              id="cb-insp"
                              people={inspectoresVista}
                              value={cbInspector}
                              allowClear
                              onChange={setCbInspector}
                              placeholder={`Buscar ${personaRol.toLowerCase()}, legajo o apellido…`}
                            />
                          </div>
                          <div className="field">
                            <label htmlFor="cb-cod">Código</label>
                            <SearchSelect
                              id="cb-cod"
                              options={opcionesCodigoBuscar}
                              value={cbCodigo}
                              onChange={setCbCodigo}
                              placeholder="Buscar código…"
                              emptyLabel="Ningún código coincide"
                            />
                          </div>
                        </>
                      )}
                      <p className="cuad-side-period-hint">
                        Persona sin fechas = filas · Fechas sin persona = columnas. Shift+clic o
                        arrastre para un rango.
                      </p>
                      <div className="cuad-side-dates">
                        <div className="field">
                          <label htmlFor="cb-desde">Desde</label>
                          <DateField
                            id="cb-desde"
                            aria-label="Desde"
                            allowClear
                            value={cbDesde}
                            onChange={(v) => (v ? setRangoForm(v, cbHasta || v) : setRangoForm('', ''))}
                          />
                        </div>
                        <div className="field">
                          <label htmlFor="cb-hasta">Hasta</label>
                          <DateField
                            id="cb-hasta"
                            aria-label="Hasta"
                            allowClear
                            value={cbHasta}
                            onChange={(v) => (v ? setRangoForm(cbDesde || v, v) : setRangoForm('', ''))}
                          />
                        </div>
                      </div>
                      <div className="field">
                        <label htmlFor="cb-motivo">Motivo</label>
                        <SearchSelect
                          id="cb-motivo"
                          options={motivosCat.map((m) => ({
                            id: m.nombre,
                            label: m.nombre,
                          }))}
                          value={cbMotivo}
                          onChange={setCbMotivo}
                          allowClear
                          placeholder="Elegí un motivo…"
                          emptyLabel="Ningún motivo coincide"
                        />
                      </div>
                      <div className="field">
                        <label htmlFor="cb-obs">Observaciones</label>
                        <textarea
                          id="cb-obs"
                          rows={2}
                          placeholder="Opcional"
                          value={cbObservacion}
                          onChange={(e) => setCbObservacion(e.target.value)}
                        />
                      </div>
                      <div className="cuad-change-actions">
                        <button
                          type="button"
                          className="btn secondary sm"
                          disabled={
                            !!ocupado ||
                            (!cbInspector &&
                              filtroInspectores.length === 0 &&
                              (!cbDesde || !cbHasta))
                          }
                          onClick={pedirVolverIdeal}
                        >
                          Volver a Ideal
                        </button>
                        <button
                          type="submit"
                          className="btn primary sm"
                          disabled={!!ocupado || !!validarCambio()}
                        >
                          {ocupado
                            ? ocupado
                            : `${accionForm}${diasForm ? ` ${diasForm} día${diasForm === 1 ? '' : 's'}` : ''}`}
                        </button>
                      </div>
                    </form>
              ) : null}
            </aside>
            ) : null}
          </div>
        </section>
      )}

      <OcupacionPackProvider from={desdeVista} to={hastaVista} enabled>
        <div className="cuad-paneles">
          {paneles
            .filter((p) => p.visible && (p.id !== 'timer' || !esIdeal))
            .map((p) => (
              <div key={p.id} className="cuad-paneles-item">
                {p.id === 'timer' ? (
                  <TimerBoard
                    from={desdeVista}
                    to={hastaVista}
                    plan={boardPlan}
                    real={boardReal}
                    people={inspectoresVista}
                  />
                ) : (
                  <OcupacionBoard
                    from={desdeVista}
                    to={hastaVista}
                    enabled
                    parte={p.id === 'ocupacion' ? 'ocupacion' : 'desdobles'}
                    filtros={filtros}
                    board={board}
                    people={inspectoresVista}
                    catalogo={catalogoInspectores}
                    moviles={movilesActivos}
                    licencias={licencias}
                    esIdeal={esIdeal}
                  />
                )}
              </div>
            ))}
        </div>
      </OcupacionPackProvider>
      </>
      )}

      <Modal
        open={Boolean(exportPendiente)}
        onClose={() => setExportPendiente(null)}
        title={exportPendiente === 'planillas' ? 'Excel de planillas' : 'Excel de la cuadratura'}
        description="Hay filtros aplicados. ¿Querés el Excel solo con eso, o todo el período?"
        size="sm"
        footer={
          <>
            <button
              type="button"
              className="btn secondary"
              onClick={() => setExportPendiente(null)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn secondary"
              onClick={() => exportPendiente && void exportar(exportPendiente, false)}
            >
              Todo
            </button>
            <button
              type="button"
              className="btn primary"
              onClick={() => exportPendiente && void exportar(exportPendiente, true)}
            >
              Con filtros
            </button>
          </>
        }
      >
        {resumenFiltrosExport.length ? (
          <p>{resumenFiltrosExport.join(' · ')}</p>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={confirmKind === 'cambio'}
        title="Confirmar cambio"
        message={
          cbTipo === 'ENROQUE'
            ? `Vas a enrocar ${apellidoYNombre(personaA ?? { nombre_completo: '—' })} con ${apellidoYNombre(personaB ?? { nombre_completo: '—' })} del ${isoToDmy(cbDesde)} al ${isoToDmy(cbHasta)} (${diasForm} día${diasForm === 1 ? '' : 's'}). Se escribe en Real; la Ideal no se toca.`
            : `Vas a aplicar ${opcionesCodigo.find((o) => o.valor === cbCodigo)?.etiqueta ?? 'el código'} a ${apellidoYNombre(personaA ?? { nombre_completo: '—' })} del ${isoToDmy(cbDesde)} al ${isoToDmy(cbHasta)} (${diasForm} día${diasForm === 1 ? '' : 's'}). Se escribe en Real; la Ideal no se toca.`
        }
        confirmLabel={accionForm}
        cancelLabel="Cancelar"
        onCancel={() => setConfirmKind(null)}
        onConfirm={async () => {
          setConfirmKind(null);
          await ejecutarCambio();
        }}
      />
      <ConfirmDialog
        open={confirmKind === 'ideal'}
        title="Volver a Ideal"
        message={idealPendiente?.mensaje ?? ''}
        confirmLabel="Aplicar"
        cancelLabel="Cancelar"
        tone={idealPendiente?.kind === 'columnas' ? 'danger' : 'default'}
        onCancel={() => {
          setConfirmKind(null);
          setIdealPendiente(null);
        }}
        onConfirm={async () => {
          const ok = await ejecutarVolverIdeal(idealPendiente);
          if (!ok) return;
          setConfirmKind(null);
          setIdealPendiente(null);
        }}
      />
    </div>
  );
}
