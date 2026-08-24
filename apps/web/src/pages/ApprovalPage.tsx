import { useEffect, useMemo, useState } from 'react';
import { ROLE_CODES } from '@plataforma/shared';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import {
  ConfirmDialog,
  Modal,
  SkeletonTable,
  useToast,
} from '../components/ui';
import { VersionDiff } from '../components/VersionDiff';

type Version = {
  id: string;
  codigo: string;
  capa: string;
  numero_version: number;
  estado: string;
  observaciones_revision: string | null;
  periodo_desde?: string;
  periodo_hasta?: string;
};

type PendingAction =
  | { type: 'submit'; version: Version }
  | { type: 'reopen'; version: Version }
  | { type: 'approve'; version: Version }
  | { type: 'close'; version: Version }
  | null;

function stateBadgeClass(estado: string): string {
  switch (estado) {
    case 'APROBADA_PUBLICADA':
      return 'badge ok';
    case 'EN_REVISION':
      return 'badge warn';
    case 'OBSERVADA':
      return 'badge pending';
    case 'CERRADA':
      return 'badge neutral';
    default:
      return 'badge neutral';
  }
}

function actionLabel(t: NonNullable<PendingAction>['type']): string {
  return {
    submit: 'Enviar a revisión',
    reopen: 'Reabrir borrador',
    approve: 'Aprobar y publicar',
    close: 'Cerrar versión',
  }[t];
}

