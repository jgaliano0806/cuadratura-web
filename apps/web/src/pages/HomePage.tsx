import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';

type InitRow = {
  id: string;
  estado: string;
  archivo_original: string;
  creado_en: string;
};

export function HomePage() {
  const [rows, setRows] = useState<InitRow[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api<InitRow[]>('/initialization/status')
      .then(setRows)
      .catch((e) => setError(e.message));
  }, []);

  const latest = rows[0];

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <h1>Operación diaria</h1>
          <p>Estado de inicialización, planificación y cobertura.</p>
        </div>
      </header>

      {error ? <div className="error-box">{error}</div> : null}

      <section className="panel">
        <h2 style={{ marginTop: 0, fontFamily: 'var(--font-display)' }}>
          Inicialización
        </h2>
        {latest ? (
          <p>
            Último estado: <span className="badge neutral">{latest.estado}</span>{' '}
            — {latest.archivo_original}
          </p>
        ) : (
          <p className="muted">Aún no hay inicializaciones registradas.</p>
        )}
        <Link className="btn secondary" to="/inicializacion">
          Ir a inicialización
        </Link>
      </section>

      <section className="panel">
        <h2 style={{ marginTop: 0, fontFamily: 'var(--font-display)' }}>
          Accesos rápidos
        </h2>
        <div className="filters">
          <Link className="btn" to="/calendario">
            Calendario
          </Link>
          <Link className="btn amber" to="/huecos">
            Tablero de huecos
          </Link>
          <Link className="btn secondary" to="/aprobacion">
            Aprobación
          </Link>
        </div>
      </section>
    </div>
  );
}
