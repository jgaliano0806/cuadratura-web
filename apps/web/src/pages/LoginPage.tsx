import { FormEvent, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { ApiError } from '../lib/api';

export function LoginPage() {
  const { user, login } = useAuth();
  const [username, setUsername] = useState('admin_sv');
  const [password, setPassword] = useState('AdminSV123!');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

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

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="eyebrow">Seguridad Vial</div>
        <h1>CASISA</h1>
        <p className="muted">Acceso a la cuadratura operativa de inspectores y móviles.</p>
        {error ? <div className="error-box">{error}</div> : null}
        <form onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="username">Usuario</label>
            <input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="password">Clave</label>
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
        </form>
      </div>
    </div>
  );
}
