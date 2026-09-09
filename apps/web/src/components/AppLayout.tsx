import { type FormEvent, type ReactNode, useState } from 'react';
import { NavLink, Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { api, ApiError } from '../lib/api';
import { useLocalStorage } from '../lib/useLocalStorage';
import { BrandMark } from './BrandMark';
import { InstitutionalTopbar } from './InstitutionalTopbar';
import { Icons } from './NavIcons';
import { Modal, useToast } from './ui';

const SIDEBAR_KEY = 'sv_sidebar_collapsed_v1';

const ROLE_LABEL: Record<string, string> = {
  ADMINISTRADOR_SISTEMA: 'Admin sistema',
  ADMINISTRACION_SEGURIDAD_VIAL: 'Admin sistema',
  JEFE_SECTOR: 'Jefe de sector',
  CONSULTA: 'Consulta',
  AUDITOR: 'Auditor',
  RECURSOS_HUMANOS: 'RR.HH.',
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
  const { user, loading, logout, canAdmin } = useAuth();
  const toast = useToast();
  const [collapsed, setCollapsed] = useLocalStorage(SIDEBAR_KEY, false);
  const [clave, setClave] = useState<{
    actual: string;
    password: string;
    password2: string;
  } | null>(null);
  const [claveBusy, setClaveBusy] = useState(false);

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

  async function guardarClave(e: FormEvent) {
    e.preventDefault();
    if (!clave) return;
    if (clave.password.length < 8) {
      toast.push({ tone: 'error', message: 'La nueva tiene que tener al menos 8 caracteres.' });
      return;
    }
    if (clave.password !== clave.password2) {
      toast.push({ tone: 'error', message: 'Las contraseñas nuevas no coinciden.' });
      return;
    }
    setClaveBusy(true);
    try {
      await api('/auth/password', {
        method: 'PATCH',
        body: JSON.stringify({ actual: clave.actual, password: clave.password }),
      });
      setClave(null);
      toast.push({ tone: 'success', message: 'Contraseña actualizada.' });
    } catch (err) {
      toast.push({
        tone: 'error',
        message: err instanceof ApiError ? err.message : 'No se pudo cambiar la contraseña.',
      });
    } finally {
      setClaveBusy(false);
    }
  }

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
          {canAdmin ? (
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
            className="sidebar-account"
            onClick={() => setClave({ actual: '', password: '', password2: '' })}
            title="Cambiar contraseña"
          >
            {!collapsed ? <span>Cambiar contraseña</span> : <span>Clave</span>}
          </button>
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

      <Modal
        open={Boolean(clave)}
        onClose={() => setClave(null)}
        title="Cambiar contraseña"
        description="Solo vos podés cambiarla. Pedimos la actual."
        size="sm"
        footer={
          <>
            <button type="button" className="btn secondary" onClick={() => setClave(null)}>
              Cancelar
            </button>
            <button type="submit" form="mi-clave-form" className="btn primary" disabled={claveBusy}>
              Guardar
            </button>
          </>
        }
      >
        {clave ? (
          <form id="mi-clave-form" className="form-grid" onSubmit={(e) => void guardarClave(e)}>
            <div className="field">
              <label htmlFor="mi-clave-act">Contraseña actual</label>
              <input
                id="mi-clave-act"
                type="password"
                autoComplete="current-password"
                value={clave.actual}
                onChange={(e) => setClave({ ...clave, actual: e.target.value })}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="mi-clave-n">Nueva</label>
              <input
                id="mi-clave-n"
                type="password"
                autoComplete="new-password"
                value={clave.password}
                onChange={(e) => setClave({ ...clave, password: e.target.value })}
                required
                minLength={8}
              />
            </div>
            <div className="field">
              <label htmlFor="mi-clave-n2">Repetir nueva</label>
              <input
                id="mi-clave-n2"
                type="password"
                autoComplete="new-password"
                value={clave.password2}
                onChange={(e) => setClave({ ...clave, password2: e.target.value })}
                required
                minLength={8}
              />
            </div>
          </form>
        ) : null}
      </Modal>
    </div>
  );
}
