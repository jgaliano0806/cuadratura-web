import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';

type Overview = {
  inspectores_activos: number;
  moviles_activos: number;
  posiciones_activas: number;
  versiones: number;
  usuarios_activos: number;
  huecos_pendientes: number;
};

type Tab =
  | 'resumen'
  | 'inspectores'
  | 'moviles'
  | 'posiciones'
  | 'perfiles'
  | 'duplas'
  | 'usuarios';

type Column = { key: string; label: string; secondary?: string };

const COLUMNS: Record<Exclude<Tab, 'resumen'>, Column[]> = {
  inspectores: [
    { key: 'nombre_completo', label: 'Inspector' },
    { key: 'posicion_etiqueta', label: 'Posición', secondary: 'posicion_codigo' },
    { key: 'tipo_plantel', label: 'Plantel' },
    { key: 'estado', label: 'Estado' },
    { key: 'vigencia_desde', label: 'Desde' },
  ],
  moviles: [
    { key: 'numero', label: 'Móvil' },
    { key: 'base_nombre', label: 'Base' },
    { key: 'capacidad_maxima', label: 'Capacidad' },
    { key: 'estado', label: 'Estado' },
    { key: 'horarios_texto', label: 'Horarios' },
  ],
  posiciones: [
    { key: 'ocupante_vigente', label: 'Inspector' },
    { key: 'codigo', label: 'Código posición' },
    { key: 'tipo', label: 'Tipo' },
    { key: 'perfil', label: 'Perfil' },
    { key: 'grupo_franco', label: 'Grupo franco' },
    { key: 'grupo_vinculado', label: 'Dupla' },
    { key: 'estado', label: 'Estado' },
  ],
  perfiles: [
    { key: 'nombre', label: 'Perfil' },
    { key: 'tipo', label: 'Tipo' },
    { key: 'turnos_texto', label: 'Turnos' },
    { key: 'moviles_texto', label: 'Móviles' },
    { key: 'estado', label: 'Estado' },
  ],
  duplas: [
    { key: 'nombre', label: 'Dupla' },
    { key: 'miembros_texto', label: 'Integrantes' },
    { key: 'estado', label: 'Estado' },
  ],
  usuarios: [
    { key: 'nombre_mostrar', label: 'Nombre' },
    { key: 'nombre_usuario', label: 'Usuario' },
    { key: 'roles_texto', label: 'Roles' },
    { key: 'estado', label: 'Estado' },
  ],
};

function cellText(row: Record<string, unknown>, col: Column): string {
  const primary = row[col.key];
  if (primary === null || primary === undefined || primary === '') {
    return '—';
  }
  return String(primary);
}

function cellSecondary(row: Record<string, unknown>, col: Column): string | null {
  if (!col.secondary) return null;
  const v = row[col.secondary];
  if (v === null || v === undefined || v === '') return null;
  return String(v);
}

export function AdministrationPage() {
  const [tab, setTab] = useState<Tab>('resumen');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Overview>('/admin/overview')
      .then(setOverview)
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (tab === 'resumen') return;
    const path: Record<Exclude<Tab, 'resumen'>, string> = {
      inspectores: '/admin/inspectors',
      moviles: '/admin/mobiles',
      posiciones: '/admin/positions',
      perfiles: '/admin/profiles',
      duplas: '/admin/linked-groups',
      usuarios: '/admin/users',
    };
    setBusy(true);
    setError('');
    api<Record<string, unknown>[]>(path[tab])
      .then(setRows)
      .catch((e) => {
        setRows([]);
        setError(e.message);
      })
      .finally(() => setBusy(false));
  }, [tab]);

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'resumen', label: 'Resumen' },
    { id: 'inspectores', label: 'Inspectores' },
    { id: 'moviles', label: 'Móviles' },
    { id: 'posiciones', label: 'Posiciones' },
    { id: 'perfiles', label: 'Perfiles' },
    { id: 'duplas', label: 'Duplas' },
    { id: 'usuarios', label: 'Usuarios' },
  ];

  const columns = tab === 'resumen' ? [] : COLUMNS[tab];

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <h1>Administración</h1>
          <p>
            Gestión maestra de inspectores, móviles, posiciones, perfiles,
            duplas y usuarios.
          </p>
        </div>
      </header>

      {error ? <div className="error-box">{error}</div> : null}

      <nav className="admin-tabs" aria-label="Secciones de administración">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={tab === t.id ? 'active' : undefined}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'resumen' ? (
        <section className="panel">
          <div className="summary-strip">
            <div>
              <strong>{overview?.inspectores_activos ?? '—'}</strong>
              <span>Inspectores</span>
            </div>
            <div>
              <strong>{overview?.moviles_activos ?? '—'}</strong>
              <span>Móviles</span>
            </div>
            <div>
              <strong>{overview?.posiciones_activas ?? '—'}</strong>
              <span>Posiciones</span>
            </div>
            <div>
              <strong>{overview?.versiones ?? '—'}</strong>
              <span>Versiones</span>
            </div>
            <div>
              <strong>{overview?.usuarios_activos ?? '—'}</strong>
              <span>Usuarios</span>
            </div>
            <div>
              <strong>{overview?.huecos_pendientes ?? '—'}</strong>
              <span>Huecos pendientes</span>
            </div>
          </div>
          <div className="filters" style={{ marginTop: '1.25rem' }}>
            <Link className="btn secondary" to="/cronograma-planificado">
              Cronograma planificado
            </Link>
            <Link className="btn amber" to="/huecos">
              Tablero de huecos
            </Link>
            <Link className="btn secondary" to="/aprobacion">
              Aprobación
            </Link>
            <Link className="btn secondary" to="/movil4">
              Móvil 4
            </Link>
            <Link className="btn secondary" to="/ruta36">
              Ruta 36
            </Link>
          </div>
        </section>
      ) : (
        <section className="panel">
          {busy ? <p className="muted">Cargando…</p> : null}
          {!busy && rows.length === 0 ? (
            <p className="muted">Sin registros para esta sección.</p>
          ) : null}
          {!busy && rows.length > 0 ? (
            <div className="xlsx-scroll">
              <table className="data">
                <thead>
                  <tr>
                    {columns.map((c) => (
                      <th key={c.key}>{c.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => (
                    <tr key={String(row.id ?? row.codigo ?? idx)}>
                      {columns.map((col) => {
                        const secondary = cellSecondary(row, col);
                        return (
                          <td key={col.key}>
                            <span className="cell-primary">{cellText(row, col)}</span>
                            {secondary ? (
                              <div className="muted cell-secondary">{secondary}</div>
                            ) : null}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      )}
    </div>
  );
}
