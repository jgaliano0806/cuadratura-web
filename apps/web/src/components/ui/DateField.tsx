import { useEffect, useState, type KeyboardEvent } from 'react';
import { isIsoDate, isoToDmy, parseDmy } from '../../lib/dateRange';

type Props = {
  id?: string;
  value: string;
  min?: string;
  max?: string;
  onChange: (iso: string) => void;
  'aria-label'?: string;
  disabled?: boolean;
  allowClear?: boolean;
};

export function DateField({
  id,
  value,
  min,
  max,
  onChange,
  'aria-label': ariaLabel,
  disabled,
  allowClear = false,
}: Props) {
  const [text, setText] = useState(() => isoToDmy(value));

  useEffect(() => {
    setText(isoToDmy(value));
  }, [value]);

  function commit(raw: string) {
    if (allowClear && !raw.trim()) {
      setText('');
      if (value) onChange('');
      return;
    }
    const iso = parseDmy(raw);
    if (!iso) {
      setText(isoToDmy(value));
      return;
    }
    if (iso !== value) onChange(iso);
    else setText(isoToDmy(iso));
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    commit(text);
  }

  return (
    <span className="date-field">
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="dd/mm/yyyy"
        aria-label={ariaLabel}
        value={text}
        disabled={disabled}
        onChange={(e) => {
          const raw = e.target.value;
          setText(raw);
          const iso = parseDmy(raw);
          if (iso && iso !== value) onChange(iso);
          else if (allowClear && !raw.trim() && value) onChange('');
        }}
        onBlur={() => commit(text)}
        onKeyDown={onKey}
      />
      <input
        className="date-field-cal"
        type="date"
        aria-label={ariaLabel ? `${ariaLabel}, calendario` : 'Calendario'}
        value={isIsoDate(value) ? value : ''}
        min={min || undefined}
        max={max || undefined}
        disabled={disabled}
        onChange={(e) => {
          const v = e.target.value;
          if (v) onChange(v);
          else if (allowClear && value) onChange('');
        }}
      />
    </span>
  );
}
