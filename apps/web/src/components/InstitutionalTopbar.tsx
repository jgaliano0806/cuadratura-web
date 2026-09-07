import { useEffect, useState } from 'react';
import { useBoxTheme, type TopbarId } from '../lib/boxTheme';
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
  const { topbar } = useBoxTheme();

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const values: Record<TopbarId, { label: string; value: string; mono?: boolean } | null> = {
    hora: { label: 'Hora actual', value: formatClock(now), mono: true },
    fecha: { label: 'Fecha', value: formatDate(now) },
    operador: userName ? { label: 'Operador', value: userName } : null,
  };

  return (
    <header className="topbar no-print">
      <div className="topbar-brand">
        <div className="topbar-titles">
          <strong>Cuadratura operativa</strong>
          <span>Planificación de inspectores y móviles · Caminos de las Sierras</span>
        </div>
      </div>

      <div className="topbar-meta">
        {topbar
          .filter((t) => t.visible)
          .map((t) => {
            const item = values[t.id];
            if (!item) return null;
            return (
              <div key={t.id} className="topbar-stat">
                <span className="topbar-stat-label">{item.label}</span>
                <strong className={`topbar-stat-value${item.mono ? ' mono' : ''}`}>
                  {item.value}
                </strong>
              </div>
            );
          })}
      </div>
      <div className="topbar-theme">
        <ThemeToggle variant="topbar" />
      </div>
    </header>
  );
}
