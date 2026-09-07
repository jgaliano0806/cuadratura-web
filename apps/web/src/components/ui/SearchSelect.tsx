import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';

export type SearchSelectOption = {
  id: string;
  label: string;
  search?: string;
  group?: string;
  action?: boolean;
};

type Props = {
  id?: string;
  options: SearchSelectOption[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  emptyLabel?: string;
  disabled?: boolean;
  allowClear?: boolean;
};

function normalizar(s: string) {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
}

function coincide(o: SearchSelectOption, q: string): boolean {
  const n = normalizar(q);
  if (!n) return true;
  return normalizar([o.label, o.search, o.id, o.group].filter(Boolean).join(' ')).includes(n);
}

export function SearchSelect({
  id,
  options,
  value,
  onChange,
  placeholder = 'Elegí…',
  emptyLabel = 'Nada coincide',
  disabled,
  allowClear,
}: Props) {
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [query, setQuery] = useState('');
  const [hi, setHi] = useState(0);
  const [caja, setCaja] = useState<{
    left: number;
    width: number;
    top?: number;
    bottom?: number;
    maxH: number;
  } | null>(null);

  const elegido = options.find((o) => o.id === value) ?? null;
  const texto = abierto ? query : (elegido?.label ?? '');
  const opciones = useMemo(
    () => options.filter((o) => coincide(o, query)),
    [options, query],
  );

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || listRef.current?.contains(t)) return;
      setAbierto(false);
      setQuery('');
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  useEffect(() => {
    if (!abierto) {
      setCaja(null);
      return;
    }
    function place() {
      const el = wrapRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const gap = 4;
      const below = window.innerHeight - r.bottom - gap;
      const above = r.top - gap;
      const up = below < 200 && above > below;
      const maxH = Math.max(120, Math.min(280, up ? above : below));
      setCaja({
        left: r.left,
        width: Math.max(r.width, 220),
        maxH,
        ...(up
          ? { bottom: window.innerHeight - r.top + gap }
          : { top: r.bottom + gap }),
      });
    }
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [abierto, opciones.length]);

  useEffect(() => {
    if (!abierto) return;
    listRef.current?.querySelector<HTMLElement>('[data-hi="1"]')?.scrollIntoView({
      block: 'nearest',
    });
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
    }
  }

  const grupos: Array<{ nombre: string; items: Array<{ o: SearchSelectOption; i: number }> }> = [];
  opciones.forEach((o, i) => {
    const nombre = o.group || '';
    const last = grupos[grupos.length - 1];
    if (!last || last.nombre !== nombre) grupos.push({ nombre, items: [{ o, i }] });
    else last.items.push({ o, i });
  });

  const sePuedeVaciar = Boolean(allowClear && value && !disabled && !abierto);

  const lista = abierto && caja ? (
    <ul
      id={listId}
      ref={listRef}
      className="people-picker-list is-portal"
      role="listbox"
      style={{
        left: caja.left,
        width: caja.width,
        maxHeight: caja.maxH,
        top: caja.top,
        bottom: caja.bottom,
      }}
    >
      {opciones.length === 0 ? (
        <li className="people-picker-empty">
          {query.trim() ? `${emptyLabel} con “${query.trim()}”.` : emptyLabel}
        </li>
      ) : (
        grupos.map((g) => (
          <li key={g.nombre || 'sin'} className="people-picker-pack">
            {g.nombre ? <div className="people-picker-group">{g.nombre}</div> : null}
            {g.items.map(({ o, i }) => (
              <button
                key={o.id}
                type="button"
                role="option"
                data-hi={i === hi ? '1' : '0'}
                aria-selected={o.id === value}
                className={`people-picker-item${i === hi ? ' is-hi' : ''}${
                  o.id === value ? ' is-sel' : ''
                }${o.action ? ' is-action' : ''}`}
                onMouseEnter={() => setHi(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => elegir(o.id)}
              >
                <span>{o.label}</span>
              </button>
            ))}
          </li>
        ))
      )}
    </ul>
  ) : null;

  return (
    <div
      ref={wrapRef}
      className={`people-picker is-compact${elegido ? ' is-valid' : ''}${abierto ? ' is-open' : ''}${
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
          setHi(0);
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
      {lista ? createPortal(lista, document.body) : null}
    </div>
  );
}
