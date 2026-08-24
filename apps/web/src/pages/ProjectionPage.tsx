import { FormEvent, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PLANNING_MAX_DAYS } from '@plataforma/shared';
import { api, ApiError } from '../lib/api';
import { firstIssueFor, validateDateRange } from '../lib/dateRange';
import {
  ConfirmDialog,
  DateRangePresets,
  useToast,
} from '../components/ui';

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

const PROJECTION_MAX_DAYS = PLANNING_MAX_DAYS;

type Step = 1 | 2 | 3 | 4;

export function ProjectionPage() {
  const toast = useToast();
  const [dateFrom, setDateFrom] = useState('2026-08-01');
  const [dateTo, setDateTo] = useState('2026-08-31');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [applied, setApplied] = useState<ApplyResult | null>(null);
  const [wipeInfo, setWipeInfo] = useState<WipeResult | null>(null);
  const [swapInfo, setSwapInfo] = useState<SwapResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState({ from: false, to: false });
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [confirmApply, setConfirmApply] = useState(false);
  const [confirmSwap, setConfirmSwap] = useState(false);
  const [confirmReal, setConfirmReal] = useState(false);

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

  const currentStep: Step = useMemo(() => {
    if (applied) return 4;
    if (preview) return 2;
    return 1;
  }, [preview, applied]);

  async function runPreview(e?: FormEvent) {
    e?.preventDefault();
    setTouched({ from: true, to: true });
    if (dateIssues.length) {
      toast.warning(dateIssues[0].message, 'Rango inválido');
      setPreview(null);
      return;
    }
    setBusy(true);
    setApplied(null);
    try {
      const data = await api<Preview>('/schedule-engine/preview', {
        method: 'POST',
        body: JSON.stringify({ date_from: dateFrom, date_to: dateTo }),
      });
      setPreview(data);
      toast.success(
        `${data.positions} posiciones · ${data.days_generated} días proyectados`,
        'Vista previa OK',
      );
    } catch (err) {
      setPreview(null);
      toast.error(err instanceof ApiError ? err.message : 'Error en preview');
    } finally {
      setBusy(false);
    }
  }

  async function runApply() {
    setConfirmApply(false);
    setBusy(true);
    try {
      const data = await api<ApplyResult>('/schedule-engine/apply', {
        method: 'POST',
        body: JSON.stringify({ date_from: dateFrom, date_to: dateTo }),
      });
      setApplied(data);
      setWipeInfo(null);
      toast.success(
        `Versión ${data.codigo} v${data.numero_version} generada.`,
        'PLANIFICADA creada',
      );
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error al aplicar');
    } finally {
      setBusy(false);
    }
  }

  async function runWipe(reason?: string) {
    if (!reason) return;
    setConfirmWipe(false);
    setBusy(true);
    try {
      const data = await api<WipeResult>('/schedule-engine/wipe-planificada', {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
      setWipeInfo(data);
      setApplied(null);
      setPreview(null);
      setSwapInfo(null);
      toast.warning(
        `${data.cronogramas_eliminados} cronograma(s) PLANIFICADA eliminado(s).`,
        'Tabula rasa aplicada',
      );
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error en tabula rasa');
    } finally {
      setBusy(false);
    }
  }

  async function runPairSwap() {
    setConfirmSwap(false);
    if (dateIssues.length) {
      toast.warning(dateIssues[0].message, 'Rango inválido');
      return;
    }
    setBusy(true);
    try {
      const data = await api<SwapResult>('/schedule-engine/linked-pair/swap', {
        method: 'POST',
        body: JSON.stringify({
          date_from: dateFrom,
          date_to: dateTo,
          reason: `Intercambio Haro–Ramos ${dateFrom}→${dateTo}`,
        }),
      });
      setSwapInfo(data);
      toast.success(
        data.pair.map((p) => `${p.inspector} ${p.from_mobile}→${p.to_mobile}`).join(' · '),
        'Swap registrado',
      );
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error al registrar intercambio');
    } finally {
      setBusy(false);
    }
  }

  async function runApplyReal() {
    setConfirmReal(false);
    if (dateIssues.length) {
      toast.warning(dateIssues[0].message, 'Rango inválido');
      return;
    }
    setBusy(true);
    try {
      const data = await api<ApplyResult>('/schedule-engine/apply-real', {
        method: 'POST',
        body: JSON.stringify({ date_from: dateFrom, date_to: dateTo }),
      });
      setApplied(data);
      toast.success(
        `REAL ${data.codigo} v${data.numero_version} generado.`,
        'REAL creado',
      );
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error al generar REAL');
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

      <ol className="stepper" aria-label="Pasos del motor">
        {[
          { n: 1, label: 'Elegir rango' },
          { n: 2, label: 'Vista previa' },
          { n: 3, label: 'Generar PLANIFICADA' },
          { n: 4, label: 'Overlays (swap + REAL)' },
        ].map((s) => (
          <li
            key={s.n}
            className={`step ${
              currentStep === s.n
                ? 'current'
                : currentStep > s.n
                  ? 'done'
                  : ''
            }`}
          >
            <span className="num">{s.n}</span>
            <span>{s.label}</span>
          </li>
        ))}
      </ol>

      {wipeInfo ? (
        <div className="callout warn">
          <div className="callout-body">
            <div className="callout-title">Tabula rasa aplicada</div>
            {wipeInfo.cronogramas_eliminados} cronograma(s) PLANIFICADA eliminado(s).{' '}
            {wipeInfo.next}
          </div>
        </div>
      ) : null}
      {swapInfo ? (
        <div className="callout info">
          <div className="callout-body">
            <div className="callout-title">Intercambio registrado</div>
            {swapInfo.pair
              .map((p) => `${p.inspector} ${p.from_mobile}→${p.to_mobile}`)
              .join(' · ')}
            . {swapInfo.next}
          </div>
        </div>
      ) : null}
      {applied ? (
        <div className="callout success">
          <div className="callout-body">
            <div className="callout-title">
              Versión {applied.layer ? `(${applied.layer}) ` : ''}
              {applied.codigo} v{applied.numero_version}
            </div>
            {applied.days_inserted != null
              ? `${applied.days_inserted} días insertados`
              : ''}
            {applied.days_copied != null
              ? ` · ${applied.days_copied} copiados`
              : ''}
            {applied.overlays_applied != null
              ? ` · ${applied.overlays_applied} overlays`
              : ''}
            {applied.derived_from_plan
              ? ` · desde ${applied.derived_from_plan}`
              : ''}
            .{' '}
            <Link to="/cronograma-planificado">Ver planificado →</Link>
          </div>
        </div>
      ) : null}

      <section className="panel">
        <DateRangePresets
          from={dateFrom}
          to={dateTo}
          onApply={(f, t) => {
            setTouched({ from: true, to: true });
            setDateFrom(f);
            setDateTo(t);
            setPreview(null);
          }}
          include={['this-month', 'next-month', 'next-30', 'next-90', 'next-year']}
        />
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
              onChange={(e) => {
                setDateFrom(e.target.value);
                setPreview(null);
              }}
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
              onChange={(e) => {
                setDateTo(e.target.value);
                setPreview(null);
              }}
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
            {busy && !preview ? 'Calculando…' : 'Vista previa'}
          </button>
          <button
            className="btn amber"
            type="button"
            disabled={busy || !datesValid || !preview}
            onClick={() => setConfirmApply(true)}
            title={!preview ? 'Ejecutá una vista previa primero' : undefined}
          >
            Generar PLANIFICADA
          </button>
          <button
            className="btn"
            type="button"
            disabled={busy || !datesValid}
            onClick={() => setConfirmSwap(true)}
          >
            Registrar swap Haro–Ramos
          </button>
          <button
            className="btn"
            type="button"
            disabled={busy || !datesValid}
            onClick={() => setConfirmReal(true)}
          >
            Generar REAL
          </button>
          <button
            className="btn danger"
            type="button"
            disabled={busy}
            onClick={() => setConfirmWipe(true)}
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
            Flujo sugerido: (1) elegí el rango, (2) mirá la vista previa,
            (3) generá la PLANIFICADA, (4) opcionalmente registrá swap y
            generá el REAL. Sin tope operativo de días.
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

      <ConfirmDialog
        open={confirmApply}
        title="Generar PLANIFICADA"
        message={`Se creará una nueva versión PLANIFICADA para el rango ${dateFrom} → ${dateTo}. Podrás observarla y aprobarla luego.`}
        confirmLabel="Generar ahora"
        tone="default"
        onCancel={() => setConfirmApply(false)}
        onConfirm={() => runApply()}
      />

      <ConfirmDialog
        open={confirmSwap}
        title="Registrar swap Haro–Ramos"
        message={`Se registrará un intercambio para el rango ${dateFrom} → ${dateTo}. Afecta a la próxima generación REAL.`}
        confirmLabel="Registrar swap"
        tone="default"
        onCancel={() => setConfirmSwap(false)}
        onConfirm={() => runPairSwap()}
      />

      <ConfirmDialog
        open={confirmReal}
        title="Generar cronograma REAL"
        message={`Se generará la capa REAL (PLAN + overlays operativos) para ${dateFrom} → ${dateTo}.`}
        confirmLabel="Generar REAL"
        tone="default"
        onCancel={() => setConfirmReal(false)}
        onConfirm={() => runApplyReal()}
      />

      <ConfirmDialog
        open={confirmWipe}
        title="Eliminar todas las PLANIFICADAS"
        message="Se eliminarán todos los cronogramas de la capa PLANIFICADA. La BASE no se toca. Esta acción es irreversible."
        confirmLabel="Sí, eliminar"
        cancelLabel="Cancelar"
        tone="danger"
        requireReason
        reasonPlaceholder="Regeneración limpia sin overlays operativos"
        typeToConfirm="TABULA RASA"
        onCancel={() => setConfirmWipe(false)}
        onConfirm={(reason) => runWipe(reason)}
      />
    </div>
  );
}
