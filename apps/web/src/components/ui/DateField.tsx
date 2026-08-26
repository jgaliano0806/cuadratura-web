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
};

export function DateField({
  id,
  value,
  min,
  max,
  onChange,
  'aria-label': ariaLabel,
  disabled,
}: Props) {
  const [text, setText] = useState(() => isoToDmy(value));

  useEffect(() => {
    setText(isoToDmy(value));
  }, [value]);

  function commit(raw: string) {
    const iso = parseDmy(raw);
    if (!iso) {
      setText(isoToDmy(value));
      return;
    }
    onChange(iso);
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
        onChange={(e) => setText(e.target.value)}
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
          if (e.target.value) onChange(e.target.value);
        }}
      />
    </span>
  );
}
