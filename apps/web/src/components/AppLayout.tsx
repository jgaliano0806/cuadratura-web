import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { NavLink, Outlet, Navigate } from 'react-router-dom';
import { ROLE_CODES } from '@plataforma/shared';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import { useLocalStorage } from '../lib/useLocalStorage';
import { BrandMark } from './BrandMark';
import { CommandPalette } from './CommandPalette';
import { InstitutionalTopbar } from './InstitutionalTopbar';
import { Icons } from './NavIcons';

type Overview = { huecos_pendientes: number };
type VersionRow = { id: string; estado: string };

const REFRESH_MS = 60_000;
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

function CountBadge({ n, tone }: { n: number; tone: 'warn' | 'danger' }) {
  if (!n) return null;
  return (
    <span
      className={`nav-count${tone === 'warn' ? ' warn' : ' danger'}`}
      aria-label={`${n} pendientes`}
    >
      {n > 99 ? '99+' : n}
    </span>
  );
}

type NavDef = {
  to: string;
  end?: boolean;
  label: string;
  icon: (p: { size?: number }) => ReactNode;
  badge?: ReactNode;
  show?: boolean;
};

function NavItem({
  item,
  collapsed,
}: {
  item: NavDef;
  collapsed: boolean;
}) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
      title={collapsed ? item.label : undefined}
    >
      <span className="nav-link-main">
        <span className="nav-icon">{item.icon({ size: 18 })}</span>
        <span className="nav-label">{item.label}</span>
      </span>
      {item.badge}
    </NavLink>
  );
}

export function AppLayout() {
  const { user, loading, logout, hasRole } = useAuth();
  const [gapsCount, setGapsCount] = useState(0);
  const [reviewCount, setReviewCount] = useState(0);
  const [collapsed, setCollapsed] = useLocalStorage(SIDEBAR_KEY, false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const isJefeOrAdmin = hasRole(
    ROLE_CODES.ADMIN_SV,
    ROLE_CODES.ADMIN_SYS,
    ROLE_CODES.JEFE,
  );

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      const overview = await api<Overview>('/admin/overview');
      setGapsCount(overview.huecos_pendientes ?? 0);
    } catch {
      /* silencioso */
    }
    try {
      const versions = await api<VersionRow[]>(
        '/planning/versions?capa=PLANIFICADA',
      );
      setReviewCount(versions.filter((v) => v.estado === 'EN_REVISION').length);
    } catch {
      /* idem */
    }
  }, [user]);

  useEffect(() => {
    if (!user || !isJefeOrAdmin) return;
    void refresh();
    const id = window.setInterval(() => void refresh(), REFRESH_MS);
    return () => window.clearInterval(id);
  }, [user, isJefeOrAdmin, refresh]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
      if (mod && e.key === '/') {
        e.preventDefault();
        setPaletteOpen(true);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const groups = useMemo(() => {
    const operation: NavDef[] = [
      { to: '/', end: true, label: 'Inicio', icon: Icons.home },
      {
        to: '/cronograma-planificado',
        label: 'Cronograma planificado',
        icon: Icons.calendar,
        badge: <CountBadge n={reviewCount} tone="warn" />,
      },
      {
        to: '/cronograma-real',
        label: 'Cronograma real',
        icon: Icons.gaps,
        badge: <CountBadge n={gapsCount} tone={gapsCount > 20 ? 'danger' : 'warn'} />,
      },
    ];

    const system: NavDef[] = [];
    if (isJefeOrAdmin) {
      system.push({
        to: '/proyeccion',
        label: 'Proyección',
        icon: Icons.engine,
      });
      system.push({
        to: '/administracion',
        label: 'Administración',
        icon: Icons.admin,
      });
    }

    return [
      { id: 'op', title: 'Cronogramas', items: operation },
      ...(system.length
        ? [{ id: 'sys', title: 'Sistema', items: system }]
        : []),
    ];
  }, [gapsCount, reviewCount, isJefeOrAdmin]);

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

          <button
            type="button"
            className="sidebar-search"
            onClick={() => setPaletteOpen(true)}
            title="Buscar (Ctrl + K)"
          >
            <Icons.search size={16} />
            {!collapsed ? (
              <>
                <span className="sidebar-search-label">Buscar…</span>
                <kbd className="sidebar-kbd">Ctrl K</kbd>
              </>
            ) : null}
          </button>
        </div>

        <nav className="nav" aria-label="Módulos">
          {groups.map((g) => (
            <div className="nav-group" key={g.id}>
              {!collapsed ? (
                <div className="nav-group-title">{g.title}</div>
              ) : (
                <div className="nav-group-rule" aria-hidden />
              )}
              {g.items.map((item) => (
                <NavItem key={item.to} item={item} collapsed={collapsed} />
              ))}
            </div>
          ))}
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
        <InstitutionalTopbar
          userName={user.displayName}
          onSearch={() => setPaletteOpen(true)}
        />
        <main className="main">
          <Outlet />
        </main>
      </div>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
      />
    </div>
  );
}
