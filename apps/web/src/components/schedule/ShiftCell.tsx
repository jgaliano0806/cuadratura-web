import {
  cellShortLabel,
  cellTone,
  resolveCodeColors,
  type DayRow,
} from '../../lib/scheduleUtils';

type Props = {
  cell: DayRow;
  date: string;
  selected?: boolean;
  rangeSelected?: boolean;
  differs?: boolean;
  onSelect?: (cell: DayRow, date: string, opts?: { extend?: boolean }) => void;
};

export function ShiftCell({
  cell,
  date,
  selected,
  rangeSelected,
  differs,
  onSelect,
}: Props) {
  const tone = cellTone(cell.codigo, cell.tipo_dia, cell.licencia_codigo);
  const label = cellShortLabel(cell);
  const mismoCodigo =
    (cell.codigo || '').trim().toUpperCase() === (label || '').toUpperCase();
  const colors = resolveCodeColors(
    label || cell.codigo,
    cell.tipo_dia,
    mismoCodigo ? cell.licencia_color_fondo : null,
    mismoCodigo ? cell.licencia_color_letra : null,
    cell.licencia_codigo,
  );
  const tint = colors ? { background: colors.bg, color: colors.fg } : undefined;
  const className = `sap-cell sap-cell-${tone}${selected ? ' selected' : ''}${
    rangeSelected ? ' in-range' : ''
  }${differs ? ' differs' : ''}${onSelect ? '' : ' readonly'}${tint ? ' has-tint' : ''}${
    !label ? ' is-blank' : ''
  }`;
  const title = label ? `${date} · ${label}` : `${date} · Completar`;

  if (!onSelect) {
    return (
      <span className={className} title={title} style={tint}>
        <span className="sap-cell-code">{label}</span>
      </span>
    );
  }

  return (
    <button
      type="button"
      className={className}
      title={title}
      style={tint}
      tabIndex={selected ? 0 : -1}
      onMouseDown={(e) => {
        if (e.button !== 0) return;
        onSelect(cell, date, { extend: e.shiftKey });
      }}
      onMouseEnter={(e) => {
        if (e.buttons !== 1) return;
        onSelect(cell, date, { extend: true });
      }}
    >
      <span className="sap-cell-code">{label}</span>
    </button>
  );
}
