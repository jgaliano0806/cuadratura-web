import { isoToDmy } from '../../lib/dateRange';
import {
  SHIFTS,
  cellDetailLabel,
  cellTone,
  weekdayLong,
  type DayRow,
} from '../../lib/scheduleUtils';
import type { Licencia } from './LicenciasModal';
import type { ReactNode } from 'react';

export type AbsenceKind = 'VACACION' | 'LICENCIA' | 'FERIADO' | 'ENFERMEDAD';

type Props = {
  cell: DayRow | null;
  dateFrom: string | null;
  dateTo?: string | null;
  editable?: boolean;
  busy?: boolean;
  embedded?: boolean;
  licencias?: Licencia[];
  moviles?: number[];
  children?: ReactNode;
  onClose: () => void;
  onSwap?: () => void;
  onAbsence?: (kind: AbsenceKind) => void;
  onLicencia?: (id: string) => void;
  onTurnoMovil?: (turno: 'M' | 'T' | 'N', movil: number) => void;
};

const ABSENCE_ACTIONS: Array<{ kind: AbsenceKind; label: string }> = [
  { kind: 'VACACION', label: 'Vacaciones' },
  { kind: 'LICENCIA', label: 'Licencia' },
  { kind: 'FERIADO', label: 'Feriado' },
  { kind: 'ENFERMEDAD', label: 'Enfermedad' },
];

function toneTurno(t: string) {
  if (t === 'M') return 'manana';
  if (t === 'T') return 'tarde';
  if (t === 'N') return 'noche';
  return 'neutral';
}

function esTurnoMovil(cell: DayRow, turno: string, movil: number) {
  if (cell.turno === turno && cell.movil === movil) return true;
  return cell.codigo === `${turno}${movil}`;
}

export function DayDetailPanel({
  cell,
  dateFrom,
  dateTo,
  editable = false,
  busy = false,
  embedded = false,
  licencias,
  moviles,
  children,
  onClose,
  onSwap,
  onAbsence,
  onLicencia,
  onTurnoMovil,
}: Props) {
  if (!cell || !dateFrom) {
    const empty = (
      <>
        <div className="sap-detail-empty muted">
          {editable
            ? 'Seleccioná una celda. Para rango, Shift + clic o arrastre en la misma fila.'
            : 'Seleccioná una celda del cronograma para ver el detalle.'}
        </div>
        {children}
      </>
    );
    if (embedded) return empty;
    return (
      <aside className="sap-detail" aria-label="Detalle del día">
        {empty}
      </aside>
    );
  }

  const tone = cellTone(cell.codigo, cell.tipo_dia);
  const label = cellDetailLabel(cell);
  const rangeLabel =
    dateTo && dateTo !== dateFrom
      ? `${isoToDmy(dateFrom)} → ${isoToDmy(dateTo)}`
      : isoToDmy(dateFrom);
  const usaCatalogo = Boolean(onLicencia || onTurnoMovil);
  const bloqueada = busy || !cell.inspector_id;

  const body = (
    <>
      <header className="sap-detail-head">
        <div className="sap-detail-title">
          <h2>
            <span className="sap-detail-kicker">{weekdayLong(dateFrom)}</span>
            {rangeLabel}
          </h2>
        </div>
        <div className={`sap-detail-badge sap-chip-${tone}`}>{label}</div>
        <button
          type="button"
          className="btn secondary sm"
          onClick={onClose}
          aria-label="Cerrar detalle"
        >
          Cerrar
        </button>
      </header>

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
          <dd>{cell.tipo_dia.charAt(0) + cell.tipo_dia.slice(1).toLowerCase()}</dd>
        </div>
        <div>
          <dt>Móvil</dt>
          <dd>{cell.movil != null ? `Móvil ${cell.movil}` : '—'}</dd>
        </div>
      </dl>

      {editable ? (
        <div className="sap-detail-actions">
          {onSwap ? (
            <button
              type="button"
              className="btn amber"
              disabled={bloqueada}
              onClick={onSwap}
            >
              Enroque de turno…
            </button>
          ) : null}
          {usaCatalogo ? (
            <>
              {onLicencia && licencias && licencias.length > 0 ? (
                <div className="sap-detail-pick-group">
                  <span className="sap-detail-pick-label">Licencias</span>
                  <div className="sap-detail-picks">
                    {licencias.map((l) => (
                      <button
                        key={l.id}
                        type="button"
                        className={`sap-detail-pick${
                          cell.licencia_codigo === l.codigo ? ' is-current' : ''
                        }`}
                        style={
                          l.color_fondo
                            ? {
                                background: l.color_fondo,
                                color: l.color_letra || undefined,
                                borderColor: l.color_fondo,
                              }
                            : undefined
                        }
                        disabled={bloqueada}
                        onClick={() => onLicencia(l.id)}
                      >
                        {l.nombre}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              {onTurnoMovil && moviles && moviles.length > 0 ? (
                <div className="sap-detail-pick-group">
                  <span className="sap-detail-pick-label">Turno · Móvil</span>
                  <div className="sap-detail-picks">
                    {moviles.flatMap((m) =>
                      SHIFTS.map((t) => (
                        <button
                          key={`${t}-${m}`}
                          type="button"
                          className={`sap-detail-pick sap-chip-${toneTurno(t)}${
                            esTurnoMovil(cell, t, m) ? ' is-current' : ''
                          }`}
                          disabled={bloqueada}
                          onClick={() => onTurnoMovil(t, m)}
                        >
                          {t} · {m}
                        </button>
                      )),
                    )}
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <div className="sap-detail-absence">
              {ABSENCE_ACTIONS.map((a) => (
                <button
                  key={a.kind}
                  type="button"
                  className="btn secondary sm"
                  disabled={bloqueada}
                  onClick={() => onAbsence?.(a.kind)}
                >
                  {a.label}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : embedded ? null : (
        <p className="muted sap-detail-hint">
          Vista de consulta. Las novedades se gestionan en Cronograma real.
        </p>
      )}
      {children}
    </>
  );

  if (embedded) return body;
  return (
    <aside className="sap-detail" aria-label="Detalle del día">
      {body}
    </aside>
  );
}
