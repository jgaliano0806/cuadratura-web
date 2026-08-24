import { useMemo, useState } from 'react';
import { Modal } from '../ui';
import type { DayRow } from '../../lib/scheduleUtils';
import { cellShortLabel } from '../../lib/scheduleUtils';

export type CatalogInspector = {
  id: string;
  nombre_completo: string;
  estado?: string;
};

type Props = {
  open: boolean;
  source: DayRow | null;
  dateFrom: string;
  dateTo: string;
  inspectors: CatalogInspector[];
  busy?: boolean;
  onClose: () => void;
  onConfirm: (payload: {
    inspectorBId: string;
    reason: string;
  }) => void | Promise<void>;
};

export function SwapInspectorsModal({
  open,
  source,
  dateFrom,
  dateTo,
  inspectors,
  busy = false,
  onClose,
  onConfirm,
}: Props) {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [reason, setReason] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const exclude = source?.inspector_id ?? '';
    return inspectors
      .filter((i) => i.id !== exclude)
      .filter(
        (i) =>
          !q ||
          i.nombre_completo.toLowerCase().includes(q) ||
          i.id.toLowerCase().includes(q),
      );
  }, [inspectors, query, source?.inspector_id]);

  const selected = filtered.find((i) => i.id === selectedId) ?? null;
  const canSave =
    !!source?.inspector_id &&
    !!selectedId &&
    reason.trim().length >= 5 &&
    !busy;

  const rangeLabel =
    dateFrom === dateTo ? dateFrom : `${dateFrom} → ${dateTo}`;

  return (
    <Modal
      open={open}
      onClose={busy ? () => undefined : onClose}
      title="Enroque de turno"
      description="Intercambiá destino operativo con otro inspector. La cuadratura ideal se conserva."
      size="lg"
      dismissOnBackdrop={!busy}
      dismissOnEsc={!busy}
      footer={
        <>
          <button
            type="button"
            className="btn secondary"
            onClick={onClose}
            disabled={busy}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="btn amber"
            disabled={!canSave}
            onClick={() =>
              void onConfirm({
                inspectorBId: selectedId,
                reason: reason.trim(),
              })
            }
          >
            {busy ? 'Aplicando…' : 'Confirmar enroque'}
          </button>
        </>
      }
    >
      <div className="swap-modal">
        <div className="swap-source">
          <strong>Origen</strong>
          <div>
            {source?.inspector ?? '—'} · {source ? cellShortLabel(source) : '—'} · {rangeLabel}
          </div>
        </div>

        <div className="field">
          <label htmlFor="swap-search">Buscar inspector (lista completa)</label>
          <input
            id="swap-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nombre…"
            autoFocus
          />
        </div>

        <div className="swap-list" role="listbox" aria-label="Inspectores">
          {filtered.map((insp) => (
            <button
              key={insp.id}
              type="button"
              role="option"
              aria-selected={selectedId === insp.id}
              className={`swap-item${selectedId === insp.id ? ' active' : ''}`}
              onClick={() => setSelectedId(insp.id)}
            >
              {insp.nombre_completo}
            </button>
          ))}
          {filtered.length === 0 ? (
            <p className="muted" style={{ padding: '0.75rem' }}>
              Sin coincidencias.
            </p>
          ) : null}
        </div>

        {selected ? (
          <p className="muted">
            Enroque: <strong>{source?.inspector}</strong> ⇄{' '}
            <strong>{selected.nombre_completo}</strong>
          </p>
        ) : null}

        <div className="field">
          <label htmlFor="swap-reason">Motivo (mín. 5 caracteres)</label>
          <textarea
            id="swap-reason"
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ej. cobertura operativa del turno tarde"
          />
        </div>
      </div>
    </Modal>
  );
}
