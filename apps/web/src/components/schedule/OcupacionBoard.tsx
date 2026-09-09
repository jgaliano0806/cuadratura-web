import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, ApiError } from '../../lib/api';
import { bajarExcelPost } from '../../lib/xlsxDownload';
import { EmptyState, ExcelMenu, FilterPicker, SkeletonTable, useToast, type Person } from '../ui';
import { useBoxTheme } from '../../lib/boxTheme';
import type { Licencia } from './LicenciasModal';
import { apellidoYNombre } from '../../lib/personLabel';
import {
  cellShortLabel,
  diaPasa,
  eachDate,
  type BoardResponse,
  type DayRow,
  type FiltrosGrilla,
} from '../../lib/scheduleUtils';

type EstadoOcupacion = 'HUECO' | 'CUBIERTA' | 'DOBLE' | 'SUPERPUESTA';

type Slot = {
  date: string;
  movil: number;
  turno: 'M' | 'T' | 'N';
  franja: 'TEMPRANA' | 'TARDIA' | null;
  cantidad: number;
  inspectores: string[];
  estado: EstadoOcupacion;
  fueraFiltro: boolean;
};

type Desdoble = {
  date: string;
  turno: 'M' | 'T' | 'N';
  movilOrigen: number;
  movilDestino: number | null;
  inspectores: string[];
  movido: string | null;
  estado: 'RESUELTO' | 'SIN_DESTINO';
  motivo: string;
};

type Ocupacion = {
  date_from: string;
  date_to: string;
  desdoblada: boolean;
  slots: Slot[];
  totales: {
    slots: number;
    huecos: number;
    cubiertas: number;
    dobles: number;
    superpuestas: number;
    desdobles_aplicados: number;
  };
  referencia: string;
};

const TURNOS: Array<{ code: 'M' | 'T' | 'N'; label: string }> = [
  { code: 'M', label: 'Mañana' },
  { code: 'T', label: 'Tarde' },
  { code: 'N', label: 'Noche' },
];

const TONO: Record<EstadoOcupacion, { cls: string; label: string; kpi: keyof Ocupacion['totales'] }> =
  {
    HUECO: { cls: 'oc-hueco', label: 'Sin cobertura', kpi: 'huecos' },
    CUBIERTA: { cls: 'oc-cubierta', label: 'Un inspector', kpi: 'cubiertas' },
    DOBLE: { cls: 'oc-doble', label: 'Dos (normal)', kpi: 'dobles' },
    SUPERPUESTA: { cls: 'oc-super', label: 'Tres o más', kpi: 'superpuestas' },
  };

const PAGE_SIZES = [5, 10, 15, 20, 25, 50] as const;
const OCULTAR_KEY = 'cuad-desdobles-oculto';
const OC_PANEL_KEY = 'cuad-ocupacion-oculto';

