import { type ReactNode } from 'react';
import { NavLink, Outlet, Navigate } from 'react-router-dom';
import { ROLE_CODES } from '@plataforma/shared';
import { useAuth } from '../lib/auth';
import { useLocalStorage } from '../lib/useLocalStorage';
import { BrandMark } from './BrandMark';
import { InstitutionalTopbar } from './InstitutionalTopbar';
import { Icons } from './NavIcons';

const SIDEBAR_KEY = 'sv_sidebar_collapsed_v1';

const ROLE_LABEL: Record<string, string> = {
  ADMINISTRACION_SEGURIDAD_VIAL: 'Admin SV',
  ADMINISTRADOR_SISTEMA: 'Admin sistema',
  JEFE_SECTOR: 'Jefe de sector',
  CONSULTA: 'Consulta',
  AUDITOR: 'Auditor',
};

function humanRoles(roles: string[]) {
  return roles.map((r) => ROLE_LABEL[r] ?? r.replaceAll('_', ' ')).join(' · ');
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

type NavLeaf = {
  to: string;
  label: string;
  icon: (p: { size?: number }) => ReactNode;
};

function NavItem({
  item,
  collapsed,
}: {
  item: NavLeaf;
  collapsed: boolean;
}) {
  return (
    <NavLink
      to={item.to}
      className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
      title={collapsed ? item.label : undefined}
    >
      <span className="nav-link-main">
        <span className="nav-icon">{item.icon({ size: 18 })}</span>
        <span className="nav-label">{item.label}</span>
      </span>
    </NavLink>
  );
}

export function AppLayout() {
  const { user, loading, logout, hasRole } = useAuth();
  const [collapsed, setCollapsed] = useLocalStorage(SIDEBAR_KEY, false);

  const isJefeOrAdmin = hasRole(
    ROLE_CODES.ADMIN_SV,
    ROLE_CODES.ADMIN_SYS,
    ROLE_CODES.JEFE,
  );

  if (loading) {
    return (
      <div className="login-page">
        <div className="login-card">
          <h1>Cargando sesión…</h1>
          <p className="muted">Si tarda, recargá la página.</p>
        </div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;

  const roleText = humanRoles(user.roles);

  return (
    <div className={`app-shell${collapsed ? ' collapsed' : ''}`}>
      <aside className="sidebar" aria-label="Navegación principal">
        <button
          type="button"
          className="sidebar-toggle"
          aria-label={collapsed ? 'Expandir menú' : 'Contraer menú'}
          title={collapsed ? 'Expandir menú' : 'Contraer menú'}
          onClick={() => setCollapsed((v) => !v)}
        >
          {collapsed ? <Icons.expand size={14} /> : <Icons.collapse size={14} />}
        </button>

        <div className="sidebar-head">
          <div className="brand">
            <BrandMark size={collapsed ? 40 : 52} />
          </div>
          {!collapsed ? (
            <p className="sidebar-tagline">Cuadratura operativa</p>
          ) : null}
        </div>

        <nav className="nav" aria-label="Módulos">
          <NavItem
            item={{ to: '/inspectores', label: 'Cuadratura', icon: Icons.calendar }}
            collapsed={collapsed}
          />
          {isJefeOrAdmin ? (
            <NavItem
              item={{ to: '/administracion', label: 'Administración', icon: Icons.admin }}
              collapsed={collapsed}
            />
          ) : null}
        </nav>

        <div className="sidebar-footer">
          <div
            className="user-chip"
            title={`${user.displayName} · ${roleText}`}
          >
            <span className="user-avatar" aria-hidden>
              {initials(user.displayName)}
            </span>
            {!collapsed ? (
              <span className="user-meta">
                <strong className="user-name">{user.displayName}</strong>
                <span className="user-role">{roleText}</span>
              </span>
            ) : null}
          </div>
          <button
            type="button"
            className="sidebar-logout"
            onClick={logout}
            title="Cerrar sesión"
          >
            <Icons.logout size={16} />
            {!collapsed ? <span>Cerrar sesión</span> : null}
          </button>
        </div>
      </aside>

      <div className="main-column">
        <InstitutionalTopbar userName={user.displayName} />
        <main className="main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
