import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { ROLE_CODES } from '@plataforma/shared';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { buildPresets } from '../lib/datePresets';

type Inspector = { id: string; nombre_completo: string };

type CommandItem = {
  id: string;
  section: string;
  title: string;
  hint?: string;
  keywords?: string;
  action: () => void;
};

type Props = {
  open: boolean;
  onClose: () => void;
};

export function CommandPalette({ open, onClose }: Props) {
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const [query, setQuery] = useState('');
  const [inspectors, setInspectors] = useState<Inspector[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const isPrivileged = hasRole(
    ROLE_CODES.ADMIN_SV,
    ROLE_CODES.ADMIN_SYS,
    ROLE_CODES.JEFE,
  );

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setSelectedIdx(0);
    const t = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open || inspectors.length) return;
    api<Inspector[]>('/operations/inspectors')
      .then((data) => setInspectors(data))
      .catch(() => {
        /* si falla, el palette sigue funcionando sin inspectores */
      });
  }, [open, inspectors.length]);

  const items = useMemo<CommandItem[]>(() => {
    const list: CommandItem[] = [];
    const presets = buildPresets();
    const thisMonth = presets.find((p) => p.id === 'this-month')!.range();
    const nextMonth = presets.find((p) => p.id === 'next-month')!.range();
    const nextThirty = presets.find((p) => p.id === 'next-30')!.range();

    list.push(
      {
        id: 'nav-home',
        section: 'Ir a',
        title: 'Inicio',
        hint: '/',
        keywords: 'dashboard resumen',
        action: () => navigate('/'),
      },
      {
        id: 'nav-cal-this',
        section: 'Ir a',
        title: 'Cronograma planificado · este mes',
        hint: `${thisMonth.from} → ${thisMonth.to}`,
        keywords: 'calendario cronograma mes actual',
        action: () =>
          navigate(`/cronograma-planificado?from=${thisMonth.from}&to=${thisMonth.to}`),
      },
      {
        id: 'nav-cal-next',
        section: 'Ir a',
        title: 'Cronograma planificado · próximo mes',
        hint: `${nextMonth.from} → ${nextMonth.to}`,
        keywords: 'calendario cronograma proximo mes',
        action: () =>
          navigate(`/cronograma-planificado?from=${nextMonth.from}&to=${nextMonth.to}`),
      },
      {
        id: 'nav-cal-30',
        section: 'Ir a',
        title: 'Cronograma real · próximos 30 días',
        hint: `${nextThirty.from} → ${nextThirty.to}`,
        keywords: 'calendario cronograma treinta dias',
        action: () =>
          navigate(`/cronograma-real?from=${nextThirty.from}&to=${nextThirty.to}`),
      },
      {
        id: 'nav-huecos',
        section: 'Ir a',
        title: 'Huecos',
        hint: '/huecos',
        keywords: 'gaps pendientes cobertura',
        action: () => navigate('/huecos'),
      },
      {
        id: 'nav-aprobacion',
        section: 'Ir a',
        title: 'Aprobación',
        hint: '/aprobacion',
        keywords: 'revision publicar jefe',
        action: () => navigate('/aprobacion'),
      },
      {
        id: 'nav-vacaciones',
        section: 'Ir a',
        title: 'Vacaciones',
        hint: '/vacaciones',
        keywords: 'licencia demanda trabajo',
        action: () => navigate('/vacaciones'),
      },
      {
        id: 'nav-movil4',
        section: 'Ir a',
        title: 'Móvil 4',
        hint: '/movil4',
        keywords: 'obrador continuo duplas haro ramos',
        action: () => navigate('/movil4'),
      },
      {
        id: 'nav-ruta36',
        section: 'Ir a',
        title: 'Ruta 36',
        hint: '/ruta36',
        keywords: 'piedras moras arroyo tegua movil 6 7',
        action: () => navigate('/ruta36'),
      },
    );
    if (isPrivileged) {
      list.push(
        {
          id: 'nav-proy',
          section: 'Ir a',
          title: 'Motor de proyección',
          hint: '/proyeccion',
          keywords: 'planificada real swap tabula',
          action: () => navigate('/proyeccion'),
        },
        {
          id: 'nav-admin',
          section: 'Ir a',
          title: 'Administración',
          hint: '/administracion',
          keywords: 'inspectores moviles posiciones perfiles duplas usuarios',
          action: () => navigate('/administracion'),
        },
      );
    }

    for (const insp of inspectors) {
      list.push({
        id: `insp-${insp.id}`,
        section: 'Inspectores',
        title: insp.nombre_completo,
        hint: 'Ver en cronograma',
        keywords: insp.nombre_completo,
        action: () => {
          // Cronograma con inspector persistido: guardamos el filtro y navegamos.
          try {
            window.localStorage.setItem(
              'sv_calendar_filters_v1',
              JSON.stringify({
                versionId: '__ALL__',
                inspector: insp.id,
                mobile: '',
              }),
            );
          } catch {
            /* no crítico */
          }
          navigate('/cronograma-planificado');
        },
      });
    }

    for (const m of [1, 2, 3, 4, 5, 6, 7]) {
      list.push({
        id: `mob-${m}`,
        section: 'Filtrar por móvil',
        title: `Cronograma · Móvil ${m}`,
        hint: 'Aplicar filtro',
        keywords: `movil ${m}`,
        action: () => {
          try {
            const cur = JSON.parse(
              window.localStorage.getItem('sv_calendar_filters_v1') ?? '{}',
            );
            window.localStorage.setItem(
              'sv_calendar_filters_v1',
              JSON.stringify({
                versionId: cur.versionId ?? '__ALL__',
                inspector: cur.inspector ?? '',
                mobile: String(m),
              }),
            );
          } catch {
            /* no crítico */
          }
          navigate('/cronograma-planificado');
        },
      });
    }

    return list;
  }, [inspectors, isPrivileged, navigate]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items.slice(0, 50);
    const tokens = q.split(/\s+/).filter(Boolean);
    return items
      .filter((it) => {
        const hay =
          `${it.title} ${it.hint ?? ''} ${it.keywords ?? ''} ${it.section}`.toLowerCase();
        return tokens.every((t) => hay.includes(t));
      })
      .slice(0, 40);
  }, [items, query]);

  useEffect(() => {
    if (selectedIdx >= filtered.length) setSelectedIdx(0);
  }, [filtered, selectedIdx]);

  function run(item: CommandItem) {
    item.action();
    onClose();
  }

  function handleKey(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      const item = filtered[selectedIdx];
      if (item) {
        e.preventDefault();
        run(item);
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  }

  if (!open) return null;

  // Agrupar por sección preservando orden
  const groups: Array<{ section: string; items: CommandItem[] }> = [];
  for (const it of filtered) {
    const last = groups[groups.length - 1];
    if (last && last.section === it.section) last.items.push(it);
    else groups.push({ section: it.section, items: [it] });
  }

  let running = 0;

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{ alignItems: 'flex-start', paddingTop: '10vh' }}
    >
      <div
        className="modal modal-lg command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Búsqueda global"
      >
        <div className="command-input">
          <span aria-hidden>🔎</span>
          <input
            ref={inputRef}
            placeholder="Buscar inspector, página, filtro… (Esc para cerrar)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKey}
          />
          <kbd className="kbd">Esc</kbd>
        </div>
        <div className="command-list" role="listbox">
          {groups.length === 0 ? (
            <p className="muted" style={{ padding: '0.9rem 1rem' }}>
              Sin coincidencias.
            </p>
          ) : (
            groups.map((g) => (
              <div key={g.section}>
                <div className="command-section">{g.section}</div>
                {g.items.map((it) => {
                  const idx = running++;
                  const active = idx === selectedIdx;
                  return (
                    <button
                      key={it.id}
                      type="button"
                      className={`command-item${active ? ' active' : ''}`}
                      onMouseEnter={() => setSelectedIdx(idx)}
                      onClick={() => run(it)}
                    >
                      <span className="command-title">{it.title}</span>
                      {it.hint ? (
                        <span className="command-hint muted">{it.hint}</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
        <div className="command-footer muted">
          <span>
            <kbd className="kbd">↑</kbd> <kbd className="kbd">↓</kbd> navegar
          </span>
          <span>
            <kbd className="kbd">↵</kbd> ejecutar
          </span>
          <span>
            <kbd className="kbd">Ctrl</kbd> + <kbd className="kbd">K</kbd> abrir/cerrar
          </span>
        </div>
      </div>
    </div>
  );
}
