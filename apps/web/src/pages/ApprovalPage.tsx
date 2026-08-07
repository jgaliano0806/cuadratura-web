import { useEffect, useState } from 'react';
import { ROLE_CODES } from '@plataforma/shared';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';

type Version = {
  id: string;
  codigo: string;
  capa: string;
  numero_version: number;
  estado: string;
  observaciones_revision: string | null;
};

export function ApprovalPage() {
  const { hasRole } = useAuth();
  const [versions, setVersions] = useState<Version[]>([]);
  const [observation, setObservation] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function refresh() {
    setVersions(await api<Version[]>('/planning/versions?capa=PLANIFICADA'));
  }

  useEffect(() => {
    refresh().catch((e) => setError(e.message));
  }, []);

  async function act(id: string, action: string) {
    setError('');
    setMessage('');
    try {
      if (action === 'submit') {
        await api(`/planning/${id}/submit`, { method: 'POST' });
      } else if (action === 'observe') {
        await api(`/planning/${id}/observe`, {
          method: 'POST',
          body: JSON.stringify({ observation }),
        });
      } else if (action === 'reopen') {
        await api(`/planning/${id}/reopen`, { method: 'POST' });
      } else if (action === 'approve') {
        await api(`/planning/${id}/approve-and-publish`, { method: 'POST' });
      } else if (action === 'close') {
        await api(`/planning/${id}/close`, { method: 'POST' });
      }
      setMessage(`Acción ${action} aplicada.`);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error');
    }
  }

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <h1>Aprobación</h1>
          <p>Borrador → Revisión → Aprobada/publicada → Cerrada.</p>
        </div>
      </header>

      {error ? <div className="error-box">{error}</div> : null}
      {message ? <div className="panel">{message}</div> : null}

      <section className="panel">
        <div className="field" style={{ maxWidth: 480, marginBottom: '1rem' }}>
          <label htmlFor="obs">Observación (para devolver)</label>
          <textarea
            id="obs"
            rows={3}
            value={observation}
            onChange={(e) => setObservation(e.target.value)}
          />
        </div>

        <table className="data">
          <thead>
            <tr>
              <th>Versión</th>
              <th>Estado</th>
              <th>Observaciones</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {versions.length === 0 ? (
              <tr>
                <td colSpan={4} className="muted">
                  No hay versiones planificadas todavía.
                </td>
              </tr>
            ) : (
              versions.map((v) => (
                <tr key={v.id}>
                  <td>
                    {v.codigo} v{v.numero_version}
                  </td>
                  <td>
                    <span className="badge neutral">{v.estado}</span>
                  </td>
                  <td>{v.observaciones_revision ?? ''}</td>
                  <td>
                    <div className="filters" style={{ marginBottom: 0 }}>
                      {hasRole(ROLE_CODES.ADMIN_SV) &&
                        ['BORRADOR', 'OBSERVADA'].includes(v.estado) && (
                          <button className="btn secondary" type="button" onClick={() => act(v.id, 'submit')}>
                            Enviar
                          </button>
                        )}
                      {hasRole(ROLE_CODES.ADMIN_SV) && v.estado === 'OBSERVADA' && (
                        <button className="btn secondary" type="button" onClick={() => act(v.id, 'reopen')}>
                          Reabrir
                        </button>
                      )}
                      {hasRole(ROLE_CODES.JEFE) && v.estado === 'EN_REVISION' && (
                        <>
                          <button className="btn secondary" type="button" onClick={() => act(v.id, 'observe')}>
                            Observar
                          </button>
                          <button className="btn amber" type="button" onClick={() => act(v.id, 'approve')}>
                            Aprobar y publicar
                          </button>
                        </>
                      )}
                      {hasRole(ROLE_CODES.JEFE) && v.estado === 'APROBADA_PUBLICADA' && (
                        <button className="btn" type="button" onClick={() => act(v.id, 'close')}>
                          Cerrar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
