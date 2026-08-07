import { FormEvent, useState } from 'react';
import { api, ApiError } from '../lib/api';

type Preview = {
  is_valid: boolean;
  file_name: string;
  date_from: string;
  date_to: string;
  inspectors: Array<{
    name: string;
    position_code: string;
    position_type: string;
    ordinal: number;
  }>;
  issues: Array<{ severity: string; code: string; detail: string; row?: number; column?: string }>;
};

export function InitializationPage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [initId, setInitId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function runPreview(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const form = new FormData();
      form.append('file', file);
      const data = await api<Preview>('/initialization/excel/preview', {
        method: 'POST',
        body: form,
      });
      setPreview(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error de preview');
    } finally {
      setBusy(false);
    }
  }

  async function stageAndConfirm() {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const form = new FormData();
      form.append('file', file);
      const staged = await api<{ initialization_id: string; valid: boolean }>(
        '/initialization/excel/stage',
        { method: 'POST', body: form },
      );
      setInitId(staged.initialization_id);
      if (!staged.valid) {
        setMessage('Staging creado en estado FALLIDA. Corrija errores antes de confirmar.');
        return;
      }
      await api(`/initialization/${staged.initialization_id}/confirm`, {
        method: 'POST',
      });
      setMessage('Inicialización confirmada. Golden Master activo.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error al confirmar');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <h1>Inicialización Excel</h1>
          <p>Carga única de la hoja Móviles CBA 26-27.</p>
        </div>
      </header>

      {error ? <div className="error-box">{error}</div> : null}
      {message ? <div className="panel">{message}</div> : null}

      <section className="panel">
        <p className="muted" style={{ marginTop: 0 }}>
          Corte fijo: <strong>2026-07-31</strong> inclusive. Dupla oficial RN-032:{' '}
          <strong>Haro – Ramos G.</strong> → <code>M4-P03</code> / <code>M4-P03-EXT</code>.
        </p>
        <form className="filters" onSubmit={runPreview}>
          <div className="field" style={{ minWidth: 280 }}>
            <label htmlFor="excel">Archivo .xlsx</label>
            <input
              id="excel"
              type="file"
              accept=".xlsx"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <button className="btn secondary" type="submit" disabled={!file || busy}>
            Vista previa
          </button>
          <button
            className="btn amber"
            type="button"
            disabled={!preview?.is_valid || busy}
            onClick={stageAndConfirm}
          >
            Confirmar inicialización
          </button>
        </form>
        {initId ? <p className="muted">ID: {initId}</p> : null}
      </section>

      {preview ? (
        <section className="panel">
          <p>
            <strong>{preview.file_name}</strong> · {preview.date_from} → {preview.date_to} ·{' '}
            {preview.inspectors.length} inspectores ·{' '}
            <span className={`badge ${preview.is_valid ? 'ok' : 'pending'}`}>
              {preview.is_valid ? 'VÁLIDO' : 'CON ERRORES'}
            </span>
          </p>

          <div className="xlsx-scroll" style={{ marginBottom: '1.25rem' }}>
            <table className="data">
              <caption className="muted" style={{ textAlign: 'left', paddingBottom: 8 }}>
                Inspectores detectados
              </caption>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Inspector</th>
                  <th>Posición asignada</th>
                  <th>Tipo</th>
                </tr>
              </thead>
              <tbody>
                {[...preview.inspectors]
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((insp) => (
                    <tr key={`${insp.ordinal}-${insp.name}`}>
                      <td>{insp.ordinal}</td>
                      <td>
                        <strong>{insp.name}</strong>
                      </td>
                      <td>{insp.position_code || '—'}</td>
                      <td>{insp.position_type || '—'}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          <table className="data">
            <caption className="muted" style={{ textAlign: 'left', paddingBottom: 8 }}>
              Hallazgos de validación
            </caption>
            <thead>
              <tr>
                <th>Severidad</th>
                <th>Código</th>
                <th>Detalle</th>
                <th>Celda</th>
              </tr>
            </thead>
            <tbody>
              {preview.issues.length === 0 ? (
                <tr>
                  <td colSpan={4}>Sin hallazgos.</td>
                </tr>
              ) : (
                preview.issues.map((issue, idx) => (
                  <tr key={`${issue.code}-${idx}`}>
                    <td>
                      <span
                        className={`badge ${
                          issue.severity === 'ERROR' ? 'pending' : 'warn'
                        }`}
                      >
                        {issue.severity}
                      </span>
                    </td>
                    <td>{issue.code}</td>
                    <td>{issue.detail}</td>
                    <td>
                      {issue.column ?? ''}
                      {issue.row ?? ''}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>
      ) : null}
    </div>
  );
}
