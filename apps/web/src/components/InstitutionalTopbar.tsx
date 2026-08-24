import { useEffect, useState } from 'react';
import { ThemeToggle } from './ThemeToggle';

type Props = {
  userName?: string;
  onSearch?: () => void;
};

function formatClock(d: Date) {
  return d.toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function formatDate(d: Date) {
  return d.toLocaleDateString('es-AR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Barra superior institucional (inspirada en el panel operativo):
 * marca + reloj en vivo + estado + toggle de tema.
 */
export function InstitutionalTopbar({ userName, onSearch }: Props) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <header className="topbar no-print">
      <div className="topbar-brand">
        <div className="topbar-titles">
          <strong>Cuadratura operativa</strong>
          <span>Planificación de inspectores y móviles · Caminos de las Sierras</span>
        </div>
        <span className="live-badge" title="Sesión activa">
          <span className="live-dot" aria-hidden />
          EN VIVO
        </span>
      </div>

      <div className="topbar-meta">
        <div className="topbar-stat">
          <span className="topbar-stat-label">Hora actual</span>
          <strong className="topbar-stat-value mono">{formatClock(now)}</strong>
        </div>
        <div className="topbar-stat">
          <span className="topbar-stat-label">Fecha</span>
          <strong className="topbar-stat-value">{formatDate(now)}</strong>
        </div>
        {userName ? (
          <div className="topbar-stat">
            <span className="topbar-stat-label">Operador</span>
            <strong className="topbar-stat-value">{userName}</strong>
          </div>
        ) : null}
        {onSearch ? (
          <button
            type="button"
            className="btn secondary sm"
            onClick={onSearch}
            title="Buscar (Ctrl + K)"
          >
            Buscar ⌘K
          </button>
        ) : null}
        <ThemeToggle variant="topbar" />
      </div>
    </header>
  );
}
