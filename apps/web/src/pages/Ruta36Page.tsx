import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { EmptyState, Skeleton, useToast } from '../components/ui';

type Position = {
  posicion_codigo: string;
  posicion_nombre: string;
  tipo: string;
  fecha_desde: string | null;
  fecha_hasta: string | null;
  legajo: string | null;
  nombre_completo: string | null;
  movil: number;
  sitio: string | null;
  base_nombre: string;
};

export function Ruta36Page() {
  const toast = useToast();
  const [rows, setRows] = useState<Position[]>([]);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    setBusy(true);
    api<Position[]>('/operations/ruta36/positions')
      .then(setRows)
      .catch((e) => toast.error(e.message ?? 'Error al cargar Ruta 36.'))
      .finally(() => setBusy(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const byMobile = useMemo(() => {
    const map = new Map<number, Position[]>();
    for (const r of rows) {
      const list = map.get(r.movil) ?? [];
      list.push(r);
      map.set(r.movil, list);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [rows]);

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <h1>Ruta 36</h1>
          <p>
            Cuadraturas propias de los móviles 6 (Piedras Moras) y 7 (Arroyo Tegua),
            ciclo 5×3, cobertura objetivo 1 y máximo 2.
          </p>
        </div>
      </header>

      {busy && !rows.length ? (
        <section className="panel">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <Skeleton height="1.4rem" width="30%" />
            <Skeleton block height="2rem" />
            <Skeleton block height="2rem" />
            <Skeleton block height="2rem" />
          </div>
        </section>
      ) : rows.length === 0 ? (
        <EmptyState
          title="Sin posiciones Ruta 36 vigentes"
          description="Todavía no hay ocupantes cargados para los móviles 6 y 7. Verificá el seed de Ruta 36."
        />
      ) : (
        byMobile.map(([m, list]) => (
          <section className="panel" key={m}>
            <h2 style={{ marginTop: 0, fontFamily: 'var(--font-display)' }}>
              Móvil {m}
              {list[0]?.sitio ? ` · ${list[0].sitio}` : ''}
            </h2>
            <table className="data">
              <thead>
                <tr>
                  <th>Inspector</th>
                  <th>Posición</th>
                  <th>Base</th>
                  <th>Vigencia</th>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.posicion_codigo}>
                    <td>
                      <strong>{r.nombre_completo ?? 'Sin ocupante'}</strong>
                      {r.legajo ? (
                        <div className="muted" style={{ fontSize: '0.85em' }}>
                          {r.legajo}
                        </div>
                      ) : null}
                    </td>
                    <td>{r.posicion_codigo}</td>
                    <td>{r.base_nombre}</td>
                    <td>
                      {r.fecha_desde ?? '—'}
                      {r.fecha_hasta ? ` → ${r.fecha_hasta}` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))
      )}
    </div>
  );
}
