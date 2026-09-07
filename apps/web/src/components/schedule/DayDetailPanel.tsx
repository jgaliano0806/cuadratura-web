import { isoToDmy } from '../../lib/dateRange';
import {
  SHIFT_LABEL,
  SHIFTS,
  cellDetailLabel,
  cellShortLabel,
  cellTone,
  resolveCodeColors,
  toDateOnly,
  weekdayAbbrev,
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
  /** Celdas del rango (si no, solo `cell`). */
  rango?: DayRow[];
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
  rango,
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

  const celdas = rango && rango.length ? rango : [cell];
  const porCodigo = new Map<string, DayRow>();
  for (const d of celdas) {
    const k = d.codigo || d.tipo_dia;
    if (!porCodigo.has(k)) porCodigo.set(k, d);
  }
  const unicos = [...porCodigo.values()];
  const mixto = unicos.length > 1;
  const tone = mixto ? 'neutral' : cellTone(cell.codigo, cell.tipo_dia, cell.licencia_codigo);
  const label = mixto
    ? `${unicos.length} códigos en el rango`
    : cellDetailLabel(cell);
  const rangeLabel =
    dateTo && dateTo !== dateFrom
      ? `${weekdayAbbrev(dateFrom)} ${isoToDmy(dateFrom).slice(0, 5)} → ${weekdayAbbrev(dateTo)} ${isoToDmy(dateTo).slice(0, 5)}`
      : `${weekdayLong(dateFrom)} ${isoToDmy(dateFrom).slice(0, 5)}`;
  const rangeLabelLargo =
    dateTo && dateTo !== dateFrom
      ? `${isoToDmy(dateFrom)} → ${isoToDmy(dateTo)}`
      : isoToDmy(dateFrom);
  const usaCatalogo = Boolean(onLicencia || onTurnoMovil);
  const bloqueada = busy || !cell.inspector_id;
  const varios = celdas.length > 1;

  const ficha = (
    <dl className="sap-detail-grid">
      <div className="sap-detail-span">
        <dt>Legajo</dt>
        <dd>{cell.legajo || '—'}</dd>
      </div>
      <div className="sap-detail-span">
        <dt>Apellido y nombre</dt>
        <dd>{cell.inspector ?? '—'}</dd>
      </div>
      {mixto ? null : (
        <>
          <div>
            <dt>Turno</dt>
            <dd>
              {cell.turno && SHIFT_LABEL[cell.turno]
                ? SHIFT_LABEL[cell.turno]
                : /^[MTN]/.test(cell.codigo || '')
                  ? SHIFT_LABEL[(cell.codigo || '')[0]]
                  : cellDetailLabel(cell)}
            </dd>
          </div>
          <div>
            <dt>Móvil</dt>
            <dd>{cell.movil != null ? cell.movil : '—'}</dd>
          </div>
        </>
      )}
    </dl>
  );

  const dias = (
    <div className="sap-detail-dias" aria-label="Días del rango">
      {celdas.map((d) => {
        const f = toDateOnly(d.fecha_operativa);
        const toneDia = cellTone(d.codigo, d.tipo_dia, d.licencia_codigo);
        return (
          <div key={f} className="sap-detail-dia" title={cellDetailLabel(d)}>
            <span className="sap-detail-dia-wd">{weekdayAbbrev(f)}</span>
            <span className="sap-detail-dia-num">{isoToDmy(f).slice(0, 5)}</span>
            <span className={`sap-detail-dot sap-cell-${toneDia}`}>
              {cellShortLabel(d) || '·'}
            </span>
          </div>
        );
      })}
    </div>
  );

  if (embedded) {
    return (
      <div className="sap-detail-card">
        <div className="sap-detail-card-top">
          <h2>{rangeLabel}</h2>
        </div>
        <div className="sap-detail-strip" aria-label="Códigos">
          {celdas.map((d) => {
            const f = toDateOnly(d.fecha_operativa);
            return (
              <span
                key={f}
                className={`sap-detail-dot sap-cell-${cellTone(d.codigo, d.tipo_dia, d.licencia_codigo)}`}
                title={`${weekdayAbbrev(f)} ${isoToDmy(f).slice(0, 5)} · ${cellDetailLabel(d)}`}
              >
                {cellShortLabel(d) || '·'}
              </span>
            );
          })}
        </div>
        {ficha}
        {children}
      </div>
    );
  }

  const body = (
    <>
      <header className="sap-detail-head">
        <div className="sap-detail-title">
          <h2>
            <span className="sap-detail-kicker">{weekdayLong(dateFrom)}</span>
            {rangeLabelLargo}
          </h2>
        </div>
        {mixto ? null : (
          <div className={`sap-detail-badge sap-chip-${tone}`}>{label}</div>
        )}
        <button
          type="button"
          className="btn secondary sm"
          onClick={onClose}
          aria-label="Cerrar detalle"
        >
          Cerrar
        </button>
        {varios ? dias : null}
      </header>
      {ficha}

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
                  <span className="sap-detail-pick-label">Códigos</span>
                  <div className="sap-detail-picks">
                    {licencias.map((l) => {
                      const colores = resolveCodeColors(
                        l.codigo,
                        '',
                        l.color_fondo,
                        l.color_letra,
                      );
                      return (
                      <button
                        key={l.id}
                        type="button"
                        className={`sap-detail-pick${
                          cell.licencia_codigo === l.codigo ? ' is-current' : ''
                        }`}
                        style={
                          colores
                            ? {
                                background: colores.bg,
                                color: colores.fg,
                                borderColor: colores.bg,
                              }
                            : undefined
                        }
                        disabled={bloqueada}
                        onClick={() => onLicencia(l.id)}
                        title={l.horario || l.nombre}
                      >
                        {l.codigo}
                      </button>
                      );
                    })}
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

  return (
    <aside className="sap-detail" aria-label="Detalle del día">
      {body}
    </aside>
  );
}
