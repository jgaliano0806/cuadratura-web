import { useMemo, useState } from 'react';
import {
  cellShortLabel,
  cellTone,
  type DayRow,
  type InspectorRow,
} from '../../lib/scheduleUtils';

type Props = {
  inspectors: InspectorRow[];
  selectedKey: string;
  onSelect: (key: string) => void;
  /** Celda de "hoy" por inspector (opcional). */
  todayByKey?: Map<string, DayRow | undefined>;
  todayIso?: string;
};

export function InspectorMasterList({
  inspectors,
  selectedKey,
  onSelect,
  todayByKey,
  todayIso,
}: Props) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return inspectors;
    return inspectors.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        i.legajo.toLowerCase().includes(q),
    );
  }, [inspectors, query]);

  return (
    <aside className="sap-master" aria-label="Lista de inspectores">
      <div className="sap-master-head">
        <strong>Inspectores</strong>
        <span className="muted">{inspectors.length}</span>
      </div>
      <div className="sap-master-search">
        <input
          type="search"
          placeholder="Buscar…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Buscar inspector"
        />
      </div>
      <button
        type="button"
        className={`sap-master-item${selectedKey === '' ? ' active' : ''}`}
        onClick={() => onSelect('')}
      >
        <span className="sap-master-name">Todos</span>
        <span className="muted">Plantel completo</span>
      </button>
      <div className="sap-master-list">
        {filtered.map((insp) => {
          const today = todayByKey?.get(insp.key);
          const tone = today
            ? cellTone(today.codigo, today.tipo_dia, today.licencia_codigo)
            : 'neutral';
          return (
            <button
              key={insp.key}
              type="button"
              className={`sap-master-item${
                selectedKey === insp.key ? ' active' : ''
              }`}
              onClick={() => onSelect(insp.key)}
            >
              <span className="sap-master-main">
                <span className="sap-master-name">{insp.name}</span>
                {insp.legajo ? (
                  <span className="sap-master-legajo">{insp.legajo}</span>
                ) : null}
              </span>
              {today && todayIso ? (
                <span className={`sap-master-today sap-chip-${tone}`}>
                  {cellShortLabel(today)}
                </span>
              ) : (
                <span className="sap-master-today muted">—</span>
              )}
            </button>
          );
        })}
        {filtered.length === 0 ? (
          <p className="muted" style={{ padding: '0.75rem' }}>
            Sin coincidencias.
          </p>
        ) : null}
      </div>
    </aside>
  );
}
