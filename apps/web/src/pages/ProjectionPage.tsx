import { FormEvent, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import {
  firstIssueFor,
  validateDateRange,
} from '../lib/dateRange';

type Preview = {
  date_from: string;
  date_to: string;
  positions: number;
  days_generated: number;
  note?: string;
  sample: Array<{
    date: string;
    inspectorName: string | null;
    positionCode: string;
    code: string;
    dayType: string;
  }>;
  by_code: Array<{ code: string; count: number }>;
};

type ApplyResult = {
  version_id: string;
  codigo: string;
  numero_version: number;
  days_inserted?: number;
  days_projected?: number;
  days_copied?: number;
  overlays_applied?: number;
  positions?: number;
  date_from: string;
  date_to: string;
  layer?: string;
  derived_from_plan?: string;
};

type WipeResult = {
  wiped: boolean;
  cronogramas_eliminados: number;
  reason: string;
  next: string;
};

type SwapResult = {
  registered: boolean;
  pair: Array<{ inspector: string; from_mobile: number; to_mobile: number }>;
  next: string;
};

const PROJECTION_MAX_DAYS = 370;

export function ProjectionPage() {
  const [dateFrom, setDateFrom] = useState('2026-08-01');
  const [dateTo, setDateTo] = useState('2026-08-31');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [applied, setApplied] = useState<ApplyResult | null>(null);
  const [wipeInfo, setWipeInfo] = useState<WipeResult | null>(null);
  const [swapInfo, setSwapInfo] = useState<SwapResult | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState({ from: false, to: false });

  const dateIssues = useMemo(
    () =>
      validateDateRange(dateFrom, dateTo, {
        required: true,
        maxDays: PROJECTION_MAX_DAYS,
      }),
    [dateFrom, dateTo],
  );
  const fromError =
    touched.from || touched.to ? firstIssueFor(dateIssues, 'from') : '';
  const toError =
    touched.from || touched.to ? firstIssueFor(dateIssues, 'to') : '';
  const rangeError =
    touched.from || touched.to ? firstIssueFor(dateIssues, 'range') : '';
  const datesValid = dateIssues.length === 0;

  async function runPreview(e?: FormEvent) {
    e?.preventDefault();
    setTouched({ from: true, to: true });
    if (dateIssues.length) {
      setError(dateIssues[0].message);
      setPreview(null);
      return;
    }
    setBusy(true);
    setError('');
    setApplied(null);
    try {
      const data = await api<Preview>('/schedule-engine/preview', {
        method: 'POST',
        body: JSON.stringify({ date_from: dateFrom, date_to: dateTo }),
        headers: { 'Content-Type': 'application/json' },
      });
      setPreview(data);
    } catch (err) {
      setPreview(null);
      setError(err instanceof ApiError ? err.message : 'Error en preview');
    } finally {
      setBusy(false);
    }
  }

  async function runApply() {
    setTouched({ from: true, to: true });
    if (dateIssues.length) {
      setError(dateIssues[0].message);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const data = await api<ApplyResult>('/schedule-engine/apply', {
        method: 'POST',
        body: JSON.stringify({ date_from: dateFrom, date_to: dateTo }),
        headers: { 'Content-Type': 'application/json' },
      });
      setApplied(data);
      setWipeInfo(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al aplicar');
    } finally {
      setBusy(false);
    }
  }

  async function runWipe() {
    const reason = window.prompt(
      'Motivo de tabula rasa PLANIFICADA (mín. 5 caracteres):',
      'Regeneración limpia sin overlays operativos',
    );
    if (!reason || reason.trim().length < 5) return;
    if (
      !window.confirm(
        'Se eliminarán TODOS los cronogramas PLANIFICADA. La BASE no se toca. ¿Continuar?',
      )
    ) {
      return;
    }
    setBusy(true);
    setError('');
    try {
      const data = await api<WipeResult>('/schedule-engine/wipe-planificada', {
        method: 'POST',
        body: JSON.stringify({ reason: reason.trim() }),
        headers: { 'Content-Type': 'application/json' },
      });
      setWipeInfo(data);
      setApplied(null);
      setPreview(null);
      setSwapInfo(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error en tabula rasa');
    } finally {
      setBusy(false);
    }
  }

  async function runPairSwap() {
    setTouched({ from: true, to: true });
    if (dateIssues.length) {
      setError(dateIssues[0].message);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const data = await api<SwapResult>('/schedule-engine/linked-pair/swap', {
        method: 'POST',
        body: JSON.stringify({
          date_from: dateFrom,
          date_to: dateTo,
          reason: `Intercambio Haro–Ramos ${dateFrom}→${dateTo}`,
        }),
        headers: { 'Content-Type': 'application/json' },
      });
      setSwapInfo(data);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Error al registrar intercambio',
      );
    } finally {
      setBusy(false);
    }
  }

  async function runApplyReal() {
    setTouched({ from: true, to: true });
    if (dateIssues.length) {
      setError(dateIssues[0].message);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const data = await api<ApplyResult>('/schedule-engine/apply-real', {
        method: 'POST',
        body: JSON.stringify({ date_from: dateFrom, date_to: dateTo }),
        headers: { 'Content-Type': 'application/json' },
      });
      setApplied(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al generar REAL');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <h1>Motor de proyección</h1>
          <p>
            PLANIFICADA = ciclo 5×3 limpio. REAL = plan + overlays operativos
            (dupla Haro–Ramos).
          </p>
        </div>
      </header>

      {error ? <div className="error-box">{error}</div> : null}
      {wipeInfo ? (
        <div className="panel">
          Tabula rasa OK: {wipeInfo.cronogramas_eliminados} cronograma(s)
          eliminado(s). {wipeInfo.next}
        </div>
      ) : null}
      {swapInfo ? (
        <div className="panel">
          Intercambio registrado:{' '}
          {swapInfo.pair
            .map((p) => `${p.inspector} ${p.from_mobile}→${p.to_mobile}`)
            .join(' · ')}
          . {swapInfo.next}
        </div>
      ) : null}
      {applied ? (
        <div className="panel">
          Versión {applied.layer ? `(${applied.layer}) ` : ''}
          <strong>{applied.codigo}</strong> v{applied.numero_version}
          {applied.days_inserted != null
            ? ` · ${applied.days_inserted} días`
            : null}
          {applied.days_copied != null
            ? ` · ${applied.days_copied} copiados`
            : null}
          {applied.overlays_applied != null
            ? ` · ${applied.overlays_applied} overlays`
            : null}
          {applied.derived_from_plan
            ? ` · desde ${applied.derived_from_plan}`
            : null}
          .{' '}
          <Link to="/calendario">Ver en Cronograma</Link>
        </div>
      ) : null}

      <section className="panel">
        <form className="filters" onSubmit={runPreview} noValidate>
          <div className="field">
            <label htmlFor="from">Desde</label>
            <input
              id="from"
              type="date"
              required
              max={dateTo || undefined}
              value={dateFrom}
              aria-invalid={Boolean(fromError)}
              className={fromError ? 'input-invalid' : undefined}
              onBlur={() => setTouched((t) => ({ ...t, from: true }))}
              onChange={(e) => setDateFrom(e.target.value)}
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
              required
              min={dateFrom || undefined}
              value={dateTo}
              aria-invalid={Boolean(toError)}
              className={toError ? 'input-invalid' : undefined}
              onBlur={() => setTouched((t) => ({ ...t, to: true }))}
              onChange={(e) => setDateTo(e.target.value)}
            />
            {toError ? (
              <p className="field-error" role="alert">
                {toError}
              </p>
            ) : null}
          </div>
          <button
            className="btn secondary"
            type="submit"
            disabled={busy || !datesValid}
          >
            Vista previa PLAN
          </button>
          <button
            className="btn amber"
            type="button"
            disabled={busy || !datesValid || !preview}
            onClick={() => void runApply()}
          >
            Generar PLANIFICADA
          </button>
          <button
            className="btn"
            type="button"
            disabled={busy || !datesValid}
            onClick={() => void runPairSwap()}
          >
            Registrar swap Haro–Ramos
          </button>
          <button
            className="btn"
            type="button"
            disabled={busy || !datesValid}
            onClick={() => void runApplyReal()}
          >
            Generar REAL
          </button>
          <button
            className="btn secondary"
            type="button"
            disabled={busy}
            onClick={() => void runWipe()}
          >
            Tabula rasa PLAN
          </button>
        </form>
        {rangeError ? (
          <p className="filters-errors" role="alert">
            {rangeError}
          </p>
        ) : (
          <p className="muted" style={{ marginBottom: 0 }}>
            1) Tabula rasa PLAN si hace falta · 2) Vista previa + Generar
            PLANIFICADA · 3) Registrar swap Haro–Ramos · 4) Generar REAL.
            Máximo {PROJECTION_MAX_DAYS} días.
          </p>
        )}
      </section>

      {preview ? (
        <>
          <section className="panel summary-strip">
            <div>
              <strong>{preview.positions}</strong>
              <span>Posiciones</span>
            </div>
            <div>
              <strong>{preview.days_generated}</strong>
              <span>Días proyectados</span>
            </div>
            <div>
              <strong>
                {preview.date_from} → {preview.date_to}
              </strong>
              <span>Período</span>
            </div>
          </section>
          {preview.note ? (
            <p className="muted" style={{ marginTop: 0 }}>
              {preview.note}
            </p>
          ) : null}

          <section className="panel">
            <h2 style={{ marginTop: 0, fontFamily: 'var(--font-display)' }}>
              Distribución de códigos
            </h2>
            <div className="xlsx-scroll">
              <table className="data">
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Cantidad</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.by_code.map((r) => (
                    <tr key={r.code}>
                      <td>{r.code}</td>
                      <td>{r.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel">
            <h2 style={{ marginTop: 0, fontFamily: 'var(--font-display)' }}>
              Muestra
            </h2>
            <div className="xlsx-scroll">
              <table className="data">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Inspector</th>
                    <th>Posición</th>
                    <th>Código</th>
                    <th>Tipo</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.sample.map((r, i) => (
                    <tr key={`${r.date}-${r.positionCode}-${i}`}>
                      <td>{r.date}</td>
                      <td>{r.inspectorName ?? '—'}</td>
                      <td>{r.positionCode}</td>
                      <td>{r.code}</td>
                      <td>{r.dayType}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
