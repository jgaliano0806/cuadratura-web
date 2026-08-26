import {
  cellShortLabel,
  cellTone,
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
  const tone = cellTone(cell.codigo, cell.tipo_dia);
  const label = cellShortLabel(cell);
  const tint =
    cell.licencia_codigo && (cell.licencia_color_fondo || cell.licencia_color_letra)
      ? {
          background: cell.licencia_color_fondo || undefined,
          color: cell.licencia_color_letra || undefined,
        }
      : undefined;
  const className = `sap-cell sap-cell-${tone}${selected ? ' selected' : ''}${
    rangeSelected ? ' in-range' : ''
  }${differs ? ' differs' : ''}${onSelect ? '' : ' readonly'}${tint ? ' has-tint' : ''}`;

  if (!onSelect) {
    return (
      <span className={className} title={`${date} · ${label}`} style={tint}>
        <span className="sap-cell-code">{label}</span>
      </span>
    );
  }

  return (
    <button
      type="button"
      className={className}
      title={`${date} · ${label}`}
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
