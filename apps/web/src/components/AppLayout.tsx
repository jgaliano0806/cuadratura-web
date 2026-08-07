import { NavLink, Outlet, Navigate } from 'react-router-dom';
import { ROLE_CODES } from '@plataforma/shared';
import { useAuth } from '../lib/auth';

export function AppLayout() {
  const { user, loading, logout, hasRole } = useAuth();

  if (loading) {
    return <div className="login-page muted">Cargando sesión…</div>;
  }
  if (!user) return <Navigate to="/login" replace />;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <strong>CASISA</strong>
          <span>Plataforma Inspectores</span>
        </div>
        <nav className="nav" aria-label="Principal">
          <NavLink to="/" end>
            Inicio
          </NavLink>
          {(hasRole(ROLE_CODES.ADMIN_SV, ROLE_CODES.ADMIN_SYS) ? (
            <NavLink to="/inicializacion">Inicialización</NavLink>
          ) : null)}
          <NavLink to="/calendario">Cronograma</NavLink>
          {(hasRole(ROLE_CODES.ADMIN_SV, ROLE_CODES.ADMIN_SYS, ROLE_CODES.JEFE) ? (
            <NavLink to="/proyeccion">Proyección</NavLink>
          ) : null)}
          <NavLink to="/huecos">Huecos</NavLink>
          <NavLink to="/vacaciones">Vacaciones</NavLink>
          <NavLink to="/aprobacion">Aprobación</NavLink>
          <NavLink to="/movil4">Móvil 4</NavLink>
          {(hasRole(ROLE_CODES.ADMIN_SV, ROLE_CODES.ADMIN_SYS, ROLE_CODES.JEFE) ? (
            <NavLink to="/administracion">Administración</NavLink>
          ) : null)}
        </nav>
        <div className="sidebar-footer">
          <div>{user.displayName}</div>
          <div className="muted" style={{ color: 'rgba(247,243,234,.65)' }}>
            {user.roles.join(' · ')}
          </div>
          <button
            className="btn secondary"
            style={{ marginTop: '0.75rem', color: '#fff', borderColor: 'rgba(255,255,255,.35)' }}
            onClick={logout}
            type="button"
          >
            Cerrar sesión
          </button>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
