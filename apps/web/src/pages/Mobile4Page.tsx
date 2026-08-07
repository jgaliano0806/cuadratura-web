import { useEffect, useState } from 'react';
import { api } from '../lib/api';

type Position = {
  posicion_codigo: string;
  posicion_nombre: string;
  tipo: string;
  fecha_desde: string | null;
  fecha_hasta: string | null;
  legajo: string | null;
  nombre_completo: string | null;
  grupo_vinculado: string | null;
  rol: string | null;
};

export function Mobile4Page() {
  const [rows, setRows] = useState<Position[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api<Position[]>('/operations/mobile4/positions')
      .then(setRows)
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <h1>Móvil 4</h1>
          <p>Ocupantes vigentes de las posiciones continuas (incluye EXT vinculada).</p>
        </div>
      </header>

      {error ? <div className="error-box">{error}</div> : null}

      <section className="panel">
        <table className="data">
          <thead>
            <tr>
              <th>Inspector</th>
              <th>Posición</th>
              <th>Tipo</th>
              <th>Vigencia</th>
              <th>Dupla</th>
              <th>Rol</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="muted">
                  Sin posiciones Móvil 4 vigentes.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.posicion_codigo}>
                  <td>
                    <strong>{r.nombre_completo ?? 'Sin ocupante'}</strong>
                  </td>
                  <td>
                    <span>{r.posicion_codigo}</span>
                  </td>
                  <td>{r.tipo}</td>
                  <td>
                    {r.fecha_desde ?? '—'}
                    {r.fecha_hasta ? ` → ${r.fecha_hasta}` : ''}
                  </td>
                  <td>{r.grupo_vinculado ?? '—'}</td>
                  <td>{r.rol ?? '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
