import { FormEvent, useMemo, useState } from 'react';
import { api } from '../lib/api';
import {
  firstIssueFor,
  validateDateRange,
} from '../lib/dateRange';

type Gap = {
  fecha_operativa: string;
  movil: number;
  turno: string;
  estado_aceptacion: string;
  motivo_hueco: string | null;
  responsable_aceptacion: string | null;
};

const GAPS_MAX_DAYS = 370;

export function GapsPage() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [mobile, setMobile] = useState('');
  const [shift, setShift] = useState('');
  const [acceptance, setAcceptance] = useState('');
  const [rows, setRows] = useState<Gap[]>([]);
  const [error, setError] = useState('');
  const [touched, setTouched] = useState({ from: false, to: false });

  const dateIssues = useMemo(() => {
    if (!from && !to) return [];
    return validateDateRange(from, to, {
      required: true,
      maxDays: GAPS_MAX_DAYS,
    });
  }, [from, to]);
  const fromError =
    touched.from || touched.to ? firstIssueFor(dateIssues, 'from') : '';
  const toError =
    touched.from || touched.to ? firstIssueFor(dateIssues, 'to') : '';
  const rangeError =
    touched.from || touched.to ? firstIssueFor(dateIssues, 'range') : '';
  const datesValid = dateIssues.length === 0;

  async function load(e?: FormEvent) {
    e?.preventDefault();
    setTouched({ from: true, to: true });
    if (dateIssues.length) {
      setError(dateIssues[0].message);
      return;
    }
    setError('');
    const q = new URLSearchParams();
    if (from) q.set('date_from', from);
    if (to) q.set('date_to', to);
    if (mobile) q.set('mobile', mobile);
    if (shift) q.set('shift', shift);
    if (acceptance) q.set('acceptance', acceptance);
    try {
      setRows(await api<Gap[]>(`/reports/gaps?${q.toString()}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    }
  }

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <h1>Huecos de cobertura</h1>
          <p>Objetivo 1, máximo 2; cero genera hueco con alerta.</p>
        </div>
      </header>

      {error ? <div className="error-box">{error}</div> : null}

      <section className="panel">
        <form className="filters" onSubmit={load} noValidate>
          <div className="field">
            <label htmlFor="from">Desde</label>
            <input
              id="from"
              type="date"
              max={to || undefined}
              value={from}
              aria-invalid={Boolean(fromError)}
              className={fromError ? 'input-invalid' : undefined}
              onBlur={() => setTouched((t) => ({ ...t, from: true }))}
              onChange={(e) => setFrom(e.target.value)}
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
              min={from || undefined}
              value={to}
              aria-invalid={Boolean(toError)}
              className={toError ? 'input-invalid' : undefined}
              onBlur={() => setTouched((t) => ({ ...t, to: true }))}
              onChange={(e) => setTo(e.target.value)}
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
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
            >
              <option value="">Todos</option>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="shift">Turno</label>
            <select
              id="shift"
              value={shift}
              onChange={(e) => setShift(e.target.value)}
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
              value={acceptance}
              onChange={(e) => setAcceptance(e.target.value)}
            >
              <option value="">Todos</option>
              <option value="PENDIENTE">PENDIENTE</option>
              <option value="JUSTIFICADO">JUSTIFICADO</option>
            </select>
          </div>
          <button className="btn" type="submit" disabled={!datesValid}>
            Buscar
          </button>
        </form>
        {rangeError ? (
          <p className="filters-errors" role="alert">
            {rangeError}
          </p>
        ) : null}

        <table className="data">
          <caption
            className="muted"
            style={{ textAlign: 'left', paddingBottom: 8 }}
          >
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
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="muted">
                  No hay huecos para los filtros seleccionados.
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr
                  key={`${row.fecha_operativa}-${row.movil}-${row.turno}-${i}`}
                >
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
