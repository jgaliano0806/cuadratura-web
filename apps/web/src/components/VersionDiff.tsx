import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { Modal, SkeletonTable, useToast } from './ui';

type VersionLite = {
  id: string;
  codigo: string;
  numero_version: number;
  estado: string;
  periodo_desde?: string;
  periodo_hasta?: string;
};

type DayRow = {
  fecha_operativa: string;
  codigo: string;
  posicion_codigo: string;
  inspector: string | null;
  legajo: string | null;
  tipo_dia: string;
  movil: number | null;
};

type BoardResponse = { days: DayRow[] };

type Diff = {
  key: string;
  fecha: string;
  inspector: string;
  posicion: string;
  base: string;
  compare: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  baseVersion: VersionLite;
  candidates: VersionLite[];
};

function rowKey(r: DayRow): string {
  return r.legajo || r.inspector || r.posicion_codigo;
}

function toDate(s: string): string {
  return s.slice(0, 10);
}

export function VersionDiff({ open, onClose, baseVersion, candidates }: Props) {
  const toast = useToast();
  const [otherId, setOtherId] = useState(candidates[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [baseBoard, setBaseBoard] = useState<BoardResponse | null>(null);
  const [compareBoard, setCompareBoard] = useState<BoardResponse | null>(null);

  useEffect(() => {
    if (!open) return;
    setOtherId(candidates.find((v) => v.id !== baseVersion.id)?.id ?? '');
    setBaseBoard(null);
    setCompareBoard(null);
  }, [open, baseVersion, candidates]);

  async function runCompare() {
    if (!otherId) return;
    setBusy(true);
    setBaseBoard(null);
    setCompareBoard(null);
    try {
      const [a, b] = await Promise.all([
        api<BoardResponse>(`/planning/${baseVersion.id}/calendar`),
        api<BoardResponse>(`/planning/${otherId}/calendar`),
      ]);
      setBaseBoard(a);
      setCompareBoard(b);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al comparar.');
    } finally {
      setBusy(false);
    }
  }

  const diffs = useMemo<Diff[]>(() => {
    if (!baseBoard || !compareBoard) return [];
    const bMap = new Map<string, DayRow>();
    for (const r of baseBoard.days) {
      bMap.set(`${rowKey(r)}|${toDate(r.fecha_operativa)}`, r);
    }
    const cMap = new Map<string, DayRow>();
    for (const r of compareBoard.days) {
      cMap.set(`${rowKey(r)}|${toDate(r.fecha_operativa)}`, r);
    }
    const keys = new Set<string>([...bMap.keys(), ...cMap.keys()]);
    const list: Diff[] = [];
    for (const k of keys) {
      const a = bMap.get(k);
      const c = cMap.get(k);
      const aCode = a?.codigo ?? '·';
      const cCode = c?.codigo ?? '·';
      if (aCode === cCode) continue;
      const ref = a ?? c!;
      list.push({
        key: k,
        fecha: toDate(ref.fecha_operativa),
        inspector: ref.inspector || ref.posicion_codigo,
        posicion: ref.posicion_codigo,
        base: aCode,
        compare: cCode,
      });
    }
    list.sort(
      (a, b) =>
        a.fecha.localeCompare(b.fecha) || a.inspector.localeCompare(b.inspector),
    );
    return list;
  }, [baseBoard, compareBoard]);

  const other = candidates.find((v) => v.id === otherId);

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={`Comparar ${baseVersion.codigo} v${baseVersion.numero_version}`}
      description="Muestra las celdas del cronograma que difieren entre dos versiones."
      footer={
        <>
          <button type="button" className="btn secondary" onClick={onClose}>
            Cerrar
          </button>
        </>
      }
    >
      <div className="filters">
        <div className="field" style={{ minWidth: 280 }}>
          <label htmlFor="cmp">Comparar contra</label>
          <select
            id="cmp"
            value={otherId}
            onChange={(e) => setOtherId(e.target.value)}
          >
            {candidates
              .filter((v) => v.id !== baseVersion.id)
              .map((v) => (
                <option key={v.id} value={v.id}>
                  {v.codigo} v{v.numero_version} · {v.estado}
                </option>
              ))}
          </select>
        </div>
        <button
          type="button"
          className="btn"
          onClick={() => void runCompare()}
          disabled={!otherId || busy}
        >
          {busy ? 'Comparando…' : 'Comparar'}
        </button>
      </div>

      {baseBoard && compareBoard ? (
        <p className="muted" style={{ marginTop: '0.5rem' }}>
          {diffs.length === 0
            ? 'Ambas versiones tienen los mismos códigos en cada celda del rango.'
            : `${diffs.length} celda${diffs.length === 1 ? '' : 's'} con diferencias entre ${baseVersion.codigo} v${baseVersion.numero_version} y ${other?.codigo} v${other?.numero_version}.`}
        </p>
      ) : null}

      <div className="xlsx-scroll" style={{ maxHeight: '50vh' }}>
        <table className="data">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Inspector</th>
              <th>Posición</th>
              <th>Base</th>
              <th>Comparación</th>
            </tr>
          </thead>
          <tbody>
            {busy ? (
              <SkeletonTable cols={5} rows={6} />
            ) : diffs.length === 0 ? (
              <tr>
                <td colSpan={5} className="muted">
                  {baseBoard && compareBoard
                    ? 'Sin diferencias.'
                    : 'Elegí una versión y ejecutá "Comparar".'}
                </td>
              </tr>
            ) : (
              diffs.slice(0, 500).map((d) => (
                <tr key={d.key}>
                  <td>{d.fecha}</td>
                  <td>{d.inspector}</td>
                  <td>{d.posicion}</td>
                  <td>
                    <span className="badge neutral">{d.base}</span>
                  </td>
                  <td>
                    <span className="badge warn">{d.compare}</span>
                  </td>
                </tr>
              ))
            )}
            {diffs.length > 500 ? (
              <tr>
                <td colSpan={5} className="muted">
                  Mostrando 500 de {diffs.length} diferencias. Acotá el rango
                  para ver todas.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
