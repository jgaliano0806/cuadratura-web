import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { EmptyState, SkeletonTable, useToast } from '../components/ui';

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
  const toast = useToast();
  const [rows, setRows] = useState<Position[]>([]);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    setBusy(true);
    api<Position[]>('/operations/mobile4/positions')
      .then(setRows)
      .catch((e) => toast.error(e.message ?? 'Error al cargar Móvil 4.'))
      .finally(() => setBusy(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <h1>Móvil 4</h1>
          <p>Ocupantes vigentes de las posiciones continuas (incluye EXT vinculada).</p>
        </div>
      </header>

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
            {busy && !rows.length ? (
              <SkeletonTable cols={6} rows={4} />
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: 0 }}>
                  <EmptyState
                    compact
                    title="Sin posiciones Móvil 4 vigentes"
                    description="Verificá el seed de Móvil 4 y las vigencias activas."
                  />
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
