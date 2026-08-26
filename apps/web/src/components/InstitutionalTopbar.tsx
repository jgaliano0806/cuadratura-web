import { useEffect, useState } from 'react';
import { ThemeToggle } from './ThemeToggle';

type Props = {
  userName?: string;
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
export function InstitutionalTopbar({ userName }: Props) {
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
      </div>
      <div className="topbar-theme">
        <ThemeToggle variant="topbar" />
      </div>
    </header>
  );
}
