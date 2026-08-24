import {
  cellDetailLabel,
  cellTone,
  weekdayLong,
  type DayRow,
} from '../../lib/scheduleUtils';

export type AbsenceKind = 'VACACION' | 'LICENCIA' | 'FERIADO' | 'ENFERMEDAD';

type Props = {
  cell: DayRow | null;
  dateFrom: string | null;
  dateTo?: string | null;
  editable?: boolean;
  busy?: boolean;
  onClose: () => void;
  onSwap?: () => void;
  onAbsence?: (kind: AbsenceKind) => void;
};

const ABSENCE_ACTIONS: Array<{ kind: AbsenceKind; label: string }> = [
  { kind: 'VACACION', label: 'Vacaciones' },
  { kind: 'LICENCIA', label: 'Licencia' },
  { kind: 'FERIADO', label: 'Feriado' },
  { kind: 'ENFERMEDAD', label: 'Enfermedad' },
];

export function DayDetailPanel({
  cell,
  dateFrom,
  dateTo,
  editable = false,
  busy = false,
  onClose,
  onSwap,
  onAbsence,
}: Props) {
  if (!cell || !dateFrom) {
    return (
      <aside className="sap-detail" aria-label="Detalle del día">
        <div className="sap-detail-empty muted">
          {editable
            ? 'Seleccioná una celda. Para rango, hacé click en otra fecha del mismo inspector.'
            : 'Seleccioná una celda del cronograma para ver el detalle.'}
        </div>
      </aside>
    );
  }

  const tone = cellTone(cell.codigo, cell.tipo_dia);
  const label = cellDetailLabel(cell);
  const rangeLabel =
    dateTo && dateTo !== dateFrom ? `${dateFrom} → ${dateTo}` : dateFrom;

  return (
    <aside className="sap-detail" aria-label="Detalle del día">
      <header className="sap-detail-head">
        <div>
          <div className="sap-detail-kicker">{weekdayLong(dateFrom)}</div>
          <h2>{rangeLabel}</h2>
        </div>
        <button
          type="button"
          className="btn secondary sm"
          onClick={onClose}
          aria-label="Cerrar detalle"
        >
          Cerrar
        </button>
      </header>

      <div className={`sap-detail-badge sap-chip-${tone}`}>{label}</div>

      <dl className="sap-detail-grid">
        <div>
          <dt>Inspector</dt>
          <dd>{cell.inspector ?? '—'}</dd>
        </div>
        <div>
          <dt>Legajo</dt>
          <dd>{cell.legajo || '—'}</dd>
        </div>
        <div>
          <dt>Posición</dt>
          <dd>{cell.posicion_codigo}</dd>
        </div>
        <div>
          <dt>Código</dt>
          <dd>
            <code>{cell.codigo}</code>
          </dd>
        </div>
        <div>
          <dt>Tipo de día</dt>
          <dd>{cell.tipo_dia}</dd>
        </div>
        <div>
          <dt>Móvil</dt>
          <dd>{cell.movil != null ? `Móvil ${cell.movil}` : '—'}</dd>
        </div>
      </dl>

      {editable ? (
        <div className="sap-detail-actions">
          <p className="muted sap-detail-hint" style={{ marginTop: 0 }}>
            Los cambios se aplican en la capa real. La cuadratura ideal no se
            modifica.
          </p>
          <button
            type="button"
            className="btn amber"
            disabled={busy || !cell.inspector_id}
            onClick={onSwap}
          >
            Enroque de turno…
          </button>
          <div className="sap-detail-absence">
            {ABSENCE_ACTIONS.map((a) => (
              <button
                key={a.kind}
                type="button"
                className="btn secondary sm"
                disabled={busy || !cell.inspector_id}
                onClick={() => onAbsence?.(a.kind)}
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <p className="muted sap-detail-hint">
          Vista de consulta. Las novedades se gestionan en Cronograma real.
        </p>
      )}
    </aside>
  );
}
