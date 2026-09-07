import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { etiquetaPersona } from '../../lib/personLabel';

export type Person = {
  id: string;
  nombre_completo: string;
  nombres?: string | null;
  apellido?: string | null;
  legajo?: string | null;
  tipo_plantel?: string | null;
  seccion?: string | null;
};

type Props = {
  id?: string;
  people: Person[];
  value: string;
  onChange: (id: string) => void;
  allowAll?: boolean;
  allLabel?: string;
  /** Permite dejar el campo vacío (X y opción «Sin elegir»). */
  allowClear?: boolean;
  clearLabel?: string;
  placeholder?: string;
  disabled?: boolean;
};

function normalizar(s: string) {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
}

function coincide(p: Person, q: string): boolean {
  const n = normalizar(q);
  if (!n) return true;
  const haystack = normalizar(
    [etiquetaPersona(p), p.nombre_completo, p.nombres, p.apellido, p.legajo]
      .filter(Boolean)
      .join(' '),
  );
  return haystack.includes(n);
}

export function PeoplePicker({
  id,
  people,
  value,
  onChange,
  allowAll = false,
  allLabel = 'Todos',
  allowClear = false,
  clearLabel = 'Sin elegir',
  placeholder = 'Buscar legajo, apellido o nombre…',
  disabled,
}: Props) {
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [query, setQuery] = useState('');
  const [hi, setHi] = useState(0);

  const elegido = people.find((p) => p.id === value) ?? null;
  const texto = abierto
    ? query
    : elegido
      ? etiquetaPersona(elegido)
      : allowAll && !value
        ? allLabel
        : '';
  const sePuedeVaciar = allowClear && Boolean(value);

  const opciones = useMemo(() => {
    const filtradas = people.filter((p) => coincide(p, query));
    const q = normalizar(query);
    const extra: Person[] = [];
    if (allowAll) {
      const visible = !q || normalizar(allLabel).includes(q) || 'todos'.includes(q);
      if (visible) extra.push({ id: '', nombre_completo: allLabel } as Person);
    } else if (allowClear) {
      const visible =
        !q ||
        normalizar(clearLabel).includes(q) ||
        'nadie'.includes(q) ||
        'ninguno'.includes(q);
      if (visible) extra.push({ id: '', nombre_completo: clearLabel } as Person);
    }
    return extra.length ? [...extra, ...filtradas] : filtradas;
  }, [people, query, allowAll, allLabel, allowClear, clearLabel]);

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

  function elegir(idSel: string) {
    onChange(idSel);
    setAbierto(false);
    setQuery('');
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setAbierto(true);
      setHi((i) => Math.min(i + 1, Math.max(0, opciones.length - 1)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHi((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = opciones[hi];
      if (item) elegir(item.id);
    } else if (e.key === 'Escape') {
      setAbierto(false);
      setQuery('');
    } else if (
      allowClear &&
      value &&
      !query &&
      (e.key === 'Backspace' || e.key === 'Delete')
    ) {
      e.preventDefault();
      elegir('');
    }
  }

  const valido = Boolean(elegido) || (allowAll && !value);

  return (
    <div
      ref={wrapRef}
      className={`people-picker${valido ? ' is-valid' : ''}${abierto ? ' is-open' : ''}${
        sePuedeVaciar ? ' has-clear' : ''
      }`}
    >
      <input
        id={id}
        type="text"
        role="combobox"
        autoComplete="off"
        spellCheck={false}
        aria-expanded={abierto}
        aria-controls={listId}
        aria-autocomplete="list"
        disabled={disabled}
        placeholder={placeholder}
        value={texto}
        onFocus={() => {
          setAbierto(true);
          setQuery('');
          const idx = opciones.findIndex((p) => p.id === value);
          setHi(idx >= 0 ? idx : 0);
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setAbierto(true);
          setHi(0);
        }}
        onKeyDown={onKey}
      />
      {sePuedeVaciar ? (
        <button
          type="button"
          className="people-picker-clear"
          aria-label="Quitar"
          tabIndex={-1}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => elegir('')}
        >
          ×
        </button>
      ) : null}
      {abierto && (
        <ul id={listId} ref={listRef} className="people-picker-list" role="listbox">
          {opciones.length === 0 ? (
            <li className="people-picker-empty">Nadie coincide con “{query.trim()}”.</li>
          ) : (
            opciones.map((p, i) => (
              <li key={p.id || (allowAll ? 'all' : 'clear')}>
                <button
                  type="button"
                  role="option"
                  data-hi={i === hi ? '1' : '0'}
                  aria-selected={p.id === value || (!p.id && !value)}
                  className={`people-picker-item${i === hi ? ' is-hi' : ''}${
                    p.id === value || (!p.id && !value) ? ' is-sel' : ''
                  }${!p.id ? ' is-all' : ''}`}
                  onMouseEnter={() => setHi(i)}
                  onClick={() => elegir(p.id)}
                >
                  <span>{p.id ? etiquetaPersona(p) : p.nombre_completo}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