function fechaCorta(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

type Props = {
  from: string;
  to: string;
  enabled?: boolean;
  parte?: 'ocupacion' | 'desdobles' | 'todo';
  filtros?: FiltrosGrilla;
  board?: BoardResponse | null;
  people?: Person[];
  catalogo?: Set<string>;
  moviles?: number[];
  licencias?: Licencia[];
  esIdeal?: boolean;
};

const FILTROS_VACIOS: FiltrosGrilla = {
  inspectores: [],
  licencias: [],
  moviles: [],
  turnos: [],
};

function esTrabajo(d: DayRow): boolean {
  if (d.movil == null || !d.turno) return false;
  const t = (d.tipo_dia || '').toUpperCase();
  if (t === 'FRANCO' || t === 'VACACION' || t === 'ENFERMEDAD') return false;
  const c = (d.codigo || '').toUpperCase();
  if (c === 'F' || c === 'V' || c === 'EF') return false;
  return true;
}

function esFranco(d: DayRow): boolean {
  const corto = cellShortLabel(d).toUpperCase();
  return corto === 'F' || (d.tipo_dia || '').toUpperCase() === 'FRANCO';
}

function esVacacion(d: DayRow): boolean {
  const corto = cellShortLabel(d).toUpperCase();
  return corto === 'V' || (d.tipo_dia || '').toUpperCase() === 'VACACION';
}

function diaTieneCodigo(d: DayRow, codigo: string): boolean {
  const c = codigo.toUpperCase();
  if (c === 'F' || c === 'FRANCO') return esFranco(d);
  if (c === 'V' || c === 'VACACION') return esVacacion(d);
  const set = new Set<string>();
  if (d.licencia_codigo) set.add(d.licencia_codigo.toUpperCase());
  if (d.codigo) set.add(d.codigo.toUpperCase());
  return set.has(c);
}

function movilesBase(
  catalogo: number[],
  board: BoardResponse | null,
  data: Ocupacion | null,
): number[] {
  const set = new Set<number>(catalogo);
  for (const d of board?.days ?? []) {
    if (d.movil != null) set.add(d.movil);
  }
  for (const s of data?.slots ?? []) set.add(s.movil);
  if (!set.size) return [1, 2, 3, 4, 5];
  return [...set].sort((a, b) => a - b);
}

function estadoDeCantidad(n: number): EstadoOcupacion {
  if (n === 0) return 'HUECO';
  if (n === 1) return 'CUBIERTA';
  if (n <= 2) return 'DOBLE';
  return 'SUPERPUESTA';
}

function nombresPersona(p: Person | DayRow): string[] {
  const out: string[] = [];
  const apeNom = apellidoYNombre(p).trim();
  if (apeNom) out.push(apeNom);
  if ('nombre_completo' in p && p.nombre_completo) out.push(p.nombre_completo.trim());
  if ('inspector' in p && p.inspector) out.push(String(p.inspector).trim());
  return out.filter(Boolean);
}

function slotsDesdeBoard(
  board: BoardResponse,
  from: string,
  to: string,
  filtros: FiltrosGrilla,
  catalogo: Set<string> | undefined,
  moviles: number[],
  turnos: Array<'M' | 'T' | 'N'>,
): Slot[] {
  const porSlot = new Map<string, string[]>();
  const bruto = new Map<string, number>();
  const hayCruza = Boolean(filtros.inspectores.length || filtros.licencias.length);
  for (const d of board.days) {
    if (d.fecha_operativa < from || d.fecha_operativa > to) continue;
    if (!d.inspector_id) continue;
    if (catalogo && !catalogo.has(d.inspector_id)) continue;
    if (!esTrabajo(d)) continue;
    const turno = d.turno as 'M' | 'T' | 'N';
    if (!turnos.includes(turno) || d.movil == null || !moviles.includes(d.movil)) continue;
    const clave = `${d.fecha_operativa}|${d.movil}|${turno}`;
    bruto.set(clave, (bruto.get(clave) ?? 0) + 1);
    if (filtros.inspectores.length && !filtros.inspectores.includes(d.inspector_id)) {
      continue;
    }
    if (!diaPasa(d, filtros)) continue;
    const lista = porSlot.get(clave) ?? [];
    const nom = apellidoYNombre(d) || d.inspector || '';
    if (nom) lista.push(nom);
    porSlot.set(clave, lista);
  }
  const fechas = eachDate(from, to);
  const salida: Slot[] = [];
  for (const date of fechas) {
    for (const movil of moviles) {
      for (const turno of turnos) {
        const inspectores = [...new Set(porSlot.get(`${date}|${movil}|${turno}`) ?? [])].sort();
        const cantidad = inspectores.length;
        salida.push({
          date,
          movil,
          turno,
          franja: null,
          cantidad,
          inspectores,
          estado: estadoDeCantidad(cantidad),
          fueraFiltro: hayCruza && cantidad === 0 && (bruto.get(`${date}|${movil}|${turno}`) ?? 0) > 0,
        });
      }
    }
  }
  return salida;
}

function totalesDe(slots: Slot[]) {
  const vivos = slots.filter((s) => !s.fueraFiltro);
  return {
    slots: vivos.length,
    huecos: vivos.filter((s) => s.estado === 'HUECO').length,
    cubiertas: vivos.filter((s) => s.estado === 'CUBIERTA').length,
    dobles: vivos.filter((s) => s.estado === 'DOBLE').length,
    superpuestas: vivos.filter((s) => s.estado === 'SUPERPUESTA').length,
    desdobles_aplicados: 0,
  };
}

function desdoblePasa(
  d: Desdoble,
  filtros: FiltrosGrilla,
  nombres: Set<string> | null,
  board: BoardResponse | null,
): boolean {
  if (filtros.moviles.length) {
    const origen = String(d.movilOrigen);
    const destino = d.movilDestino != null ? String(d.movilDestino) : '';
    if (!filtros.moviles.includes(origen) && !filtros.moviles.includes(destino)) {
      return false;
    }
  }
  if (filtros.turnos.length && !filtros.turnos.includes(d.turno)) return false;
  if (nombres) {
    const involucrados = [...d.inspectores, d.movido].filter(Boolean) as string[];
    if (!involucrados.some((n) => nombres.has(n))) return false;
  }
  if (filtros.licencias.length && board) {
    const ids = new Set(
      board.days
        .filter(
          (x) =>
            x.fecha_operativa === d.date &&
            x.turno === d.turno &&
            (x.movil === d.movilOrigen || x.movil === d.movilDestino) &&
            diaPasa(x, { ...filtros, inspectores: [], moviles: [], turnos: [] }),
        )
        .map((x) => apellidoYNombre(x) || x.inspector || '')
        .filter(Boolean),
    );
    if (![...d.inspectores].some((n) => ids.has(n))) return false;
  }
  return true;
}

type OcPack = {
  data: Ocupacion | null;
  desdobles: Desdoble[];
  busy: boolean;
};

const OcPackContext = createContext<OcPack | null>(null);

function useOcupacionFetch(from: string, to: string, enabled: boolean): OcPack {
  const toast = useToast();
  const [data, setData] = useState<Ocupacion | null>(null);
  const [desdobles, setDesdobles] = useState<Desdoble[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!enabled || !from || !to || from > to) {
      setData(null);
      setDesdobles([]);
      return;
    }
    let cancelado = false;
    const h = window.setTimeout(() => {
      setBusy(true);
      void (async () => {
        try {
          const body = JSON.stringify({
            date_from: from,
            date_to: to,
            sin_desdoblar: false,
            permitir_movil4: false,
          });
          const ocupacion = await api<Ocupacion>('/schedule-engine/ocupacion', {
            method: 'POST',
            body,
          });
          if (cancelado) return;
          setData(ocupacion);
          const det = await api<{ desdobles: Desdoble[] }>(
            '/schedule-engine/desdobles/preview',
            {
              method: 'POST',
              body: JSON.stringify({
                date_from: from,
                date_to: to,
                permitir_movil4: false,
              }),
            },
          );
          if (cancelado) return;
          setDesdobles(det.desdobles);
        } catch (err) {
          if (cancelado) return;
          setData(null);
          setDesdobles([]);
          toast.error(
            err instanceof ApiError ? err.message : 'No se pudo calcular la ocupación.',
          );
        } finally {
          if (!cancelado) setBusy(false);
        }
      })();
    }, 120);
    return () => {
      cancelado = true;
      window.clearTimeout(h);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, from, to]);

  return { data, desdobles, busy };
}

