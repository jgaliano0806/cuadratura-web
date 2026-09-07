import { useEffect, useId, useRef, useState } from 'react';

export type ExcelMenuItem = {
  id: string;
  label: string;
  hint?: string;
};

type Props = {
  items: ExcelMenuItem[];
  onPick: (id: string) => void;
  busy?: boolean;
  disabled?: boolean;
  label?: string;
};

function IconoExcel() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
      <rect x="1.5" y="2" width="13" height="12" rx="1.4" fill="currentColor" opacity="0.18" />
      <path
        d="M3.2 2.6h9.6c.4 0 .7.3.7.7v9.4c0 .4-.3.7-.7.7H3.2a.7.7 0 0 1-.7-.7V3.3c0-.4.3-.7.7-.7Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.15"
      />
      <path d="M6.1 2.6v10.8M1.8 6h12.4M1.8 10h12.4" stroke="currentColor" strokeWidth="1.05" />
    </svg>
  );
}

export function ExcelMenu({
  items,
  onPick,
  busy,
  disabled,
  label = 'Excel',
}: Props) {
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [abierto, setAbierto] = useState(false);
  const unico = items.length === 1;
  const apagado = Boolean(disabled || busy);

  useEffect(() => {
    if (!abierto) return;
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setAbierto(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setAbierto(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [abierto]);

  function disparar(id: string) {
    setAbierto(false);
    onPick(id);
  }

  const texto = busy ? 'Armando…' : label;

  if (unico) {
    return (
      <button
        type="button"
        className="btn excel sm"
        disabled={apagado}
        onClick={() => disparar(items[0].id)}
      >
        <IconoExcel />
        {texto}
      </button>
    );
  }

  return (
    <div ref={wrapRef} className={`excel-menu${abierto ? ' is-open' : ''}`}>
      <button
        type="button"
        className="btn excel sm"
        disabled={apagado}
        aria-expanded={abierto}
        aria-haspopup="menu"
        aria-controls={listId}
        onClick={() => setAbierto((v) => !v)}
      >
        <IconoExcel />
        {texto}
        <span className="excel-menu-caret" aria-hidden />
      </button>
      {abierto ? (
        <ul id={listId} className="excel-menu-list" role="menu">
          {items.map((it) => (
            <li key={it.id} role="none">
              <button type="button" role="menuitem" onClick={() => disparar(it.id)}>
                <strong>{it.label}</strong>
                {it.hint ? <span>{it.hint}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
