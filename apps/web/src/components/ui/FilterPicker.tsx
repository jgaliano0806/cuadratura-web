import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';

export type FilterOption = {
  id: string;
  label: string;
  search?: string;
};

type Props = {
  id?: string;
  options: FilterOption[];
  values: string[];
  onChange: (ids: string[]) => void;
  allLabel?: string;
  placeholder?: string;
  className?: string;
  'aria-label'?: string;
};

function normalizar(s: string) {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
}

function coincide(o: FilterOption, q: string): boolean {
  const n = normalizar(q);
  if (!n) return true;
  return normalizar([o.label, o.search, o.id].filter(Boolean).join(' ')).includes(n);
}

export function FilterPicker({
  id,
  options,
  values,
  onChange,
  allLabel = 'Todos',
  placeholder = 'Buscar…',
  className,
  'aria-label': ariaLabel,
}: Props) {
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [query, setQuery] = useState('');
  const [hi, setHi] = useState(0);
  const activos = new Set(values);

  const opciones = useMemo(() => {
    const filtradas = options.filter((o) => coincide(o, query));
    const sel = filtradas.filter((o) => activos.has(o.id));
    const resto = filtradas.filter((o) => !activos.has(o.id));
    return [...sel, ...resto];
  }, [options, query, values]);

  const textoCerrado =
    values.length === 0
      ? allLabel
      : values.length === 1
        ? (options.find((o) => o.id === values[0])?.label ?? '1 seleccionado')
        : `${values.length} seleccionados`;

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setAbierto(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  useEffect(() => {
    if (!abierto) return;
    const el = listRef.current?.querySelector<HTMLElement>('[data-hi="1"]');
    el?.scrollIntoView({ block: 'nearest' });
  }, [hi, abierto]);

  function toggle(idSel: string) {
    if (!idSel) {
      onChange([]);
      return;
    }
    if (activos.has(idSel)) onChange(values.filter((v) => v !== idSel));
    else onChange([...values, idSel]);
  }

  const filas = [
    { id: '', label: allLabel },
    ...opciones,
  ];

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setAbierto(true);
      setHi((i) => Math.min(i + 1, Math.max(0, filas.length - 1)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHi((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = filas[hi];
      if (item) toggle(item.id);
    } else if (e.key === 'Escape') {
      setAbierto(false);
      setQuery('');
    }
  }

  return (
    <div
      ref={wrapRef}
      className={`people-picker filter-picker${values.length ? ' is-on' : ' is-valid'}${
        abierto ? ' is-open' : ''
      }${className ? ` ${className}` : ''}`}
    >
      <input
        id={id}
        type="text"
        role="combobox"
        autoComplete="off"
        spellCheck={false}
        aria-label={ariaLabel}
        aria-expanded={abierto}
        aria-controls={listId}
        aria-autocomplete="list"
        placeholder={placeholder}
        value={abierto ? query : textoCerrado}
        onFocus={() => {
          setAbierto(true);
          setQuery('');
          setHi(0);
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setAbierto(true);
          setHi(0);
        }}
        onKeyDown={onKey}
      />
      {abierto && (
        <ul id={listId} ref={listRef} className="people-picker-list" role="listbox">
          {opciones.length === 0 && query.trim() ? (
            <li className="people-picker-empty">Nada coincide con “{query.trim()}”.</li>
          ) : (
            filas.map((o, i) => {
              const sel = o.id ? activos.has(o.id) : values.length === 0;
              return (
                <li key={o.id || 'all'}>
                  <button
                    type="button"
                    role="option"
                    data-hi={i === hi ? '1' : '0'}
                    aria-selected={sel}
                    className={`people-picker-item${i === hi ? ' is-hi' : ''}${
                      sel ? ' is-sel' : ''
                    }${!o.id ? ' is-all' : ''}`}
                    onMouseEnter={() => setHi(i)}
                    onClick={() => toggle(o.id)}
                  >
                    <span>{o.label}</span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
