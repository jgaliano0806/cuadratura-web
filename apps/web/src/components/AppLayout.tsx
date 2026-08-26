import { useMemo, type ReactNode } from 'react';
import { NavLink, Outlet, Navigate, useLocation } from 'react-router-dom';
import { ROLE_CODES } from '@plataforma/shared';
import { useAuth } from '../lib/auth';
import { useLocalStorage } from '../lib/useLocalStorage';
import { BrandMark } from './BrandMark';
import { InstitutionalTopbar } from './InstitutionalTopbar';
import { Icons } from './NavIcons';

const SIDEBAR_KEY = 'sv_sidebar_collapsed_v1';
const TREE_KEY = 'sv_nav_tree_v1';
const TREE_OPEN_DEFAULT: Record<string, boolean> = { cuadratura: true };

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
  to?: string;
  label: string;
  icon: (p: { size?: number }) => ReactNode;
  soon?: boolean;
};

type NavBranch = {
  id: string;
  label: string;
  icon: (p: { size?: number }) => ReactNode;
  children: NavLeaf[];
};

function NavItem({
  item,
  collapsed,
  nested,
}: {
  item: NavLeaf & { to: string };
  collapsed: boolean;
  nested?: boolean;
}) {
  return (
    <NavLink
      to={item.to}
      className={({ isActive }) =>
        `nav-link${nested ? ' nested' : ''}${isActive ? ' active' : ''}`
      }
      title={collapsed ? item.label : undefined}
    >
      <span className="nav-link-main">
        <span className="nav-icon">{item.icon({ size: nested ? 16 : 18 })}</span>
        <span className="nav-label">{item.label}</span>
      </span>
    </NavLink>
  );
}

function SoonItem({
  item,
  collapsed,
}: {
  item: NavLeaf;
  collapsed: boolean;
}) {
  return (
    <span
      className="nav-link nested soon"
      title={collapsed ? `${item.label} · próximamente` : item.label}
    >
      <span className="nav-link-main">
        <span className="nav-icon">{item.icon({ size: 16 })}</span>
        <span className="nav-label">{item.label}</span>
      </span>
    </span>
  );
}

function NavTree({
  branch,
  collapsed,
  open,
  onToggle,
}: {
  branch: NavBranch;
  collapsed: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const location = useLocation();
  const childActive = branch.children.some(
    (c) => c.to && location.pathname.startsWith(c.to),
  );
  const expanded = open || childActive;

  return (
    <div className={`nav-tree${expanded ? ' open' : ''}${childActive ? ' has-active' : ''}`}>
      <button
        type="button"
        className="nav-tree-parent"
        onClick={onToggle}
        aria-expanded={expanded}
        title={collapsed ? branch.label : undefined}
      >
        <span className="nav-link-main">
          <span className="nav-icon">{branch.icon({ size: 18 })}</span>
          <span className="nav-label">{branch.label}</span>
        </span>
        {!collapsed ? (
          <span className={`nav-caret${expanded ? ' open' : ''}`}>
            <Icons.chevron size={14} />
          </span>
        ) : null}
      </button>
      {expanded ? (
        <div className="nav-tree-children" role="group" aria-label={branch.label}>
          {branch.children.map((child) =>
            child.soon || !child.to ? (
              <SoonItem key={child.label} item={child} collapsed={collapsed} />
            ) : (
              <NavItem
                key={child.to}
                item={{ ...child, to: child.to }}
                collapsed={collapsed}
                nested
              />
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}

export function AppLayout() {
  const { user, loading, logout, hasRole } = useAuth();
  const [collapsed, setCollapsed] = useLocalStorage(SIDEBAR_KEY, false);
  const [treeOpen, setTreeOpen] = useLocalStorage(TREE_KEY, TREE_OPEN_DEFAULT);

  const isJefeOrAdmin = hasRole(
    ROLE_CODES.ADMIN_SV,
    ROLE_CODES.ADMIN_SYS,
    ROLE_CODES.JEFE,
  );

  const branches = useMemo<NavBranch[]>(
    () => [
      {
        id: 'cuadratura',
        label: 'Cuadratura',
        icon: Icons.calendar,
        children: [
          { label: 'E.P.I', icon: Icons.shield, soon: true },
          { to: '/inspectores', label: 'Inspectores', icon: Icons.admin },
          { to: '/ocupacion', label: 'Ocupación', icon: Icons.mobile },
          { label: 'Operador B.O.', icon: Icons.radio, soon: true },
        ],
      },
    ],
    [],
  );

  if (loading) {
    return <div className="login-page muted">Cargando sesión…</div>;
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
          {branches.map((branch) => (
            <NavTree
              key={branch.id}
              branch={branch}
              collapsed={collapsed}
              open={treeOpen[branch.id] !== false}
              onToggle={() =>
                setTreeOpen((prev) => ({
                  ...prev,
                  [branch.id]: prev[branch.id] === false,
                }))
              }
            />
          ))}
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
