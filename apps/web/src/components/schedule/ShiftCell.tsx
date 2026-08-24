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
  onSelect?: (cell: DayRow, date: string, opts?: { extend?: boolean }) => void;
};

export function ShiftCell({
  cell,
  date,
  selected,
  rangeSelected,
  onSelect,
}: Props) {
  const tone = cellTone(cell.codigo, cell.tipo_dia);
  const label = cellShortLabel(cell);

  return (
    <button
      type="button"
      className={`sap-cell sap-cell-${tone}${selected ? ' selected' : ''}${
        rangeSelected ? ' in-range' : ''
      }`}
      title={`${date} · ${label}`}
      onClick={(e) =>
        onSelect?.(cell, date, { extend: e.shiftKey })
      }
    >
      <span className="sap-cell-code">{label}</span>
    </button>
  );
}