export function OcupacionPackProvider({
  from,
  to,
  enabled = true,
  children,
}: Props & { children: ReactNode }) {
  const pack = useOcupacionFetch(from, to, enabled);
  return <OcPackContext.Provider value={pack}>{children}</OcPackContext.Provider>;
}

export function OcupacionBoard({
  from,
  to,
  enabled = true,
  parte = 'todo',
  filtros = FILTROS_VACIOS,
  board = null,
  people = [],
  catalogo,
  moviles: movilesCat = [],
  licencias = [],
  esIdeal = false,
}: Props) {
  const shared = useContext(OcPackContext);
  const local = useOcupacionFetch(from, to, enabled && !shared);
  const { data, desdobles, busy } = shared ?? local;
  const toast = useToast();
  const { ocupacion: ocBoxes } = useBoxTheme();
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZES)[number]>(10);
  const [page, setPage] = useState(0);
  const [oculto, setOculto] = useState(() => localStorage.getItem(OCULTAR_KEY) === '1');
  const [panelOculto, setPanelOculto] = useState(() => localStorage.getItem(OC_PANEL_KEY) === '1');
  const [verResueltos, setVerResueltos] = useState(false);
  const [exportBusy, setExportBusy] = useState<'ocupacion' | 'desdobles' | null>(null);

  const [extrasConteo, setExtrasConteo] = useState<string[]>([]);
  const [desplegado, setDesplegado] = useState(false);

  const movilesVista = useMemo(() => {
    const base = movilesBase(movilesCat, board, data);
    return filtros.moviles.length
      ? base.filter((m) => filtros.moviles.includes(String(m)))
      : base;
  }, [movilesCat, board, data, filtros.moviles]);
  const turnosVista = useMemo(
    () =>
      filtros.turnos.length
        ? TURNOS.filter((t) => filtros.turnos.includes(t.code))
        : TURNOS,
    [filtros.turnos],
  );
  const nombresFiltro = useMemo(() => {
    if (!filtros.inspectores.length) return null;
    const set = new Set<string>();
    for (const p of people) {
      if (!filtros.inspectores.includes(p.id)) continue;
      for (const n of nombresPersona(p)) set.add(n);
    }
    for (const d of board?.days ?? []) {
      if (!d.inspector_id || !filtros.inspectores.includes(d.inspector_id)) continue;
      for (const n of nombresPersona(d)) set.add(n);
    }
    return set;
  }, [filtros.inspectores, people, board]);

  const slotsVista = useMemo(() => {
    const turnos = turnosVista.map((t) => t.code);
    if (board?.days?.length) {
      return slotsDesdeBoard(board, from, to, filtros, catalogo, movilesVista, turnos);
    }
    return (data?.slots ?? []).map((s) => {
      if (!movilesVista.includes(s.movil) || !turnos.includes(s.turno)) {
        return { ...s, fueraFiltro: true };
      }
      const coincide = !nombresFiltro || !s.inspectores.length || s.inspectores.some((n) => nombresFiltro.has(n));
      const hayCruza = Boolean(filtros.inspectores.length || filtros.licencias.length);
      return {
        ...s,
        fueraFiltro: hayCruza && !coincide && s.inspectores.length > 0,
      };
    }).filter((s) => movilesVista.includes(s.movil) && turnos.includes(s.turno));
  }, [board, from, to, filtros, catalogo, movilesVista, turnosVista, data, nombresFiltro]);

  const fechas = useMemo(() => {
    if (board?.days?.length && from && to) return eachDate(from, to);
    if (!data) return [];
    return [...new Set(slotsVista.map((s) => s.date))].sort();
  }, [board, data, from, to, slotsVista]);

  const sitPorDia = useMemo(() => {
    const map = new Map<string, { v: number; f: number; extra: Record<string, number> }>();
    for (const f of fechas) {
      const extra: Record<string, number> = {};
      for (const c of extrasConteo) extra[c.toUpperCase()] = 0;
      map.set(f, { v: 0, f: 0, extra });
    }
    if (!board?.days?.length) return map;
    for (const d of board.days) {
      const f = d.fecha_operativa.slice(0, 10);
      const row = map.get(f);
      if (!row) continue;
      if (!d.inspector_id) continue;
      if (catalogo && !catalogo.has(d.inspector_id)) continue;
      if (filtros.inspectores.length && !filtros.inspectores.includes(d.inspector_id)) {
        continue;
      }
      if (esVacacion(d)) row.v += 1;
      if (esFranco(d)) row.f += 1;
      for (const c of extrasConteo) {
        const k = c.toUpperCase();
        if (diaTieneCodigo(d, c)) row.extra[k] = (row.extra[k] ?? 0) + 1;
      }
    }
    return map;
  }, [board, fechas, catalogo, filtros.inspectores, extrasConteo]);

  const hayFiltroCruza = Boolean(filtros.inspectores.length || filtros.licencias.length);
  const totalesVista = useMemo(() => totalesDe(slotsVista), [slotsVista]);

  const opcionesExtra = useMemo(
    () =>
      licencias
        .filter((l) => {
          const c = (l.codigo || '').toUpperCase();
          return c && c !== 'V' && c !== 'F';
        })
        .map((l) => ({
          id: l.codigo,
          label: `${l.codigo} · ${l.nombre}`,
          search: `${l.codigo} ${l.nombre}`,
        })),
    [licencias],
  );

  const filasSit = useMemo(() => {
    const base: Array<{
      id: string;
      label: string;
      cls: string;
      bg?: string;
      fg?: string;
      n: (f: string) => number;
    }> = [];
    if (!esIdeal) {
      base.push({
        id: 'V',
        label: 'Vacaciones',
        cls: 'sap-cell-vacacion',
        n: (f) => sitPorDia.get(f)?.v ?? 0,
      });
    }
    base.push({
      id: 'F',
      label: 'Franco',
      cls: 'sap-cell-franco',
      n: (f) => sitPorDia.get(f)?.f ?? 0,
    });
    for (const c of extrasConteo) {
      const lic = licencias.find((l) => l.codigo.toUpperCase() === c.toUpperCase());
      const k = c.toUpperCase();
      base.push({
        id: c,
        label: lic?.nombre || c,
        cls: k === 'EF' ? 'sap-cell-enfermedad' : 'sap-cell-neutral',
        bg: lic?.color_fondo || undefined,
        fg: lic?.color_letra || undefined,
        n: (f) => sitPorDia.get(f)?.extra[k] ?? 0,
      });
    }
    return base;
  }, [sitPorDia, extrasConteo, licencias, esIdeal]);

  const desdoblesVista = useMemo(
    () => desdobles.filter((d) => desdoblePasa(d, filtros, nombresFiltro, board)),
    [desdobles, filtros, nombresFiltro, board],
  );

  const porClave = useMemo(() => {
    const map = new Map<string, Slot>();
    for (const s of slotsVista) {
      map.set(`${s.date}|${s.movil}|${s.turno}`, s);
    }
    return map;
  }, [slotsVista]);

  const pendientes = useMemo(
    () => desdoblesVista.filter((d) => d.estado === 'SIN_DESTINO'),
    [desdoblesVista],
  );
  const lista = verResueltos ? desdoblesVista : pendientes;
  const totalPages = Math.max(1, Math.ceil(lista.length / pageSize));
  const pageSafe = Math.min(page, totalPages - 1);
  const desdoblesPagina = useMemo(() => {
    const start = pageSafe * pageSize;
    return lista.slice(start, start + pageSize);
  }, [lista, pageSafe, pageSize]);

  useEffect(() => {
    setPage(0);
  }, [from, to, pageSize, lista.length, verResueltos]);

  useEffect(() => {
    setDesplegado(pendientes.length > 0);
  }, [from, to, pendientes.length]);

  async function exportarOcupacion() {
    if (!fechas.length) return;
    setExportBusy('ocupacion');
    try {
      const header = ['Móvil', 'Turno', ...fechas.map(fechaCorta)];
      const grid = [
        ...movilesVista.flatMap((movil) =>
          turnosVista.map((turno) => [
            movil,
            turno.label,
            ...fechas.map((f) => porClave.get(`${f}|${movil}|${turno.code}`)?.cantidad ?? 0),
          ]),
        ),
        ...(esIdeal ? [] : [['', 'Vacaciones', ...fechas.map((f) => sitPorDia.get(f)?.v ?? 0)]]),
        ['', 'Franco', ...fechas.map((f) => sitPorDia.get(f)?.f ?? 0)],
        ...extrasConteo.map((c) => {
          const lic = licencias.find((l) => l.codigo.toUpperCase() === c.toUpperCase());
          return [
            '',
            lic?.nombre || c,
            ...fechas.map((f) => sitPorDia.get(f)?.extra[c.toUpperCase()] ?? 0),
          ];
        }),
      ];
      const detalle = slotsVista.map((s) => [
        fechaCorta(s.date),
        s.movil,
        TURNOS.find((t) => t.code === s.turno)?.label ?? s.turno,
        s.cantidad,
        TONO[s.estado].label,
        s.inspectores.join(', '),
      ]);
      const nombre = await bajarExcelPost(
        '/exports/tabla.xlsx',
        {
          fileName: `Ocupacion_${from}_${to}.xlsx`,
          sheets: [
            { name: 'Ocupación', headers: header, rows: grid },
            {
              name: 'Detalle',
              headers: ['Fecha', 'Móvil', 'Turno', 'Cantidad', 'Estado', 'Inspectores'],
              rows: detalle,
            },
          ],
        },
        'Ocupacion.xlsx',
      );
      toast.success(`Descargado: ${nombre}`);
    } catch {
      toast.error('No se pudo armar el Excel de ocupación.');
    } finally {
      setExportBusy(null);
    }
  }

  async function exportarDesdobles() {
    if (!desdoblesVista.length) return;
    setExportBusy('desdobles');
    try {
      const rows = desdoblesVista.map((d) => [
        fechaCorta(d.date),
        TURNOS.find((t) => t.code === d.turno)?.label ?? d.turno,
        d.movilOrigen,
        d.inspectores.join(', '),
        d.movido ?? '',
        d.movilDestino ?? '',
        d.estado === 'RESUELTO' ? 'Resuelto' : 'Revisión manual',
        d.motivo || '',
      ]);
      const nombre = await bajarExcelPost(
        '/exports/tabla.xlsx',
        {
          fileName: `Desdobles_${from}_${to}.xlsx`,
          sheets: [
            {
              name: 'Desdobles',
              headers: [
                'Fecha',
                'Turno',
                'Móvil',
                'Los tres',
                'Se movió',
                'Al móvil',
                'Estado',
                'Motivo',
              ],
              rows,
            },
          ],
        },
        'Desdobles.xlsx',
      );
      toast.success(`Descargado: ${nombre}`);
    } catch {
      toast.error('No se pudo armar el Excel de desdobles.');
    } finally {
      setExportBusy(null);
    }
  }

  function ocultarDesdobles() {
    localStorage.setItem(OCULTAR_KEY, '1');
    setOculto(true);
  }

  function mostrarDesdobles() {
    localStorage.removeItem(OCULTAR_KEY);
    setOculto(false);
    setDesplegado(pendientes.length > 0);
  }

  function ocultarPanel() {
    localStorage.setItem(OC_PANEL_KEY, '1');
    setPanelOculto(true);
  }

  function mostrarPanel() {
    localStorage.removeItem(OC_PANEL_KEY);
    setPanelOculto(false);
  }

  if (!enabled) return null;

  const showOc = parte === 'todo' || parte === 'ocupacion';
  const showDes = parte === 'todo' || parte === 'desdobles';
  const hayOcupacion = Boolean(data) || Boolean(board?.days?.length);

  return (
    <div
      className={`${parte === 'todo' ? 'cuad-ocupacion stack' : 'cuad-dock-slot'}${
        busy && hayOcupacion ? ' is-refreshing' : ''
      }`}
    >
      {showOc ? (
      <section
        className={`panel oc-panel${panelOculto ? ' is-collapsed' : ''}`}
        aria-label="Ocupación por móvil"
      >
        <header className="oc-headbar">
          <h2 className="oc-title">Ocupación</h2>
          {hayOcupacion ? (
            <ul className="oc-kpis">
              {ocBoxes
                .filter((b) => b.visible)
                .map((b) => {
                  const k = (
                    b.id === 'hueco'
                      ? 'HUECO'
                      : b.id === 'cubierta'
                        ? 'CUBIERTA'
                        : b.id === 'doble'
                          ? 'DOBLE'
                          : 'SUPERPUESTA'
                  ) as EstadoOcupacion;
                  return (
                    <li
                      key={k}
                      className={`oc-kpi ${TONO[k].cls}`}
                      style={{ background: b.bg, color: b.fg }}
                    >
                      <strong>{totalesVista[TONO[k].kpi]}</strong>
                      <span>{TONO[k].label}</span>
                    </li>
                  );
                })}
            </ul>
          ) : null}
          {hayOcupacion && opcionesExtra.length ? (
            <div className="oc-kpi-pick">
              <FilterPicker
                id="oc-otras"
                options={opcionesExtra}
                values={extrasConteo}
                onChange={setExtrasConteo}
                allLabel="Otras"
                summaryLabel="Otras"
                aria-label="Otras licencias para contar por día"
              />
            </div>
          ) : null}
          <div className="oc-headbar-actions">
            <ExcelMenu
              busy={exportBusy === 'ocupacion'}
              disabled={!hayOcupacion || busy || Boolean(exportBusy)}
              items={[{ id: 'ocupacion', label: 'Ocupación' }]}
              onPick={() => void exportarOcupacion()}
            />
            {panelOculto ? (
              <button type="button" className="btn secondary sm" onClick={mostrarPanel}>
                Mostrar detalle
              </button>
            ) : (
              <button type="button" className="btn secondary sm" onClick={ocultarPanel}>
                Ocultar
              </button>
            )}
          </div>
        </header>

        {panelOculto ? null : busy && !hayOcupacion ? (
          <SkeletonTable cols={8} rows={6} />
        ) : !hayOcupacion ? (
          <EmptyState
            compact
            title={busy ? 'Calculando ocupación…' : 'Sin ocupación para el período'}
            description="Usa el mismo Desde / Hasta que la grilla."
          />
        ) : (
          <div className="oc-freeze">
            <table className={`oc-grid${hayFiltroCruza ? ' is-filtering' : ''}`}>
              <colgroup>
                <col className="oc-col-movil" />
                <col className="oc-col-turno" />
                {fechas.map((f) => (
                  <col key={f} className="oc-col-day" />
                ))}
              </colgroup>
              <thead>
                <tr>
                  <th className="oc-pin oc-pin-movil">Móvil</th>
                  <th className="oc-pin oc-pin-turno">Turno</th>
                  {fechas.map((f) => (
                    <th key={f}>{fechaCorta(f)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {movilesVista.flatMap((movil) =>
                  turnosVista.map((turno, i) => (
                    <tr
                      key={`${movil}-${turno.code}`}
                      className={i === 0 ? 'oc-movil-start' : undefined}
                    >
                      <td className="oc-pin oc-pin-movil oc-movil-cell">
                        {i === 0 ? (
                          <>
                            {movil}
                            {movil === 4 ? (
                              <span className="oc-movil-hint">manual</span>
                            ) : null}
                          </>
                        ) : null}
                      </td>
                      <td className="oc-pin oc-pin-turno">{turno.label}</td>
                      {fechas.map((f) => {
                        const slot = porClave.get(`${f}|${movil}|${turno.code}`);
                        const estado = slot?.estado ?? 'HUECO';
                        const fuera = Boolean(slot?.fueraFiltro);
                        const coincide = hayFiltroCruza && !fuera && (slot?.cantidad ?? 0) > 0;
                        const tono =
                          turno.code === 'M'
                            ? 'manana'
                            : turno.code === 'T'
                              ? 'tarde'
                              : 'noche';
                        const extra = fuera
                          ? ' is-filtered'
                          : coincide
                            ? ' is-match'
                            : estado === 'HUECO'
                              ? ' oc-slot-hueco'
                              : estado === 'SUPERPUESTA'
                                ? ' oc-slot-super'
                                : '';
                        return (
                          <td
                            key={f}
                            className={`sap-cell-${tono}${extra}`}
                            title={
                              fuera
                                ? 'No coincide con el filtro'
                                : slot?.inspectores.length
                                  ? `${slot.cantidad} · ${slot.inspectores.join(', ')}`
                                  : 'Sin cobertura'
                            }
                          >
                            {slot?.cantidad ?? 0}
                          </td>
                        );
                      })}
                    </tr>
                  )),
                )}
                {filasSit.map((fila, i) => (
                  <tr key={fila.id} className={`oc-sit${i === 0 ? ' oc-movil-start' : ''}`}>
                    <td
                      className={`oc-pin oc-pin-movil ${fila.cls}`}
                      style={
                        fila.bg
                          ? { background: fila.bg, color: fila.fg || '#fff' }
                          : undefined
                      }
                    >
                      <span className="oc-sit-name">{fila.label}</span>
                    </td>
                    <td
                      className={`oc-pin oc-pin-turno ${fila.cls}`}
                      style={
                        fila.bg
                          ? { background: fila.bg, color: fila.fg || '#fff' }
                          : undefined
                      }
                    />
                    {fechas.map((f) => (
                      <td
                        key={f}
                        className={fila.cls}
                        style={
                          fila.bg
                            ? { background: fila.bg, color: fila.fg || '#fff' }
                            : undefined
                        }
                      >
                        {fila.n(f)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      ) : null}

      {showDes && desdobles.length ? (
        oculto ? (
          <div className="panel cuad-desdobles-bar">
            <div className="cuad-desdobles-bar-copy">
              <h2>
                Desdobles
                {pendientes.length ? (
                  <span className="badge pending">{pendientes.length} sin resolver</span>
                ) : (
                  <span className="badge ok">Todo resuelto</span>
                )}
              </h2>
              <p className="muted">
                {pendientes.length
                  ? 'Hay móviles con tres inspectores: alguien tiene que mover a uno.'
                  : 'No queda nadie por mover. El historial está en el detalle.'}
              </p>
            </div>
            <div className="cuad-desdobles-bar-actions">
              <ExcelMenu
                busy={exportBusy === 'desdobles'}
                disabled={Boolean(exportBusy) || !desdoblesVista.length}
                items={[{ id: 'desdobles', label: 'Desdobles' }]}
                onPick={() => void exportarDesdobles()}
              />
              <button type="button" className="btn secondary sm" onClick={mostrarDesdobles}>
                Mostrar detalle
              </button>
            </div>
          </div>
        ) : (
          <details
            className="panel cuad-desdobles"
            open={desplegado}
            onToggle={(e) => setDesplegado(e.currentTarget.open)}
          >
            <summary className="cuad-desdobles-head">
              <h2>
                Desdobles
                {pendientes.length ? (
                  <span className="badge pending" style={{ marginLeft: 10, fontSize: 12 }}>
                    {pendientes.length} sin resolver
                  </span>
                ) : (
                  <span className="badge ok" style={{ marginLeft: 10, fontSize: 12 }}>
                    Todo resuelto
                  </span>
                )}
              </h2>
            </summary>
            <header className="cuad-desdobles-tools">
              <label className="cuad-desdobles-toggle">
                <input
                  type="checkbox"
                  checked={verResueltos}
                  onChange={(e) => setVerResueltos(e.target.checked)}
                />
                Ver resueltos
              </label>
              <label className="cuad-desdobles-size">
                <span>Mostrar</span>
                <select
                  value={pageSize}
                  aria-label="Registros por página"
                  onChange={(e) =>
                    setPageSize(Number(e.target.value) as (typeof PAGE_SIZES)[number])
                  }
                >
                  {PAGE_SIZES.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <ExcelMenu
                busy={exportBusy === 'desdobles'}
                disabled={Boolean(exportBusy) || !desdoblesVista.length}
                items={[{ id: 'desdobles', label: 'Desdobles' }]}
                onPick={() => void exportarDesdobles()}
              />
              <button type="button" className="btn secondary sm" onClick={ocultarDesdobles}>
                Ocultar
              </button>
            </header>
            {lista.length === 0 ? (
              <p className="muted cuad-desdobles-empty">
                {desdoblesVista.length === 0 && desdobles.length
                  ? 'Ningún desdoble coincide con los filtros.'
                  : 'No hay desdobles pendientes.'}
              </p>
            ) : (
              <>
                <div className="cuad-desdobles-scroll">
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Turno</th>
                        <th>Móvil</th>
                        <th>Los tres</th>
                        <th>Se movió</th>
                        <th>Al móvil</th>
                        <th>Motivo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {desdoblesPagina.map((d, i) => {
                        const idx = pageSafe * pageSize + i;
                        const key = `${d.date}-${d.movilOrigen}-${d.turno}-${idx}`;
                        return (
                          <tr key={key}>
                            <td style={{ whiteSpace: 'nowrap' }}>{fechaCorta(d.date)}</td>
                            <td>{TURNOS.find((t) => t.code === d.turno)?.label ?? d.turno}</td>
                            <td style={{ textAlign: 'center' }}>{d.movilOrigen}</td>
                            <td style={{ fontSize: 13 }}>{d.inspectores.join(', ')}</td>
                            <td>
                              <strong>{d.movido ?? '—'}</strong>
                            </td>
                            <td style={{ textAlign: 'center' }}>{d.movilDestino ?? '—'}</td>
                            <td className="cuad-desdobles-motivo">
                              <span
                                className={`badge ${d.estado === 'RESUELTO' ? 'ok' : 'pending'}`}
                              >
                                {d.estado === 'RESUELTO' ? 'Resuelto' : 'Revisión manual'}
                              </span>
                              {d.motivo ? (
                                <p className="cuad-desdobles-motivo-full">{d.motivo}</p>
                              ) : null}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <footer className="cuad-desdobles-pager">
                  <span className="muted">
                    {pageSafe * pageSize + 1}–
                    {Math.min((pageSafe + 1) * pageSize, lista.length)} de {lista.length}
                  </span>
                  <div className="cuad-desdobles-pager-btns">
                    <button
                      type="button"
                      className="btn secondary sm"
                      disabled={pageSafe <= 0}
                      onClick={() => setPage(pageSafe - 1)}
                    >
                      Anterior
                    </button>
                    <span className="cuad-desdobles-page-label">
                      Página {pageSafe + 1} / {totalPages}
                    </span>
                    <button
                      type="button"
                      className="btn secondary sm"
                      disabled={pageSafe >= totalPages - 1}
                      onClick={() => setPage(pageSafe + 1)}
                    >
                      Siguiente
                    </button>
                  </div>
                </footer>
              </>
            )}
          </details>
        )
      ) : showDes && parte === 'desdobles' ? (
        <div className="panel cuad-desdobles-bar">
          <div className="cuad-desdobles-bar-copy">
            <h2>Desdobles</h2>
            <p className="muted">No hay desdobles en este período.</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
