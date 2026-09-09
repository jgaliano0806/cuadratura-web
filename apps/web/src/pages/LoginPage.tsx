import { FormEvent, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { api, ApiError } from '../lib/api';
import { BrandMark } from '../components/BrandMark';
import { ThemeToggle } from '../components/ThemeToggle';
import { Modal } from '../components/ui';

export function LoginPage() {
  const { user, login } = useAuth();
  const [username, setUsername] = useState('admin_sv@casisa.local');
  const [password, setPassword] = useState('AdminSV123!');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [olvido, setOlvido] = useState(false);
  const [olvidoUser, setOlvidoUser] = useState('');
  const [olvidoBusy, setOlvidoBusy] = useState(false);
  const [olvidoOk, setOlvidoOk] = useState(false);

  if (user) return <Navigate to="/inspectores" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(username, password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo iniciar sesión');
    } finally {
      setBusy(false);
    }
  }

  async function pedirReset(e: FormEvent) {
    e.preventDefault();
    setOlvidoBusy(true);
    try {
      await api('/auth/password-reset', {
        method: 'POST',
        body: JSON.stringify({ username: olvidoUser.trim() }),
      });
      setOlvidoOk(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo enviar el pedido.');
      setOlvido(false);
    } finally {
      setOlvidoBusy(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-theme-float">
        <ThemeToggle variant="topbar" cycleSystem />
      </div>

      <div className="login-card">
        <div className="login-brand-stack">
          <BrandMark size={96} />
        </div>

        <div className="eyebrow">Seguridad Vial · CASISA</div>
        <h1>Cuadratura operativa</h1>
        <p className="muted">
          Acceso a la planificación de inspectores, móviles y cobertura
          (Caminos de las Sierras).
        </p>

        {error ? <div className="error-box">{error}</div> : null}

        <form onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="username">Email</label>
            <input
              id="username"
              type="email"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="email"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="password">Contraseña</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          <button className="btn" type="submit" disabled={busy}>
            {busy ? 'Ingresando…' : 'Ingresar'}
          </button>
          <button
            type="button"
            className="login-forgot"
            onClick={() => {
              setOlvidoUser(username);
              setOlvidoOk(false);
              setOlvido(true);
            }}
          >
            ¿Olvidaste la contraseña?
          </button>
        </form>
      </div>

      <Modal
        open={olvido}
        onClose={() => setOlvido(false)}
        title="Olvidé la contraseña"
        description="Administración la resetea y te da una temporal. El pedido queda en Actividad."
        size="sm"
        footer={
          olvidoOk ? (
            <button type="button" className="btn primary" onClick={() => setOlvido(false)}>
              Listo
            </button>
          ) : (
            <>
              <button type="button" className="btn secondary" onClick={() => setOlvido(false)}>
                Cancelar
              </button>
              <button type="submit" form="olvido-form" className="btn primary" disabled={olvidoBusy}>
                Enviar pedido
              </button>
            </>
          )
        }
      >
        {olvidoOk ? (
          <p className="muted">
            Si esa cuenta existe, Administración ya ve el pedido. Pediles la temporal.
          </p>
        ) : (
          <form id="olvido-form" className="form-grid" onSubmit={(e) => void pedirReset(e)}>
            <div className="field">
              <label htmlFor="olvido-user">Email</label>
              <input
                id="olvido-user"
                type="email"
                value={olvidoUser}
                onChange={(e) => setOlvidoUser(e.target.value)}
                autoComplete="email"
                required
              />
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
