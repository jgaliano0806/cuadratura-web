/**
 * Cuadratura: una grilla, dos capas.
 * Ideal = ciclo inferido (consulta + 2 archivos).
 * Real  = esa ideal más las situaciones registradas.
 * Si todavía no hay cambios, la real muestra el ciclo: no hay pantalla vacía.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent, type MouseEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { DateField, DateRangePresets, EmptyState, FilterPicker, PeoplePicker, useToast } from '../components/ui';
import type { Person } from '../components/ui';
import { isoToDmy } from '../lib/dateRange';
import {
  ShiftCell,
  DayDetailPanel,
  type Licencia,
} from '../components/schedule';
import { apellidoYNombre, etiquetaPersona, legajoMostrar } from '../lib/personLabel';
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
  type BoardResponse,
  type DayRow,
} from '../lib/scheduleUtils';

type Capa = 'PLANIFICADA' | 'REAL';
type Vista = 'plan' | 'real';
type Pack = 'cuadratura' | 'planillas';

type Version = {
  id: string;
  periodo_desde?: string;
  periodo_hasta?: string;
};

type Inspector = Person;

type TipoCambio = 'VACACION' | 'LICENCIA' | 'ENFERMEDAD' | 'FERIADO' | 'TURNO_MOVIL';

const TIPOS_CAMBIO: Array<{ valor: TipoCambio; etiqueta: string }> = [
  { valor: 'VACACION', etiqueta: 'Vacaciones' },
  { valor: 'LICENCIA', etiqueta: 'Licencia' },
  { valor: 'ENFERMEDAD', etiqueta: 'Licencia por enfermedad' },
  { valor: 'FERIADO', etiqueta: 'Franco' },
  { valor: 'TURNO_MOVIL', etiqueta: 'Cambio de turno / móvil' },
];

const LEYENDA = [
  { cls: 'sap-cell-manana', txt: 'Mañana' },
  { cls: 'sap-cell-tarde', txt: 'Tarde' },
  { cls: 'sap-cell-noche', txt: 'Noche' },
  { cls: 'sap-cell-franco', txt: 'Franco' },
  { cls: 'sap-cell-vacacion', txt: 'Vacaciones' },
  { cls: 'sap-cell-enfermedad', txt: 'Enfermedad' },
] as const;

const DOCK_MIN = 108;
const DOCK_MAX = 420;
const DOCK_DEFAULT = 200;

function clampDock(n: number) {
  return Math.round(Math.min(DOCK_MAX, Math.max(DOCK_MIN, n)));
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

type FiltrosGrilla = {
  inspectores: string[];
  licencias: string[];
  moviles: string[];
  turnos: string[];
};

type Seleccion = {
  cell: DayRow;
  focus: string;
  anchor: string;
  dateFrom: string;
  dateTo: string;
};

function tipoDesdeCelda(
  cell: DayRow,
  licencias: Licencia[],
): {
  tipo: TipoCambio;
  licenciaId: string;
  turno: '' | 'M' | 'T' | 'N';
  movil: string;
} {
  const lic = cell.licencia_codigo
    ? licencias.find((l) => l.codigo === cell.licencia_codigo)
    : undefined;
  if (lic) {
    return { tipo: 'LICENCIA', licenciaId: lic.id, turno: '', movil: '' };
  }
  const letra = cell.turno || cell.codigo[0];
  if (letra === 'M' || letra === 'T' || letra === 'N') {
    return {
      tipo: 'TURNO_MOVIL',
      licenciaId: '',
      turno: letra,
      movil: cell.movil != null ? String(cell.movil) : '',
    };
  }
  if (cell.tipo_dia === 'VACACION' || cell.codigo === 'V') {
    return { tipo: 'VACACION', licenciaId: '', turno: '', movil: '' };
  }
  if (cell.tipo_dia === 'ENFERMEDAD' || cell.codigo === 'EF') {
    return { tipo: 'ENFERMEDAD', licenciaId: '', turno: '', movil: '' };
  }
  return { tipo: 'FERIADO', licenciaId: '', turno: '', movil: '' };
}

function diaPasa(d: DayRow, f: FiltrosGrilla): boolean {
  if (f.moviles.length && (d.movil == null || !f.moviles.includes(String(d.movil)))) {
    return false;
  }
  if (f.turnos.length && (!d.turno || !f.turnos.includes(d.turno))) return false;
  if (f.licencias.length && !f.licencias.includes(d.licencia_codigo || '')) return false;
  return true;
}

function agrupar(
  board: BoardResponse | null,
  filtros: FiltrosGrilla,
  catalogo?: Set<string>,
  personas?: Map<string, Person>,
) {
  const mapa = new Map<
    string,
    { nombre: string; legajo: string; dias: Map<string, DayRow> }
  >();
  const cruza = Boolean(filtros.licencias.length || filtros.moviles.length || filtros.turnos.length);
  for (const d of board?.days ?? []) {
    if (!d.inspector_id) continue;
    if (catalogo && !catalogo.has(d.inspector_id)) continue;
    const k = d.inspector_id;
    const fuente = personas?.get(k) ?? d;
    const entrada = mapa.get(k) ?? {
      nombre: apellidoYNombre(fuente),
      legajo: legajoMostrar(fuente.legajo),
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
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es') || a.legajo.localeCompare(b.legajo));
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

function contarDiffs(plan: BoardResponse | null, real: BoardResponse | null): number {
  if (!plan || !real) return 0;
  const mapa = new Map<string, DayRow>();
  for (const d of plan.days) mapa.set(`${rowKey(d)}|${d.fecha_operativa}`, d);
  let n = 0;
  for (const d of real.days) {
    const otra = mapa.get(`${rowKey(d)}|${d.fecha_operativa}`);
    if (otra && (otra.codigo !== d.codigo || otra.tipo_dia !== d.tipo_dia)) n += 1;
  }
  return n;
}

function Grilla({
  board,
  fechas,
  hoy,
  filtros,
  catalogo,
  personas,
  cargando,
  vacio,
  seleccion,
  contra,
  onSelect,
}: {
  board: BoardResponse | null;
  fechas: string[];
  hoy: string;
  filtros: FiltrosGrilla;
  catalogo?: Set<string>;
  personas?: Map<string, Person>;
  cargando: boolean;
  vacio: string;
  seleccion: Seleccion | null;
  contra: BoardResponse | null;
  onSelect: (cell: DayRow, date: string, opts?: { extend?: boolean }) => void;
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
  const scrollRef = useRef<HTMLDivElement>(null);

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
    if (!seleccion || !filas.length || !fechas.length) return;
    // El evento de window es el del DOM, no el sintético de React: el import de
    // arriba trae `KeyboardEvent` de React y taparía al global.
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (enCampoEditable(e.target)) return;
      if (e.key === 'Tab' && (e.ctrlKey || e.metaKey || e.altKey)) return;
      const inGrid =
        e.target instanceof HTMLElement &&
        Boolean(e.target.closest('.sap-grid-scroll, .sap-cell'));
      const ri = filas.findIndex((f) => f.key === rowKey(seleccion.cell));
      const ci = fechas.indexOf(seleccion.focus);
      if (ri < 0 || ci < 0) return;
      const jump = e.ctrlKey || e.metaKey;
      let next: { cell: DayRow; date: string } | null = null;
      if (e.key === 'ArrowLeft' || (e.key === 'Tab' && e.shiftKey && inGrid)) {
        next = siguienteCelda(
          filas,
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
          filas,
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
        next = siguienteCelda(filas, fechas, ri, ci, -1, 0, filtros, cruza, jump);
      } else if (e.key === 'ArrowDown') {
        next = siguienteCelda(filas, fechas, ri, ci, 1, 0, filtros, cruza, jump);
      } else if (e.key === 'Home') {
        next = siguienteCelda(filas, fechas, ri, ci, 0, -1, filtros, cruza, true);
      } else if (e.key === 'End') {
        next = siguienteCelda(filas, fechas, ri, ci, 0, 1, filtros, cruza, true);
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
  }, [seleccion, filas, fechas, filtros, cruza, onSelect]);

  if (cargando) {
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

  return (
    <div className="sap-grid-scroll" ref={scrollRef}>
      <table
        className="sap-grid"
        style={
          {
            '--sap-legajo-w': `${cols.legajo}px`,
            '--sap-name-w': `${cols.name}px`,
            '--sap-day-w': `${cols.day}px`,
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
          {filas.map((fila) => (
            <tr key={fila.key}>
              <th className="sap-sticky-legajo">{fila.legajo}</th>
              <th className="sap-sticky-name" scope="row" title={fila.nombre}>
                {fila.nombre}
              </th>
              {fechas.map((f) => {
                const celda = fila.dias.get(f);
                const oculta = Boolean(celda && cruza && !diaPasa(celda, filtros));
                if (!celda || oculta) {
                  return (
                    <td
                      key={f}
                      className={`sap-empty${esFinDeSemana(f) ? ' is-weekend' : ''}`}
                    />
                  );
                }
                const otra = contraMap.get(`${fila.key}|${f}`);
                const differs = Boolean(
                  otra &&
                    (otra.codigo !== celda.codigo || otra.tipo_dia !== celda.tipo_dia),
                );
                const misma = Boolean(
                  seleccion && rowKey(seleccion.cell) === fila.key,
                );
                const enRango =
                  misma &&
                  f >= seleccion!.dateFrom &&
                  f <= seleccion!.dateTo;
                return (
                  <td key={f} className={esFinDeSemana(f) ? 'is-weekend' : undefined}>
                    <ShiftCell
                      cell={celda}
                      date={f}
                      differs={differs}
                      selected={misma && seleccion!.focus === f}
                      rangeSelected={enRango && seleccion!.focus !== f}
                      onSelect={onSelect}
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
  const [params, setParams] = useSearchParams();
  const inicial = useMemo(() => monthBounds(iso(new Date())), []);
  const hoy = useMemo(() => iso(new Date()), []);
  const capa: Vista = params.get('vista') === 'real' ? 'real' : 'plan';

  const [desde, setDesde] = useState(() => params.get('from') || inicial.from);
  const [hasta, setHasta] = useState(() => params.get('to') || inicial.to);

  const [planes, setPlanes] = useState<Version[]>([]);
  const [reales, setReales] = useState<Version[]>([]);
  const [boardPlan, setBoardPlan] = useState<BoardResponse | null>(null);
  const [boardReal, setBoardReal] = useState<BoardResponse | null>(null);
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
  const [licencias, setLicencias] = useState<Licencia[]>([]);

  const [inspectores, setInspectores] = useState<Inspector[] | null>(null);
  const [movilesActivos, setMovilesActivos] = useState<number[]>([]);
  const [cbInspector, setCbInspector] = useState('');
  const [cbTipo, setCbTipo] = useState<TipoCambio>('VACACION');
  const [cbLicencia, setCbLicencia] = useState('');
  const [cbDesde, setCbDesde] = useState('');
  const [cbHasta, setCbHasta] = useState('');
  const [cbTurno, setCbTurno] = useState<'' | 'M' | 'T' | 'N'>('');
  const [cbMovil, setCbMovil] = useState<string>('');
  const [cbMotivo, setCbMotivo] = useState('');
  const [dockH, setDockH] = useState(() => {
    const n = Number(localStorage.getItem('cuad-dock-h'));
    return Number.isFinite(n) ? clampDock(n) : DOCK_DEFAULT;
  });
  const [dockResizing, setDockResizing] = useState(false);

  const datoDesde = useMemo(() => primerDato([...planes, ...reales]), [planes, reales]);
  const cubiertoHasta = useMemo(
    () => ultimoDato(planes.length ? planes : reales),
    [planes, reales],
  );
  const hueco = useMemo(
    () => (versionesListas ? rangoAGenerar(cubiertoHasta, desde, hasta) : null),
    [versionesListas, cubiertoHasta, desde, hasta],
  );
  const plan = useMemo(() => elegir(planes, desde, hasta), [planes, desde, hasta]);
  const real = useMemo(() => elegir(reales, desde, hasta), [reales, desde, hasta]);
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
  const filtros = useMemo<FiltrosGrilla>(
    () => ({
      inspectores: filtroInspectores,
      licencias: filtroLicencias,
      moviles: filtroMoviles,
      turnos: filtroTurnos,
    }),
    [filtroInspectores, filtroLicencias, filtroMoviles, filtroTurnos],
  );
  const opcionesInspectores = useMemo(
    () =>
      (inspectores ?? []).map((p) => ({
        id: p.id,
        label: etiquetaPersona(p),
        search: [p.legajo, p.apellido, p.nombres, p.nombre_completo]
          .filter(Boolean)
          .join(' '),
      })),
    [inspectores],
  );
  const opcionesLicencias = useMemo(
    () =>
      licenciasActivas.map((l) => ({
        id: l.codigo,
        label: l.nombre,
        search: l.codigo,
      })),
    [licenciasActivas],
  );
  const opcionesMoviles = useMemo(
    () => movilesActivos.map((n) => ({ id: String(n), label: String(n) })),
    [movilesActivos],
  );
  const opcionesTurnos = useMemo(
    () => SHIFTS.map((s) => ({ id: s, label: SHIFT_LABEL[s] })),
    [],
  );
  const catalogoInspectores = useMemo(
    () => (inspectores ? new Set(inspectores.map((i) => i.id)) : undefined),
    [inspectores],
  );
  const personasPorId = useMemo(
    () => new Map((inspectores ?? []).map((p) => [p.id, p])),
    [inspectores],
  );
  /** En Real, si no hay capa propia todavía, se muestra la ideal. */
  const board = esIdeal ? boardPlan : boardReal ?? boardPlan;
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

  const cargarCapa = useCallback(
    async (capa: Capa, versionId: string | undefined) => {
      const setBoard = capa === 'PLANIFICADA' ? setBoardPlan : setBoardReal;
      const setCargando = capa === 'PLANIFICADA' ? setCargandoPlan : setCargandoReal;
      if (!versionId) {
        setBoard(null);
        return;
      }
      setCargando(true);
      try {
        const q = new URLSearchParams({ date_from: desde, date_to: hasta });
        setBoard(await api<BoardResponse>(`/planning/${versionId}/calendar?${q}`));
      } catch (e) {
        toast.push({ tone: 'error', message: mensaje(e) });
        setBoard(null);
      } finally {
        setCargando(false);
      }
    },
    [desde, hasta, toast.push],
  );

  useEffect(() => {
    void cargarCapa('PLANIFICADA', plan?.id);
  }, [cargarCapa, plan?.id]);

  useEffect(() => {
    void cargarCapa('REAL', real?.id);
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
    if (seleccion.dateFrom !== seleccion.dateTo) return;
    const t = tipoDesdeCelda(seleccion.cell, licenciasActivas);
    setCbTipo(t.tipo);
    setCbLicencia(t.licenciaId);
    setCbTurno(t.turno);
    setCbMovil(t.movil);
  }, [seleccion, licenciasActivas]);

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
    setSeleccion(null);
  }

  function guardarDock(n: number) {
    const v = clampDock(n);
    setDockH(v);
    localStorage.setItem('cuad-dock-h', String(v));
  }

  function beginDock(e: MouseEvent<HTMLButtonElement>) {
    if (e.button !== 0) return;
    e.preventDefault();
    const startY = e.clientY;
    const start = dockH;
    setDockResizing(true);
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
    const move = (ev: globalThis.MouseEvent) => {
      setDockH(clampDock(start + startY - ev.clientY));
    };
    const up = (ev: globalThis.MouseEvent) => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      setDockResizing(false);
      guardarDock(start + startY - ev.clientY);
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  }

  function onDockKey(e: KeyboardEvent<HTMLButtonElement>) {
    const step = e.shiftKey ? 24 : 8;
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      guardarDock(dockH + step);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      guardarDock(dockH - step);
    } else if (e.key === 'Home') {
      e.preventDefault();
      guardarDock(DOCK_MIN);
    } else if (e.key === 'End') {
      e.preventDefault();
      guardarDock(DOCK_MAX);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      guardarDock(DOCK_DEFAULT);
    }
  }

  function seleccionar(cell: DayRow, date: string, opts?: { extend?: boolean }) {
    setSeleccion((prev) => {
      if (opts?.extend && prev) {
        if (rowKey(prev.cell) !== rowKey(cell)) return prev;
        const lo = prev.anchor <= date ? prev.anchor : date;
        const hi = prev.anchor <= date ? date : prev.anchor;
        return { cell, focus: date, anchor: prev.anchor, dateFrom: lo, dateTo: hi };
      }
      return { cell, focus: date, anchor: date, dateFrom: date, dateTo: date };
    });
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
    async (from: string, to: string) => {
      if (from > to) {
        toast.push({
          tone: 'error',
          message: 'La fecha de inicio debe ser anterior o igual al fin.',
        });
        return;
      }
      setOcupado(`Armando el ciclo ${etiquetaRango(from, to)}…`);
      try {
        await api('/schedule-engine/apply', {
          method: 'POST',
          body: JSON.stringify({ date_from: from, date_to: to }),
        });
        await api('/schedule-engine/apply-real', {
          method: 'POST',
          body: JSON.stringify({ date_from: from, date_to: to }),
        });
        const { planes: p, reales: r } = await recargarVersiones();
        await Promise.all([
          cargarCapa('PLANIFICADA', elegir(p, desde, hasta)?.id),
          cargarCapa('REAL', elegir(r, desde, hasta)?.id),
        ]);
        toast.push({
          tone: 'success',
          message: `Ciclo armado ${etiquetaRango(from, to)}.`,
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
    [cargarCapa, desde, hasta, recargarVersiones, toast],
  );

  useEffect(() => {
    if (!hueco || ocupado) return;
    const key = `${hueco.from}:${hueco.to}`;
    if (falloHueco === key || pedidoHuecoRef.current === key) return;
    pedidoHuecoRef.current = key;
    void inferirRango(hueco.from, hueco.to).catch(() => {
      pedidoHuecoRef.current = '';
      setFalloHueco(key);
    });
  }, [hueco, ocupado, falloHueco, inferirRango]);

  async function recargarReal() {
    const { reales: r } = await recargarVersiones();
    await cargarCapa('REAL', elegir(r, desde, hasta)?.id);
  }

  async function aplicarLicencia(id: string) {
    if (!seleccion?.cell.inspector_id) return;
    setOcupado('Registrando…');
    try {
      await api('/schedule-engine/absence', {
        method: 'POST',
        body: JSON.stringify({
          inspector_id: seleccion.cell.inspector_id,
          date_from: seleccion.dateFrom,
          date_to: seleccion.dateTo,
          kind: 'LICENCIA',
          catalogo_licencia_id: id,
          rematerialize: true,
        }),
      });
      setSeleccion(null);
      await recargarReal();
      toast.push({ tone: 'success', message: 'Licencia registrada en la real.' });
    } catch (err) {
      toast.push({ tone: 'error', message: mensaje(err) });
    } finally {
      setOcupado(null);
    }
  }

  async function aplicarTurnoMovil(turno: 'M' | 'T' | 'N', movil: number) {
    if (!seleccion?.cell.inspector_id) return;
    setOcupado('Registrando…');
    try {
      await api('/schedule-engine/assignment', {
        method: 'POST',
        body: JSON.stringify({
          inspector_id: seleccion.cell.inspector_id,
          date_from: seleccion.dateFrom,
          date_to: seleccion.dateTo,
          shift: turno,
          mobile: movil,
          rematerialize: true,
        }),
      });
      setSeleccion(null);
      await recargarReal();
      toast.push({ tone: 'success', message: 'Turno y móvil registrados en la real.' });
    } catch (err) {
      toast.push({ tone: 'error', message: mensaje(err) });
    } finally {
      setOcupado(null);
    }
  }

  async function aplicarCambio(e: FormEvent) {
    e.preventDefault();
    if (!cbInspector) {
      toast.push({ tone: 'error', message: 'Elegí un inspector.' });
      return;
    }
    if (!cbDesde || !cbHasta || cbDesde > cbHasta) {
      toast.push({ tone: 'error', message: 'Revisá el rango de fechas.' });
      return;
    }
    if (cbTipo === 'LICENCIA' && !cbLicencia) {
      toast.push({
        tone: 'error',
        message:
          licenciasActivas.length === 0
            ? 'No hay tipos de licencia activos. Cargalos en Administración → Licencias.'
            : 'Elegí el tipo de licencia.',
      });
      return;
    }
    if (cbTipo === 'TURNO_MOVIL' && cbMovil && !movilesActivos.includes(Number(cbMovil))) {
      toast.push({
        tone: 'error',
        message: 'Ese móvil no está en Administración. Elegí uno del catálogo.',
      });
      return;
    }
    if (cbTipo === 'TURNO_MOVIL' && !cbTurno && !cbMovil) {
      toast.push({ tone: 'error', message: 'Indicá al menos un turno o un móvil.' });
      return;
    }

    const dias =
      Math.round(
        (Date.parse(`${cbHasta}T12:00:00Z`) - Date.parse(`${cbDesde}T12:00:00Z`)) /
          86_400_000,
      ) + 1;

    setOcupado(`Registrando ${dias} día(s)…`);
    try {
      if (cbTipo === 'TURNO_MOVIL') {
        await api('/schedule-engine/assignment', {
          method: 'POST',
          body: JSON.stringify({
            inspector_id: cbInspector,
            date_from: cbDesde,
            date_to: cbHasta,
            ...(cbTurno ? { shift: cbTurno } : {}),
            ...(cbMovil ? { mobile: Number(cbMovil) } : {}),
            reason: cbMotivo || undefined,
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
            kind: cbTipo,
            reason: cbMotivo || undefined,
            ...(cbTipo === 'LICENCIA' && cbLicencia
              ? { catalogo_licencia_id: cbLicencia }
              : {}),
            rematerialize: true,
          }),
        });
      }
      setSeleccion(null);
      setCbMotivo('');
      await recargarReal();
      toast.push({
        tone: 'success',
        message: `Registrado en la real · ${dias} día(s). La ideal no se tocó.`,
      });
    } catch (err) {
      toast.push({ tone: 'error', message: mensaje(err) });
    } finally {
      setOcupado(null);
    }
  }

  async function exportar(pack: Pack) {
    if (!versionExport) {
      toast.push({ tone: 'error', message: 'No hay cuadratura para exportar.' });
      return;
    }
    setOcupado('Armando el Excel…');
    try {
      const base = import.meta.env.VITE_API_URL || '/api';
      const res = await fetch(
        `${base}/exports/version/${versionExport.id}.xlsx?pack=${pack}`,
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
      toast.push({ tone: 'success', message: `Descargado: ${nombre}` });
    } catch (e) {
      toast.push({ tone: 'error', message: mensaje(e) });
    } finally {
      setOcupado(null);
    }
  }

  const fechas = useMemo(() => eachDate(desde, hasta), [desde, hasta]);
  const hayCiclo = Boolean(boardPlan);

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
        <div className="cuad-head-title">
          <h1>Inspectores</h1>
          <div className="cuad-vista" role="tablist" aria-label="Capa de la cuadratura">
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
              className={esIdeal ? undefined : 'active'}
              onClick={() => setVista('real')}
            >
              Real
            </button>
          </div>
        </div>
        <div className="cuad-head-actions">
          <button
            type="button"
            className="btn secondary sm"
            onClick={() => void exportar('cuadratura')}
            disabled={!!ocupado || !versionExport}
          >
            Cuadratura
          </button>
          <button
            type="button"
            className="btn secondary sm"
            onClick={() => void exportar('planillas')}
            disabled={!!ocupado || !versionExport}
          >
            Planillas
          </button>
        </div>
      </header>

      <section className="panel cuad-bar">
        <form
          className="cuad-bar-form"
          onSubmit={(e) => {
            e.preventDefault();
          }}
        >
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
          <div className="cuad-range" role="group" aria-label="Período">
            <div className="cuad-filter">
              <label htmlFor="cuad-desde">Desde</label>
              <DateField
                id="cuad-desde"
                aria-label="Desde"
                value={desde}
                onChange={(v) => aplicarRango(v, hasta)}
              />
            </div>
            <span className="cuad-range-sep" aria-hidden>
              –
            </span>
            <div className="cuad-filter">
              <label htmlFor="cuad-hasta">Hasta</label>
              <DateField
                id="cuad-hasta"
                aria-label="Hasta"
                value={hasta}
                onChange={(v) => aplicarRango(desde, v)}
              />
            </div>
          </div>
          <DateRangePresets
            from={desde}
            to={hasta}
            onApply={aplicarRango}
            compact
            include={['this-week', 'this-month', 'next-month']}
          />
          <div className="cuad-filters">
            <div className="cuad-filter is-insp">
              <label htmlFor="cuad-insp">Inspectores</label>
              <FilterPicker
                id="cuad-insp"
                aria-label="Inspectores"
                options={opcionesInspectores}
                values={filtroInspectores}
                onChange={setFiltroInspectores}
                allLabel="Todos"
                placeholder="Buscar legajo, apellido o nombre…"
              />
            </div>
            <div className="cuad-filter">
              <label htmlFor="cuad-lic">Licencias</label>
              <FilterPicker
                id="cuad-lic"
                aria-label="Licencias"
                options={opcionesLicencias}
                values={filtroLicencias}
                onChange={setFiltroLicencias}
                allLabel="Todas"
                placeholder="Buscar licencia…"
              />
            </div>
            <div className="cuad-filter">
              <label htmlFor="cuad-mov">Móviles</label>
              <FilterPicker
                id="cuad-mov"
                aria-label="Móviles"
                options={opcionesMoviles}
                values={filtroMoviles}
                onChange={setFiltroMoviles}
                allLabel="Todos"
                placeholder="Buscar móvil…"
              />
            </div>
            <div className="cuad-filter">
              <label htmlFor="cuad-tur">Turnos</label>
              <FilterPicker
                id="cuad-tur"
                aria-label="Turnos"
                options={opcionesTurnos}
                values={filtroTurnos}
                onChange={setFiltroTurnos}
                allLabel="Todos"
                placeholder="Buscar turno…"
              />
            </div>
          </div>
        </form>
        {avisoAntes ? (
          <p className="cuad-aviso" role="status">
            {avisoAntes}
          </p>
        ) : null}
        {ocupado && (
          <p className="cuad-busy" role="status">
            {ocupado}
          </p>
        )}
      </section>

      <div className="cuad-meta">
        <ul className="cuad-legend">
          {LEYENDA.map((item) => (
            <li key={item.cls}>
              <span className={`cuad-swatch ${item.cls}`} />
              {item.txt}
            </li>
          ))}
          {!esIdeal && diffs > 0 && (
            <li>
              <span className="cuad-swatch differs" />
              Distinto de la ideal
            </li>
          )}
        </ul>
      </div>

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
          <Grilla
            board={board}
            fechas={fechas}
            hoy={hoy}
            filtros={filtros}
            catalogo={catalogoInspectores}
            personas={personasPorId}
            cargando={cargando}
            vacio={
              inspectores && inspectores.length === 0
                ? 'No hay inspectores en Administración. Incorporalos en Inspectores y volvé a generar el ciclo.'
                : 'Nadie coincide con los filtros elegidos.'
            }
            seleccion={seleccion}
            contra={esIdeal ? null : boardPlan}
            onSelect={seleccionar}
          />
        </section>
      )}

      <section
        className={`panel cuad-dock${dockResizing ? ' is-resizing' : ''}`}
        style={{ height: dockH }}
        aria-label="Detalle del día"
      >
        <button
          type="button"
          className="cuad-dock-resizer"
          aria-label="Cambiar alto del panel"
          title="Arrastrá para cambiar el alto. Doble clic restaura el tamaño."
          aria-orientation="horizontal"
          aria-valuemin={DOCK_MIN}
          aria-valuemax={DOCK_MAX}
          aria-valuenow={dockH}
          onMouseDown={beginDock}
          onDoubleClick={() => guardarDock(DOCK_DEFAULT)}
          onKeyDown={onDockKey}
        />
        <div className="cuad-dock-body">
          <DayDetailPanel
            embedded
            cell={seleccion?.cell ?? null}
            dateFrom={seleccion?.dateFrom ?? null}
            dateTo={seleccion?.dateTo}
            editable={!esIdeal}
            busy={!!ocupado}
            licencias={licenciasActivas}
            moviles={movilesActivos}
            onClose={() => setSeleccion(null)}
            onLicencia={esIdeal ? undefined : aplicarLicencia}
            onTurnoMovil={esIdeal ? undefined : aplicarTurnoMovil}
          >
            {esIdeal ? null : (
              <form className="cuad-change" onSubmit={aplicarCambio}>
                <div className="field cuad-bar-grow">
                  <label htmlFor="cb-insp">Inspector</label>
                  <PeoplePicker
                    id="cb-insp"
                    people={inspectores ?? []}
                    value={cbInspector}
                    onChange={setCbInspector}
                    placeholder="Buscar legajo, apellido o nombre…"
                  />
                </div>
                <div className="field">
                  <label htmlFor="cb-tipo">Tipo</label>
                  <select
                    id="cb-tipo"
                    value={cbTipo}
                    onChange={(e) => setCbTipo(e.target.value as TipoCambio)}
                  >
                    {TIPOS_CAMBIO.map((t) => (
                      <option key={t.valor} value={t.valor}>
                        {t.etiqueta}
                      </option>
                    ))}
                  </select>
                </div>
                {cbTipo === 'LICENCIA' && (
                  <div className="field">
                    <label htmlFor="cb-lic">Tipo de licencia</label>
                    <select
                      id="cb-lic"
                      value={cbLicencia}
                      onChange={(e) => setCbLicencia(e.target.value)}
                    >
                      <option value="">Elegí…</option>
                      {licenciasActivas.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.nombre}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="field">
                  <label htmlFor="cb-desde">Desde</label>
                  <input
                    id="cb-desde"
                    type="date"
                    value={cbDesde}
                    onChange={(e) => setCbDesde(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="cb-hasta">Hasta</label>
                  <input
                    id="cb-hasta"
                    type="date"
                    value={cbHasta}
                    onChange={(e) => setCbHasta(e.target.value)}
                  />
                </div>
                {cbTipo === 'TURNO_MOVIL' && (
                  <>
                    <div className="field">
                      <label htmlFor="cb-turno">Turno</label>
                      <select
                        id="cb-turno"
                        value={cbTurno}
                        onChange={(e) => setCbTurno(e.target.value as '' | 'M' | 'T' | 'N')}
                      >
                        <option value="">Sin cambio</option>
                        <option value="M">Mañana</option>
                        <option value="T">Tarde</option>
                        <option value="N">Noche</option>
                      </select>
                    </div>
                    <div className="field">
                      <label htmlFor="cb-movil">Móvil</label>
                      <select
                        id="cb-movil"
                        value={cbMovil}
                        onChange={(e) => setCbMovil(e.target.value)}
                      >
                        <option value="">Sin cambio</option>
                        {movilesActivos.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </div>
                  </>
                )}
                <div className="field cuad-bar-grow">
                  <label htmlFor="cb-motivo">Motivo</label>
                  <input
                    id="cb-motivo"
                    type="text"
                    placeholder="Opcional"
                    value={cbMotivo}
                    onChange={(e) => setCbMotivo(e.target.value)}
                  />
                </div>
                <div className="cuad-bar-actions">
                  <button type="submit" className="btn primary" disabled={!!ocupado}>
                    Registrar
                  </button>
                </div>
              </form>
            )}
          </DayDetailPanel>
        </div>
      </section>
    </div>
  );
}
