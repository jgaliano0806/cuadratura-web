import { FormEvent, useMemo, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { firstIssueFor, validateDateRange } from '../lib/dateRange';
import { useLocalStorage } from '../lib/useLocalStorage';
import { downloadCsv } from '../lib/csv';
import {
  DateRangePresets,
  EmptyState,
  SkeletonTable,
  useToast,
} from '../components/ui';

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

type Filtros = {
  from: string;
  to: string;
  sinDesdoblar: boolean;
  permitirMovil4: boolean;
};

const STORAGE_KEY = 'sv_ocupacion_filtros_v1';
const MOVILES = [1, 2, 3, 4, 5];
const TURNOS: Array<{ code: 'M' | 'T' | 'N'; label: string }> = [
  { code: 'M', label: 'Mañana' },
  { code: 'T', label: 'Tarde' },
  { code: 'N', label: 'Noche' },
];

const DEFAULTS: Filtros = {
  from: '',
  to: '',
  sinDesdoblar: false,
  permitirMovil4: false,
};

/** Un color por estado: el tablero se lee de un vistazo, sin leer números. */
const TONO: Record<EstadoOcupacion, { bg: string; fg: string; label: string }> = {
  HUECO: { bg: 'var(--danger-bg, #fde8e8)', fg: 'var(--danger-fg, #9c0006)', label: 'Sin cobertura' },
  CUBIERTA: { bg: 'var(--ok-bg, #dff3e3)', fg: 'var(--ok-fg, #1b6b32)', label: 'Un inspector' },
  DOBLE: { bg: 'var(--warn-bg, #fdf3d7)', fg: 'var(--warn-fg, #8a6100)', label: 'Dos (normal)' },
  SUPERPUESTA: { bg: '#7a1020', fg: '#ffffff', label: 'Tres o más' },
};

function fechaCorta(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

export function OcupacionPage() {
  const toast = useToast();
  const [filtros, setFiltros] = useLocalStorage<Filtros>(STORAGE_KEY, DEFAULTS);
  const [data, setData] = useState<Ocupacion | null>(null);
  const [desdobles, setDesdobles] = useState<Desdoble[]>([]);
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState({ from: false, to: false });

  const issues = useMemo(() => {
    if (!filtros.from && !filtros.to) return [];
    return validateDateRange(filtros.from, filtros.to, { required: true });
  }, [filtros.from, filtros.to]);

  const fromError = touched.from || touched.to ? firstIssueFor(issues, 'from') : '';
  const toError = touched.from || touched.to ? firstIssueFor(issues, 'to') : '';
  const rangeError = touched.from || touched.to ? firstIssueFor(issues, 'range') : '';
  const valido = issues.length === 0;

  const fechas = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.slots.map((s) => s.date))].sort();
  }, [data]);

  /** Índice para pintar la grilla sin recorrer el array en cada celda. */
  const porClave = useMemo(() => {
    const map = new Map<string, Slot>();
    for (const s of data?.slots ?? []) {
      map.set(`${s.date}|${s.movil}|${s.turno}`, s);
    }
    return map;
  }, [data]);

  async function buscar(e?: FormEvent) {
    e?.preventDefault();
    setTouched({ from: true, to: true });
    if (issues.length) {
      toast.warning(issues[0].message, 'Rango inválido');
      return;
    }
    setBusy(true);
    try {
      const body = JSON.stringify({
        date_from: filtros.from,
        date_to: filtros.to,
        sin_desdoblar: filtros.sinDesdoblar,
        permitir_movil4: filtros.permitirMovil4,
      });
      const ocupacion = await api<Ocupacion>('/schedule-engine/ocupacion', {
        method: 'POST',
        body,
      });
      setData(ocupacion);

      if (!filtros.sinDesdoblar) {
        const det = await api<{ desdobles: Desdoble[] }>(
          '/schedule-engine/desdobles/preview',
          {
            method: 'POST',
            body: JSON.stringify({
              date_from: filtros.from,
              date_to: filtros.to,
              permitir_movil4: filtros.permitirMovil4,
            }),
          },
        );
        setDesdobles(det.desdobles);
      } else {
        setDesdobles([]);
      }
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'No se pudo calcular la ocupación.',
      );
    } finally {
      setBusy(false);
    }
  }

  function exportar() {
    if (!data) return;
    const header = ['Móvil', 'Turno', ...fechas.map(fechaCorta)];
    const lines: unknown[][] = [header];
    for (const movil of MOVILES) {
      for (const turno of TURNOS) {
        lines.push([
          movil,
          turno.label,
          ...fechas.map(
            (f) => porClave.get(`${f}|${movil}|${turno.code}`)?.cantidad ?? 0,
          ),
        ]);
      }
    }
    downloadCsv(`ocupacion-${data.date_from}_${data.date_to}.csv`, lines);
    toast.success('Ocupación exportada a CSV.');
  }

  const sinResolver = desdobles.filter((d) => d.estado === 'SIN_DESTINO');

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <h1>Ocupación por móvil</h1>
          <p>
            Cuántos inspectores quedaron en cada móvil y turno. Uno es el objetivo,
            dos es reparto normal, tres exige desdoblar.
          </p>
        </div>
      </header>

      <section className="panel">
        <DateRangePresets
          from={filtros.from}
          to={filtros.to}
          onApply={(f, t) => {
            setTouched({ from: true, to: true });
            setFiltros((prev) => ({ ...prev, from: f, to: t }));
          }}
          include={['this-month', 'next-month', 'next-30', 'next-90']}
        />

        <form className="filters" onSubmit={buscar} noValidate>
          <div className="field">
            <label htmlFor="oc-from">Desde</label>
            <input
              id="oc-from"
              type="date"
              max={filtros.to || undefined}
              value={filtros.from}
              aria-invalid={Boolean(fromError)}
              className={fromError ? 'input-invalid' : undefined}
              onBlur={() => setTouched((t) => ({ ...t, from: true }))}
              onChange={(e) =>
                setFiltros((p) => ({ ...p, from: e.target.value }))
              }
            />
            {fromError ? (
              <p className="field-error" role="alert">
                {fromError}
              </p>
            ) : null}
          </div>
          <div className="field">
            <label htmlFor="oc-to">Hasta</label>
            <input
              id="oc-to"
              type="date"
              min={filtros.from || undefined}
              value={filtros.to}
              aria-invalid={Boolean(toError)}
              className={toError ? 'input-invalid' : undefined}
              onBlur={() => setTouched((t) => ({ ...t, to: true }))}
              onChange={(e) => setFiltros((p) => ({ ...p, to: e.target.value }))}
            />
            {toError ? (
              <p className="field-error" role="alert">
                {toError}
              </p>
            ) : null}
          </div>
          <div className="field">
            <label htmlFor="oc-crudo">Vista</label>
            <select
              id="oc-crudo"
              value={filtros.sinDesdoblar ? 'crudo' : 'desdoblada'}
              onChange={(e) =>
                setFiltros((p) => ({
                  ...p,
                  sinDesdoblar: e.target.value === 'crudo',
                }))
              }
            >
              <option value="desdoblada">Con desdobles aplicados</option>
              <option value="crudo">Reparto crudo (sin desdoblar)</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="oc-m4">Móvil 4 como destino</label>
            <select
              id="oc-m4"
              value={filtros.permitirMovil4 ? 'si' : 'no'}
              onChange={(e) =>
                setFiltros((p) => ({
                  ...p,
                  permitirMovil4: e.target.value === 'si',
                }))
              }
            >
              <option value="no">No (gestión manual)</option>
              <option value="si">Sí, si la pareja está llena</option>
            </select>
          </div>
          <button className="btn" type="submit" disabled={busy || !valido}>
            {busy ? 'Calculando…' : 'Calcular'}
          </button>
        </form>
        {rangeError ? (
          <p className="filters-errors" role="alert">
            {rangeError}
          </p>
        ) : null}
      </section>

      {data ? (
        <section className="panel summary-strip">
          <div>
            <strong style={{ color: TONO.CUBIERTA.fg }}>
              {data.totales.cubiertas}
            </strong>
            <span>Con un inspector</span>
          </div>
          <div>
            <strong style={{ color: TONO.DOBLE.fg }}>{data.totales.dobles}</strong>
            <span>Con dos</span>
          </div>
          <div>
            <strong style={{ color: TONO.SUPERPUESTA.bg }}>
              {data.totales.superpuestas}
            </strong>
            <span>Con tres o más</span>
          </div>
          <div>
            <strong style={{ color: TONO.HUECO.fg }}>{data.totales.huecos}</strong>
            <span>Sin cobertura</span>
          </div>
          {data.desdoblada ? (
            <div>
              <strong>{data.totales.desdobles_aplicados}</strong>
              <span>Desdobles aplicados</span>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="panel">
        <div className="toolbar no-print">
          <div className="stack-h" style={{ gap: 10, flexWrap: 'wrap' }}>
            {(Object.keys(TONO) as EstadoOcupacion[]).map((k) => (
              <span
                key={k}
                style={{
                  background: TONO[k].bg,
                  color: TONO[k].fg,
                  padding: '2px 9px',
                  borderRadius: 4,
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                {TONO[k].label}
              </span>
            ))}
          </div>
          <button
            type="button"
            className="btn secondary sm"
            onClick={exportar}
            disabled={!data}
          >
            Exportar CSV
          </button>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="data">
            <thead>
              <tr>
                <th style={{ position: 'sticky', left: 0 }}>Móvil</th>
                <th>Turno</th>
                {fechas.map((f) => (
                  <th key={f} style={{ textAlign: 'center', fontSize: 11 }}>
                    {fechaCorta(f)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {busy && !data ? (
                <SkeletonTable cols={8} rows={6} />
              ) : !data ? (
                <tr>
                  <td colSpan={4} style={{ padding: 0 }}>
                    <EmptyState
                      compact
                      title="Elegí un rango y calculá"
                      description="El tablero muestra cada móvil y turno día por día, con quiénes están asignados."
                    />
                  </td>
                </tr>
              ) : (
                MOVILES.flatMap((movil) =>
                  TURNOS.map((turno, i) => (
                    <tr key={`${movil}-${turno.code}`}>
                      {i === 0 ? (
                        <td
                          rowSpan={3}
                          style={{
                            fontWeight: 700,
                            textAlign: 'center',
                            position: 'sticky',
                            left: 0,
                          }}
                        >
                          {movil}
                          {movil === 4 ? (
                            <div style={{ fontSize: 10, fontWeight: 400 }}>
                              manual
                            </div>
                          ) : null}
                        </td>
                      ) : null}
                      <td style={{ whiteSpace: 'nowrap' }}>{turno.label}</td>
                      {fechas.map((f) => {
                        const slot = porClave.get(`${f}|${movil}|${turno.code}`);
                        const estado = slot?.estado ?? 'HUECO';
                        const tono = TONO[estado];
                        return (
                          <td
                            key={f}
                            title={
                              slot?.inspectores.length
                                ? slot.inspectores.join(', ')
                                : 'Sin inspectores asignados'
                            }
                            style={{
                              background: tono.bg,
                              color: tono.fg,
                              textAlign: 'center',
                              fontWeight: estado === 'SUPERPUESTA' ? 700 : 500,
                              fontVariantNumeric: 'tabular-nums',
                            }}
                          >
                            {slot?.cantidad ?? 0}
                          </td>
                        );
                      })}
                    </tr>
                  )),
                )
              )}
            </tbody>
          </table>
        </div>
        {data ? (
          <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
            {data.referencia} Pasá el mouse sobre una celda para ver quiénes están.
          </p>
        ) : null}
      </section>

      {desdobles.length ? (
        <section className="panel">
          <h2 style={{ marginTop: 0 }}>
            Desdobles ({desdobles.length})
            {sinResolver.length ? (
              <span
                className="badge pending"
                style={{ marginLeft: 10, fontSize: 12 }}
              >
                {sinResolver.length} sin resolver
              </span>
            ) : null}
          </h2>
          <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
            Con tres inspectores en un móvil se mueve a uno al móvil que comparte
            el horario de entrada, conservando el turno. Se elige al que menos
            veces le tocó; no interviene la antigüedad.
          </p>
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
              {desdobles.map((d, i) => (
                <tr key={`${d.date}-${d.movilOrigen}-${d.turno}-${i}`}>
                  <td style={{ whiteSpace: 'nowrap' }}>{fechaCorta(d.date)}</td>
                  <td>
                    {TURNOS.find((t) => t.code === d.turno)?.label ?? d.turno}
                  </td>
                  <td style={{ textAlign: 'center' }}>{d.movilOrigen}</td>
                  <td style={{ fontSize: 13 }}>{d.inspectores.join(', ')}</td>
                  <td>
                    <strong>{d.movido ?? '—'}</strong>
                  </td>
                  <td style={{ textAlign: 'center' }}>{d.movilDestino ?? '—'}</td>
                  <td style={{ fontSize: 12 }}>
                    <span
                      className={`badge ${
                        d.estado === 'RESUELTO' ? 'ok' : 'pending'
                      }`}
                      style={{ marginRight: 6 }}
                    >
                      {d.estado === 'RESUELTO' ? 'Resuelto' : 'Revisión manual'}
                    </span>
                    {d.motivo}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </div>
  );
}
