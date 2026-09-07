import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type UIEvent } from 'react';
import { api, ApiError } from '../../lib/api';
import { bajarExcelPost } from '../../lib/xlsxDownload';
import { EmptyState, ExcelMenu, SkeletonTable, useToast } from '../ui';
import { useBoxTheme } from '../../lib/boxTheme';

type EstadoOcupacion = 'HUECO' | 'CUBIERTA' | 'DOBLE' | 'SUPERPUESTA';

type Slot = {
  date: string;
  movil: number;
  turno: 'M' | 'T' | 'N';
  franja: 'TEMPRANA' | 'TARDIA' | null;
  cantidad: number;
  inspectores: string[];
  estado: EstadoOcupacion;
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

const MOVILES = [1, 2, 3, 4, 5];
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
};

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

export function OcupacionBoard({ from, to, enabled = true, parte = 'todo' }: Props) {
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

  const [desplegado, setDesplegado] = useState(false);
  const labelsRef = useRef<HTMLDivElement>(null);
  const datesRef = useRef<HTMLDivElement>(null);
  const syncingY = useRef(false);

  function syncScrollY(origen: 'labels' | 'dates', e: UIEvent<HTMLDivElement>) {
    if (syncingY.current) return;
    const dst = origen === 'labels' ? datesRef.current : labelsRef.current;
    if (!dst) return;
    syncingY.current = true;
    dst.scrollTop = e.currentTarget.scrollTop;
    requestAnimationFrame(() => {
      syncingY.current = false;
    });
  }

  const fechas = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.slots.map((s) => s.date))].sort();
  }, [data]);

  const porClave = useMemo(() => {
    const map = new Map<string, Slot>();
    for (const s of data?.slots ?? []) {
      map.set(`${s.date}|${s.movil}|${s.turno}`, s);
    }
    return map;
  }, [data]);

  const pendientes = useMemo(
    () => desdobles.filter((d) => d.estado === 'SIN_DESTINO'),
    [desdobles],
  );
  const lista = verResueltos ? desdobles : pendientes;
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
    if (!data) return;
    setExportBusy('ocupacion');
    try {
      const header = ['Móvil', 'Turno', ...fechas.map(fechaCorta)];
      const grid = MOVILES.flatMap((movil) =>
        TURNOS.map((turno) => [
          movil,
          turno.label,
          ...fechas.map((f) => porClave.get(`${f}|${movil}|${turno.code}`)?.cantidad ?? 0),
        ]),
      );
      const detalle = (data.slots ?? []).map((s) => [
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
          fileName: `Ocupacion_${data.date_from}_${data.date_to}.xlsx`,
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
    if (!desdobles.length) return;
    setExportBusy('desdobles');
    try {
      const rows = desdobles.map((d) => [
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

  return (
    <div
      className={`${parte === 'todo' ? 'cuad-ocupacion stack' : 'cuad-dock-slot'}${
        busy && data ? ' is-refreshing' : ''
      }`}
    >
      {showOc ? (
      <section
        className={`panel oc-panel${panelOculto ? ' is-collapsed' : ''}`}
        aria-label="Ocupación por móvil"
      >
        <header className="oc-headbar">
          <h2 className="oc-title">Ocupación</h2>
          {data ? (
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
                      <strong>{data.totales[TONO[k].kpi]}</strong>
                      <span>{TONO[k].label}</span>
                    </li>
                  );
                })}
            </ul>
          ) : null}
          <div className="oc-headbar-actions">
            <ExcelMenu
              busy={exportBusy === 'ocupacion'}
              disabled={!data || busy || Boolean(exportBusy)}
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

        {panelOculto ? null : busy && !data ? (
          <SkeletonTable cols={8} rows={6} />
        ) : !data ? (
          <EmptyState
            compact
            title={busy ? 'Calculando ocupación…' : 'Sin ocupación para el período'}
            description="Usa el mismo Desde / Hasta que la grilla."
          />
        ) : (
          <div className="oc-freeze">
            <div
              className="oc-labels-col"
              ref={labelsRef}
              onScroll={(e) => syncScrollY('labels', e)}
            >
              <table className="oc-labels">
                <thead>
                  <tr>
                    <th>Móvil</th>
                    <th>Turno</th>
                  </tr>
                </thead>
                <tbody>
                  {MOVILES.flatMap((movil) =>
                    TURNOS.map((turno, i) => (
                      <tr
                        key={`${movil}-${turno.code}`}
                        className={i === 0 ? 'oc-movil-start' : undefined}
                      >
                        <td className="oc-movil-cell">
                          {i === 0 ? (
                            <>
                              {movil}
                              {movil === 4 ? (
                                <span className="oc-movil-hint">manual</span>
                              ) : null}
                            </>
                          ) : null}
                        </td>
                        <td>{turno.label}</td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </div>
            <div
              className="oc-dates-col"
              ref={datesRef}
              onScroll={(e) => syncScrollY('dates', e)}
            >
              <table className="oc-dates">
                <thead>
                  <tr>
                    {fechas.map((f) => (
                      <th key={f}>{fechaCorta(f)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {MOVILES.flatMap((movil) =>
                    TURNOS.map((turno, i) => (
                      <tr
                        key={`${movil}-${turno.code}`}
                        className={i === 0 ? 'oc-movil-start' : undefined}
                      >
                        {fechas.map((f) => {
                          const slot = porClave.get(`${f}|${movil}|${turno.code}`);
                          const estado = slot?.estado ?? 'HUECO';
                          const tono =
                            turno.code === 'M'
                              ? 'manana'
                              : turno.code === 'T'
                                ? 'tarde'
                                : 'noche';
                          const extra =
                            estado === 'HUECO'
                              ? ' oc-slot-hueco'
                              : estado === 'SUPERPUESTA'
                                ? ' oc-slot-super'
                                : '';
                          return (
                            <td
                              key={f}
                              className={`sap-cell-${tono}${extra}`}
                              title={
                                slot?.inspectores.length
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
                </tbody>
              </table>
            </div>
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
                disabled={Boolean(exportBusy) || !desdobles.length}
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
                disabled={Boolean(exportBusy) || !desdobles.length}
                items={[{ id: 'desdobles', label: 'Desdobles' }]}
                onPick={() => void exportarDesdobles()}
              />
              <button type="button" className="btn secondary sm" onClick={ocultarDesdobles}>
                Ocultar
              </button>
            </header>
            {lista.length === 0 ? (
              <p className="muted cuad-desdobles-empty">No hay desdobles pendientes.</p>
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
