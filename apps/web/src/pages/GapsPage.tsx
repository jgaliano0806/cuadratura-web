import { FormEvent, useEffect, useMemo, useState } from 'react';
import { PLANNING_MAX_DAYS } from '@plataforma/shared';
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

type Gap = {
  fecha_operativa: string;
  movil: number;
  turno: string;
  estado_aceptacion: string;
  motivo_hueco: string | null;
  responsable_aceptacion: string | null;
};

type GapsFilters = {
  from: string;
  to: string;
  mobile: string;
  shift: string;
  acceptance: string;
};

const GAPS_MAX_DAYS = PLANNING_MAX_DAYS;
const STORAGE_KEY = 'sv_gaps_filters_v1';
const MOBILES = [1, 2, 3, 4, 5, 6, 7];

const DEFAULT_FILTERS: GapsFilters = {
  from: '',
  to: '',
  mobile: '',
  shift: '',
  acceptance: '',
};

export function GapsPage() {
  const toast = useToast();
  const [filters, setFilters] = useLocalStorage<GapsFilters>(
    STORAGE_KEY,
    DEFAULT_FILTERS,
  );
  const [rows, setRows] = useState<Gap[]>([]);
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState({ from: false, to: false });

  const dateIssues = useMemo(() => {
    if (!filters.from && !filters.to) return [];
    return validateDateRange(filters.from, filters.to, {
      required: true,
      maxDays: GAPS_MAX_DAYS,
    });
  }, [filters.from, filters.to]);

  const fromError =
    touched.from || touched.to ? firstIssueFor(dateIssues, 'from') : '';
  const toError =
    touched.from || touched.to ? firstIssueFor(dateIssues, 'to') : '';
  const rangeError =
    touched.from || touched.to ? firstIssueFor(dateIssues, 'range') : '';
  const datesValid = dateIssues.length === 0;

  function update<K extends keyof GapsFilters>(key: K, value: GapsFilters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  async function load(e?: FormEvent) {
    e?.preventDefault();
    setTouched({ from: true, to: true });
    if (dateIssues.length) {
      toast.warning(dateIssues[0].message, 'Rango inválido');
      return;
    }
    setBusy(true);
    const q = new URLSearchParams();
    if (filters.from) q.set('date_from', filters.from);
    if (filters.to) q.set('date_to', filters.to);
    if (filters.mobile) q.set('mobile', filters.mobile);
    if (filters.shift) q.set('shift', filters.shift);
    if (filters.acceptance) q.set('acceptance', filters.acceptance);
    try {
      const data = await api<Gap[]>(`/reports/gaps?${q.toString()}`);
      setRows(data);
      if (!data.length) {
        toast.info('No hay huecos para los filtros seleccionados.', 'Sin resultados');
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error al buscar huecos.');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (filters.from && filters.to && datesValid) {
      void load();
    }
    // Autoload sólo al montar con filtros válidos persistidos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totals = useMemo(() => {
    const t = { total: rows.length, pendientes: 0, justificados: 0 };
    for (const r of rows) {
      if (r.estado_aceptacion === 'PENDIENTE') t.pendientes += 1;
      else if (r.estado_aceptacion === 'JUSTIFICADO') t.justificados += 1;
    }
    return t;
  }, [rows]);

  const byMobile = useMemo(() => {
    const map = new Map<number, number>();
    for (const r of rows) map.set(r.movil, (map.get(r.movil) ?? 0) + 1);
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [rows]);

  function exportCsv() {
    if (!rows.length) {
      toast.info('Nada para exportar todavía.');
      return;
    }
    const header = ['Fecha', 'Móvil', 'Turno', 'Estado', 'Motivo', 'Responsable'];
    const lines: unknown[][] = [header];
    for (const r of rows) {
      lines.push([
        r.fecha_operativa,
        r.movil,
        r.turno,
        r.estado_aceptacion,
        r.motivo_hueco ?? '',
        r.responsable_aceptacion ?? '',
      ]);
    }
    const suffix =
      filters.from && filters.to
        ? `${filters.from}_${filters.to}`
        : new Date().toISOString().slice(0, 10);
    downloadCsv(`huecos-${suffix}.csv`, lines);
    toast.success('Huecos exportados a CSV.');
  }

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <h1>Huecos de cobertura</h1>
          <p>Objetivo 1, máximo 2; cero genera hueco con alerta.</p>
        </div>
      </header>

      <section className="panel">
        <DateRangePresets
          from={filters.from}
          to={filters.to}
          onApply={(f, t) => {
            setTouched({ from: true, to: true });
            setFilters((prev) => ({ ...prev, from: f, to: t }));
          }}
          include={['this-week', 'this-month', 'next-month', 'next-30', 'next-90']}
        />

        <form className="filters" onSubmit={load} noValidate>
          <div className="field">
            <label htmlFor="from">Desde</label>
            <input
              id="from"
              type="date"
              max={filters.to || undefined}
              value={filters.from}
              aria-invalid={Boolean(fromError)}
              className={fromError ? 'input-invalid' : undefined}
              onBlur={() => setTouched((t) => ({ ...t, from: true }))}
              onChange={(e) => update('from', e.target.value)}
            />
            {fromError ? (
              <p className="field-error" role="alert">
                {fromError}
              </p>
            ) : null}
          </div>
          <div className="field">
            <label htmlFor="to">Hasta</label>
            <input
              id="to"
              type="date"
              min={filters.from || undefined}
              value={filters.to}
              aria-invalid={Boolean(toError)}
              className={toError ? 'input-invalid' : undefined}
              onBlur={() => setTouched((t) => ({ ...t, to: true }))}
              onChange={(e) => update('to', e.target.value)}
            />
            {toError ? (
              <p className="field-error" role="alert">
                {toError}
              </p>
            ) : null}
          </div>
          <div className="field">
            <label htmlFor="mobile">Móvil</label>
            <select
              id="mobile"
              value={filters.mobile}
              onChange={(e) => update('mobile', e.target.value)}
            >
              <option value="">Todos</option>
              {MOBILES.map((n) => (
                <option key={n} value={n}>
                  Móvil {n}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="shift">Turno</label>
            <select
              id="shift"
              value={filters.shift}
              onChange={(e) => update('shift', e.target.value)}
            >
              <option value="">Todos</option>
              <option value="M">Mañana</option>
              <option value="T">Tarde</option>
              <option value="N">Noche</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="acc">Aceptación</label>
            <select
              id="acc"
              value={filters.acceptance}
              onChange={(e) => update('acceptance', e.target.value)}
            >
              <option value="">Todos</option>
              <option value="PENDIENTE">Pendiente</option>
              <option value="JUSTIFICADO">Justificado</option>
            </select>
          </div>
          <button className="btn" type="submit" disabled={busy || !datesValid}>
            {busy ? 'Buscando…' : 'Buscar'}
          </button>
          {filters.mobile || filters.shift || filters.acceptance ? (
            <button
              type="button"
              className="btn secondary"
              onClick={() =>
                setFilters((prev) => ({
                  ...prev,
                  mobile: '',
                  shift: '',
                  acceptance: '',
                }))
              }
            >
              Limpiar filtros
            </button>
          ) : null}
        </form>
        {rangeError ? (
          <p className="filters-errors" role="alert">
            {rangeError}
          </p>
        ) : null}
      </section>

      {rows.length ? (
        <section className="panel summary-strip">
          <div>
            <strong>{totals.total}</strong>
            <span>Huecos totales</span>
          </div>
          <div>
            <strong style={{ color: 'var(--danger-fg)' }}>{totals.pendientes}</strong>
            <span>Pendientes</span>
          </div>
          <div>
            <strong style={{ color: 'var(--ok-fg)' }}>{totals.justificados}</strong>
            <span>Justificados</span>
          </div>
          {byMobile.map(([m, n]) => (
            <div key={m}>
              <strong>{n}</strong>
              <span>Móvil {m}</span>
            </div>
          ))}
        </section>
      ) : null}

      <section className="panel">
        <div className="toolbar no-print">
          <button
            type="button"
            className="btn secondary sm"
            onClick={exportCsv}
            disabled={!rows.length}
          >
            Exportar CSV
          </button>
          <button
            type="button"
            className="btn secondary sm"
            onClick={() => window.print()}
            disabled={!rows.length}
          >
            Imprimir / PDF
          </button>
        </div>
        <table className="data">
          <caption className="muted" style={{ textAlign: 'left', paddingBottom: 8 }}>
            Resultados del tablero
          </caption>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Móvil</th>
              <th>Turno</th>
              <th>Estado</th>
              <th>Motivo</th>
              <th>Responsable</th>
            </tr>
          </thead>
          <tbody>
            {busy && !rows.length ? (
              <SkeletonTable cols={6} rows={5} />
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: 0 }}>
                  <EmptyState
                    compact
                    title="Sin huecos en el rango"
                    description="Buscá con un rango más amplio o cambiá los filtros de móvil, turno y aceptación."
                  />
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr key={`${row.fecha_operativa}-${row.movil}-${row.turno}-${i}`}>
                  <td>{row.fecha_operativa}</td>
                  <td>{row.movil}</td>
                  <td>{row.turno}</td>
                  <td>
                    <span
                      className={`badge ${
                        row.estado_aceptacion === 'PENDIENTE' ? 'pending' : 'ok'
                      }`}
                    >
                      {row.estado_aceptacion}
                    </span>
                  </td>
                  <td>{row.motivo_hueco ?? ''}</td>
                  <td>{row.responsable_aceptacion ?? ''}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
