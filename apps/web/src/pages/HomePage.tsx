import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ROLE_CODES } from '@plataforma/shared';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { buildPresets } from '../lib/datePresets';
import { EmptyState, Skeleton } from '../components/ui';

type Overview = {
  inspectores_activos: number;
  moviles_activos: number;
  posiciones_activas: number;
  versiones: number;
  usuarios_activos: number;
  huecos_pendientes: number;
};

type Version = {
  id: string;
  codigo: string;
  capa: string;
  numero_version: number;
  estado: string;
  periodo_desde?: string;
  periodo_hasta?: string;
};

function formatToday(): string {
  const now = new Date();
  return now.toLocaleDateString('es-AR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

export function HomePage() {
  const { user, hasRole } = useAuth();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [busy, setBusy] = useState(true);

  const isPrivileged = hasRole(
    ROLE_CODES.ADMIN_SV,
    ROLE_CODES.ADMIN_SYS,
    ROLE_CODES.JEFE,
  );

  useEffect(() => {
    let alive = true;
    async function load() {
      setBusy(true);
      try {
        const tasks: Array<Promise<unknown>> = [
          api<Version[]>('/planning/versions?capa=PLANIFICADA').then((v) => {
            if (alive) setVersions(v);
          }),
        ];
        if (isPrivileged) {
          tasks.push(
            api<Overview>('/admin/overview').then((o) => {
              if (alive) setOverview(o);
            }),
          );
        }
        await Promise.allSettled(tasks);
      } finally {
        if (alive) setBusy(false);
      }
    }
    void load();
    return () => {
      alive = false;
    };
  }, [isPrivileged]);

  const inReview = useMemo(
    () => versions.filter((v) => v.estado === 'EN_REVISION'),
    [versions],
  );
  const observed = useMemo(
    () => versions.filter((v) => v.estado === 'OBSERVADA'),
    [versions],
  );
  const published = useMemo(
    () => versions.filter((v) => v.estado === 'APROBADA_PUBLICADA'),
    [versions],
  );

  const presets = useMemo(() => buildPresets(), []);
  const thisMonth = presets.find((p) => p.id === 'this-month')!.range();
  const nextMonth = presets.find((p) => p.id === 'next-month')!.range();
  const calendarThisMonth = `/cronograma-planificado?from=${thisMonth.from}&to=${thisMonth.to}`;
  const calendarNextMonth = `/cronograma-planificado?from=${nextMonth.from}&to=${nextMonth.to}`;

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <h1>Hola, {user?.displayName?.split(' ')[0] ?? 'inspector'}</h1>
          <p className="muted" style={{ textTransform: 'capitalize' }}>
            {formatToday()} · Caminos de las Sierras
          </p>
        </div>
      </header>

      <section className="dash-grid">
        <Link
          className={`dash-card ${
            (overview?.huecos_pendientes ?? 0) > 0 ? 'alert' : 'ok'
          }`}
          to="/huecos"
        >
          <span className="eyebrow">Huecos pendientes</span>
          <span className="value">
            {busy && !overview ? (
              <Skeleton width="3rem" height="2rem" />
            ) : (
              overview?.huecos_pendientes ?? 0
            )}
          </span>
          <span className="hint">
            {overview?.huecos_pendientes
              ? 'Requieren justificación o cobertura'
              : 'Cobertura al día'}
          </span>
        </Link>

        <Link
          className={`dash-card ${inReview.length ? 'alert' : ''}`}
          to="/aprobacion"
        >
          <span className="eyebrow">Aprobaciones</span>
          <span className="value">
            {busy && !versions.length ? (
              <Skeleton width="3rem" height="2rem" />
            ) : (
              inReview.length
            )}
          </span>
          <span className="hint">
            {inReview.length
              ? 'Versiones esperando revisión'
              : `${observed.length} observada${observed.length === 1 ? '' : 's'} · ${published.length} publicada${published.length === 1 ? '' : 's'}`}
          </span>
        </Link>

        <div className="dash-card">
          <span className="eyebrow">Planta activa</span>
          <span className="value">
            {busy && !overview ? (
              <Skeleton width="3rem" height="2rem" />
            ) : (
              overview?.inspectores_activos ?? '—'
            )}
          </span>
          <span className="hint">
            {overview
              ? `${overview.moviles_activos} móviles · ${overview.posiciones_activas} posiciones`
              : 'Inspectores en la cuadratura'}
          </span>
        </div>

        <div className="dash-card">
          <span className="eyebrow">Versiones cargadas</span>
          <span className="value">
            {busy && !overview ? (
              <Skeleton width="3rem" height="2rem" />
            ) : (
              overview?.versiones ?? versions.length
            )}
          </span>
          <span className="hint">
            {published.length} publicadas · {observed.length} observadas
          </span>
        </div>
      </section>

      <section className="panel">
        <h2 style={{ marginTop: 0, fontFamily: 'var(--font-display)' }}>
          Ir directo a…
        </h2>
        <div className="dash-actions">
          <Link className="btn" to={calendarThisMonth}>
            Planificado · este mes
          </Link>
          <Link className="btn secondary" to={calendarNextMonth}>
            Planificado · próximo mes
          </Link>
          <Link className="btn amber" to="/huecos">
            Tablero de huecos
          </Link>
          {isPrivileged ? (
            <Link className="btn secondary" to="/proyeccion">
              Motor de proyección
            </Link>
          ) : null}
          <Link className="btn secondary" to="/vacaciones">
            Vacaciones
          </Link>
          <Link className="btn secondary" to="/movil4">
            Móvil 4
          </Link>
          <Link className="btn secondary" to="/ruta36">
            Ruta 36
          </Link>
        </div>
      </section>

      {isPrivileged && inReview.length ? (
        <section className="panel">
          <h2 style={{ marginTop: 0, fontFamily: 'var(--font-display)' }}>
            Esperando tu revisión
          </h2>
          <table className="data">
            <thead>
              <tr>
                <th>Versión</th>
                <th>Período</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {inReview.map((v) => (
                <tr key={v.id}>
                  <td>
                    {v.codigo} v{v.numero_version}
                  </td>
                  <td>
                    {v.periodo_desde ?? '—'}
                    {v.periodo_hasta ? ` → ${v.periodo_hasta}` : ''}
                  </td>
                  <td>
                    <Link className="btn sm" to="/aprobacion">
                      Revisar
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {!busy && !inReview.length && !overview?.huecos_pendientes ? (
        <EmptyState
          title="Nada urgente en tu bandeja"
          description="No hay huecos pendientes ni versiones esperando aprobación. Buen momento para planificar el próximo mes."
          action={
            <Link className="btn secondary" to={calendarNextMonth}>
              Ver próximo mes
            </Link>
          }
        />
      ) : null}
    </div>
  );
}