export function ApprovalPage() {
  const { hasRole } = useAuth();
  const toast = useToast();
  const [versions, setVersions] = useState<Version[]>([]);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<string>('');
  const [observing, setObserving] = useState<Version | null>(null);
  const [observation, setObservation] = useState('');
  const [pending, setPending] = useState<PendingAction>(null);
  const [diffFor, setDiffFor] = useState<Version | null>(null);

  async function refresh() {
    setBusy(true);
    try {
      const data = await api<Version[]>(
        '/planning/versions?capa=PLANIFICADA',
      );
      setVersions(data);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error al cargar versiones.');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    if (!filter) return versions;
    return versions.filter((v) => v.estado === filter);
  }, [versions, filter]);

  const totals = useMemo(() => {
    const t = { EN_REVISION: 0, OBSERVADA: 0, APROBADA_PUBLICADA: 0, BORRADOR: 0 };
    for (const v of versions) {
      if (v.estado in t) t[v.estado as keyof typeof t] += 1;
    }
    return t;
  }, [versions]);

  async function runAction(action: NonNullable<PendingAction>) {
    const { type, version } = action;
    const path = {
      submit: `/planning/${version.id}/submit`,
      reopen: `/planning/${version.id}/reopen`,
      approve: `/planning/${version.id}/approve-and-publish`,
      close: `/planning/${version.id}/close`,
    }[type];
    setPending(null);
    try {
      await api(path, { method: 'POST' });
      toast.success(`${actionLabel(type)} en ${version.codigo} v${version.numero_version}.`);
      await refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error');
    }
  }

  async function submitObservation() {
    if (!observing) return;
    if (observation.trim().length < 5) {
      toast.warning('La observación requiere al menos 5 caracteres.');
      return;
    }
    try {
      await api(`/planning/${observing.id}/observe`, {
        method: 'POST',
        body: JSON.stringify({ observation: observation.trim() }),
      });
      toast.success(
        `Observación enviada a ${observing.codigo} v${observing.numero_version}.`,
      );
      setObserving(null);
      setObservation('');
      await refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error al observar.');
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

      <section className="dash-grid">
        <div className="dash-card">
          <span className="eyebrow">En revisión</span>
          <span className="value">{totals.EN_REVISION}</span>
          <span className="hint">Esperando decisión del jefe</span>
        </div>
        <div className="dash-card alert">
          <span className="eyebrow">Observadas</span>
          <span className="value">{totals.OBSERVADA}</span>
          <span className="hint">Volvieron con comentarios</span>
        </div>
        <div className="dash-card ok">
          <span className="eyebrow">Publicadas</span>
          <span className="value">{totals.APROBADA_PUBLICADA}</span>
          <span className="hint">Cronogramas vigentes</span>
        </div>
        <div className="dash-card">
          <span className="eyebrow">Borradores</span>
          <span className="value">{totals.BORRADOR}</span>
          <span className="hint">Sin enviar todavía</span>
        </div>
      </section>

      <section className="panel">
        <div className="filters">
          <div className="field">
            <label htmlFor="fstate">Estado</label>
            <select
              id="fstate"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="">Todos</option>
              <option value="BORRADOR">Borrador</option>
              <option value="EN_REVISION">En revisión</option>
              <option value="OBSERVADA">Observada</option>
              <option value="APROBADA_PUBLICADA">Publicada</option>
              <option value="CERRADA">Cerrada</option>
            </select>
          </div>
          <button
            className="btn secondary"
            type="button"
            onClick={() => void refresh()}
            disabled={busy}
          >
            {busy ? 'Actualizando…' : 'Actualizar'}
          </button>
        </div>

        <table className="data">
          <thead>
            <tr>
              <th>Versión</th>
              <th>Período</th>
              <th>Estado</th>
              <th>Observaciones</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {busy && !versions.length ? (
              <SkeletonTable cols={5} rows={4} />
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="muted">
                  No hay versiones con ese filtro.
                </td>
              </tr>
            ) : (
              filtered.map((v) => (
                <tr key={v.id}>
                  <td>
                    <strong>{v.codigo}</strong> v{v.numero_version}
                  </td>
                  <td>
                    {v.periodo_desde ?? '—'}
                    {v.periodo_hasta ? ` → ${v.periodo_hasta}` : ''}
                  </td>
                  <td>
                    <span className={stateBadgeClass(v.estado)}>{v.estado}</span>
                  </td>
                  <td style={{ maxWidth: 260 }}>
                    <span className="muted">{v.observaciones_revision ?? '—'}</span>
                  </td>
                  <td>
                    <div className="filters" style={{ marginBottom: 0, gap: '0.35rem' }}>
                      {versions.length > 1 ? (
                        <button
                          type="button"
                          className="btn sm ghost"
                          onClick={() => setDiffFor(v)}
                          title="Ver diferencias contra otra versión"
                        >
                          Comparar
                        </button>
                      ) : null}
                      {hasRole(ROLE_CODES.ADMIN_SV) &&
                        ['BORRADOR', 'OBSERVADA'].includes(v.estado) && (
                          <button
                            className="btn sm secondary"
                            type="button"
                            onClick={() =>
                              setPending({ type: 'submit', version: v })
                            }
                          >
                            Enviar
                          </button>
                        )}
                      {hasRole(ROLE_CODES.ADMIN_SV) && v.estado === 'OBSERVADA' && (
                        <button
                          className="btn sm secondary"
                          type="button"
                          onClick={() => setPending({ type: 'reopen', version: v })}
                        >
                          Reabrir
                        </button>
                      )}
                      {hasRole(ROLE_CODES.JEFE) && v.estado === 'EN_REVISION' && (
                        <>
                          <button
                            className="btn sm secondary"
                            type="button"
                            onClick={() => {
                              setObserving(v);
                              setObservation('');
                            }}
                          >
                            Observar
                          </button>
                          <button
                            className="btn sm amber"
                            type="button"
                            onClick={() =>
                              setPending({ type: 'approve', version: v })
                            }
                          >
                            Aprobar y publicar
                          </button>
                        </>
                      )}
                      {hasRole(ROLE_CODES.JEFE) &&
                        v.estado === 'APROBADA_PUBLICADA' && (
                          <button
                            className="btn sm"
                            type="button"
                            onClick={() =>
                              setPending({ type: 'close', version: v })
                            }
                          >
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

      {/* Modal por fila para observación */}
      <Modal
        open={Boolean(observing)}
        onClose={() => setObserving(null)}
        title={
          observing
            ? `Observar ${observing.codigo} v${observing.numero_version}`
            : 'Observar'
        }
        description="La observación vuelve la versión a estado OBSERVADA para que Seguridad Vial la corrija."
        footer={
          <>
            <button
              className="btn secondary"
              type="button"
              onClick={() => setObserving(null)}
            >
              Cancelar
            </button>
            <button
              className="btn amber"
              type="button"
              onClick={() => void submitObservation()}
              disabled={observation.trim().length < 5}
            >
              Enviar observación
            </button>
          </>
        }
      >
        <div className="field">
          <label htmlFor="obs">Observación</label>
          <textarea
            id="obs"
            rows={5}
            value={observation}
            placeholder="Ej: Faltan reemplazos de vacaciones para el 15/07…"
            onChange={(e) => setObservation(e.target.value)}
            autoFocus
          />
          <p className="muted" style={{ fontSize: '0.8rem', margin: '0.25rem 0 0' }}>
            {observation.trim().length}/5 mínimo
          </p>
        </div>
      </Modal>

      <ConfirmDialog
        open={pending?.type === 'submit'}
        title="Enviar a revisión"
        message={
          pending?.type === 'submit'
            ? `La versión ${pending.version.codigo} v${pending.version.numero_version} pasará a EN_REVISION.`
            : ''
        }
        confirmLabel="Enviar"
        onCancel={() => setPending(null)}
        onConfirm={() => (pending ? runAction(pending) : Promise.resolve())}
      />
      <ConfirmDialog
        open={pending?.type === 'reopen'}
        title="Reabrir borrador"
        message={
          pending?.type === 'reopen'
            ? `Se reabrirá ${pending.version.codigo} v${pending.version.numero_version} en estado BORRADOR.`
            : ''
        }
        confirmLabel="Reabrir"
        onCancel={() => setPending(null)}
        onConfirm={() => (pending ? runAction(pending) : Promise.resolve())}
      />
      <ConfirmDialog
        open={pending?.type === 'approve'}
        title="Aprobar y publicar"
        message={
          pending?.type === 'approve'
            ? `Se aprobará ${pending.version.codigo} v${pending.version.numero_version} y quedará publicada como cronograma vigente.`
            : ''
        }
        confirmLabel="Aprobar y publicar"
        onCancel={() => setPending(null)}
        onConfirm={() => (pending ? runAction(pending) : Promise.resolve())}
      />
      {diffFor ? (
        <VersionDiff
          open={Boolean(diffFor)}
          onClose={() => setDiffFor(null)}
          baseVersion={diffFor}
          candidates={versions}
        />
      ) : null}

      <ConfirmDialog
        open={pending?.type === 'close'}
        title="Cerrar versión"
        message={
          pending?.type === 'close'
            ? `Se cerrará ${pending.version.codigo} v${pending.version.numero_version}. No podrá modificarse ni volver a publicarse.`
            : ''
        }
        confirmLabel="Cerrar versión"
        tone="danger"
        onCancel={() => setPending(null)}
        onConfirm={() => (pending ? runAction(pending) : Promise.resolve())}
      />
    </div>
  );
}
