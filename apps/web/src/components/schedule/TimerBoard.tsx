import { useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from '../../lib/api';
import {
  monthBounds,
  monthLabel,
  rowKey,
  shiftMonth,
  toDateOnly,
  weekdayAbbrev,
  weekdayLong,
  cellShortLabel,
  type BoardResponse,
  type DayRow,
} from '../../lib/scheduleUtils';
import { DateField, ExcelMenu, PeoplePicker, SearchSelect, useToast, type Person } from '../ui';
import { isoToDmy } from '../../lib/dateRange';
import { apellidoYNombre, legajoMostrar } from '../../lib/personLabel';

export type TimerFila = {
  id: string;
  origen: 'auto' | 'extra';
  fecha: string;
  inspector_id: string;
  legajo: string;
  persona: string;
  ideal: string;
  real: string;
  motivo: string;
  observacion: string;
};

type GuardadoResumen = {
  id: string;
  fecha_desde: string;
  fecha_hasta: string;
  nota: string;
  guardado_en: string;
  filas: number;
};

function etiquetaGuardado(g: GuardadoResumen): string {
  const cuando = new Date(g.guardado_en).toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${isoToDmy(g.fecha_desde)} → ${isoToDmy(g.fecha_hasta)} · ${cuando} · ${g.filas}`;
}

type Props = {
  from: string;
  to: string;
  plan: BoardResponse | null;
  real: BoardResponse | null;
  people: Person[];
};

type ExtraApi = {
  id: string;
  inspector_id: string;
  fecha: string;
  motivo: string;
  observacion: string;
  ideal: string;
  real: string;
  legajo: string | null;
  apellido: string | null;
  nombres: string | null;
  nombre_completo: string | null;
};

type CatalogoCodigo = {
  codigo: string;
  codigo_sap?: string | null;
  nombre: string;
  horario?: string | null;
};

type MotivoCat = {
  id: string;
  nombre: string;
};

function opcionesMotivo(catalogo: MotivoCat[], actual: string) {
  const opts = catalogo.map((m) => ({ id: m.nombre, label: m.nombre }));
  const t = actual.trim();
  if (t && !opts.some((o) => o.id === t)) {
    opts.unshift({ id: t, label: t });
  }
  return opts;
}

function etiquetaCodigo(codigo: string, catalogo: Map<string, CatalogoCodigo>): string {
  const c = codigo.trim().toUpperCase();
  if (!c) return '';
  const row = catalogo.get(c);
  if (!row) return '';
  const desc = (row.horario || row.nombre || '').trim();
  const sap = (row.codigo_sap || '').trim();
  if (desc && sap) return `${desc} / ${sap}`;
  return desc;
}

function extraAFila(row: ExtraApi, personas: Map<string, Person>): TimerFila {
  const p = personas.get(row.inspector_id);
  return {
    id: row.id,
    origen: 'extra',
    fecha: row.fecha.slice(0, 10),
    inspector_id: row.inspector_id,
    legajo: legajoMostrar(p?.legajo ?? row.legajo),
    persona: p ? apellidoYNombre(p) : apellidoYNombre(row),
    ideal: row.ideal || '',
    real: row.real || '',
    motivo: row.motivo,
    observacion: row.observacion || '',
  };
}

type Version = {
  id: string;
  periodo_desde?: string;
  periodo_hasta?: string;
};

function diasSolapa(v: Version, desde: string, hasta: string): number {
  const a = toDateOnly(v.periodo_desde);
  const b = toDateOnly(v.periodo_hasta);
  if (!a || !b || a > hasta || b < desde) return 0;
  const from = a > desde ? a : desde;
  const to = b < hasta ? b : hasta;
  const t0 = Date.parse(`${from}T12:00:00`);
  const t1 = Date.parse(`${to}T12:00:00`);
  if (!Number.isFinite(t0) || !Number.isFinite(t1) || t1 < t0) return 0;
  return Math.round((t1 - t0) / 86400000) + 1;
}

function elegirVersion(versiones: Version[], desde: string, hasta: string): Version | null {
  let best: Version | null = null;
  let bestScore = -1;
  for (const v of versiones) {
    const n = diasSolapa(v, desde, hasta);
    if (n <= 0) continue;
    const a = toDateOnly(v.periodo_desde);
    const b = toDateOnly(v.periodo_hasta);
    const cubreTodo = Boolean(a && b && a <= desde && b >= hasta);
    const span =
      a && b
        ? Math.round(
            (Date.parse(`${b}T12:00:00`) - Date.parse(`${a}T12:00:00`)) / 86400000,
          ) + 1
        : 0;
    const score = (cubreTodo ? 1_000_000 : 0) + n * 10 + span;
    if (score > bestScore) {
      best = v;
      bestScore = score;
    }
  }
  return best;
}

function listarTimerAuto(
  plan: BoardResponse | null,
  real: BoardResponse | null,
  personas: Map<string, Person>,
): TimerFila[] {
  if (!plan || !real) return [];
  const mapa = new Map<string, DayRow>();
  for (const d of plan.days) mapa.set(`${rowKey(d)}|${d.fecha_operativa}`, d);
  const filas: TimerFila[] = [];
  for (const d of real.days) {
    const otra = mapa.get(`${rowKey(d)}|${d.fecha_operativa}`);
    if (!otra || (otra.codigo === d.codigo && otra.tipo_dia === d.tipo_dia)) continue;
    const fuente = (d.inspector_id && personas.get(d.inspector_id)) || d;
    const ideal = cellShortLabel(otra);
    const real = cellShortLabel(d);
    filas.push({
      id: `auto-${rowKey(d)}|${d.fecha_operativa}`,
      origen: 'auto',
      fecha: d.fecha_operativa.slice(0, 10),
      inspector_id: d.inspector_id ?? '',
      legajo: legajoMostrar(d.legajo),
      persona: apellidoYNombre(fuente),
      ideal,
      real,
      motivo: '',
      observacion: '',
    });
  }
  return filas.sort(
    (a, b) => a.fecha.localeCompare(b.fecha) || a.persona.localeCompare(b.persona, 'es'),
  );
}

function motivoEsCambio(fila: TimerFila): boolean {
  const t = fila.motivo.trim();
  if (!t) return false;
  const flecha = `${fila.ideal.trim()} → ${fila.real.trim()}`;
  return t === flecha || /^[A-Z0-9]{1,5}\s*→\s*[A-Z0-9]{1,5}$/i.test(t);
}

export function TimerBoard({
  from: fromGrilla,
  to: toGrilla,
  plan: planGrilla,
  real: realGrilla,
  people,
}: Props) {
  const toast = useToast();
  const [abierto, setAbierto] = useState(true);
  const [propio, setPropio] = useState<{ from: string; to: string } | null>(null);
  const [extras, setExtras] = useState<TimerFila[]>([]);
  const [edits, setEdits] = useState<Record<string, TimerFila>>({});
  const [quitados, setQuitados] = useState<string[]>([]);
  const [dia, setDia] = useState('');
  const [busy, setBusy] = useState(false);
  const [fechaAlta, setFechaAlta] = useState(fromGrilla);
  const desde = propio?.from ?? fromGrilla;
  const hasta = propio?.to ?? toGrilla;
  const [inspector, setInspector] = useState('');
  const [motivo, setMotivo] = useState('');
  const [nota, setNota] = useState('');
  const [catalogo, setCatalogo] = useState<Map<string, CatalogoCodigo>>(new Map());
  const [motivosCat, setMotivosCat] = useState<MotivoCat[]>([]);
  const extraSave = useRef<Map<string, number>>(new Map());
  const [planLocal, setPlanLocal] = useState<BoardResponse | null>(null);
  const [realLocal, setRealLocal] = useState<BoardResponse | null>(null);
  const [versiones, setVersiones] = useState<{ plan: Version[]; real: Version[] }>({
    plan: [],
    real: [],
  });
  const [guardados, setGuardados] = useState<GuardadoResumen[]>([]);
  const [visto, setVisto] = useState('');
  const [filasCerradas, setFilasCerradas] = useState<TimerFila[] | null>(null);

  const mismoPeriodo = !propio || (desde === fromGrilla && hasta === toGrilla);
  const plan = mismoPeriodo ? planGrilla : planLocal;
  const real = mismoPeriodo ? realGrilla : realLocal;

  const personas = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const auto = useMemo(() => listarTimerAuto(plan, real, personas), [plan, real, personas]);
  const filasBorrador = useMemo(() => {
    const quit = new Set(quitados);
    const autos = auto.filter((a) => !quit.has(a.id)).map((a) => edits[a.id] ?? a);
    return [...autos, ...extras].map((f) => (motivoEsCambio(f) ? { ...f, motivo: '' } : f));
  }, [auto, edits, quitados, extras]);
  const cerrado = Boolean(visto);
  const filas = useMemo(() => {
    const base = filasCerradas && cerrado ? filasCerradas : filasBorrador;
    return base.map((f) => (motivoEsCambio(f) ? { ...f, motivo: '' } : f));
  }, [filasCerradas, cerrado, filasBorrador]);

  const esMes = useMemo(() => {
    const b = monthBounds(desde);
    return b.from === desde && b.to === hasta;
  }, [desde, hasta]);

  const diasLista = useMemo(() => {
    const map = new Map<string, number>();
    for (const f of filas) map.set(f.fecha, (map.get(f.fecha) ?? 0) + 1);
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filas]);

  const visibles = useMemo(
    () => (dia ? filas.filter((f) => f.fecha === dia) : filas),
    [filas, dia],
  );
  const grupos = useMemo(() => {
    const map = new Map<string, TimerFila[]>();
    for (const f of visibles) {
      const xs = map.get(f.fecha) ?? [];
      xs.push(f);
      map.set(f.fecha, xs);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [visibles]);

  useEffect(() => {
    setEdits({});
    setQuitados([]);
    setDia('');
    setFechaAlta(desde);
    let cancelado = false;
    void api<ExtraApi[]>(`/operations/timer-extras?from=${desde}&to=${hasta}`)
      .then((rows) => {
        if (!cancelado) setExtras(rows.map((r) => extraAFila(r, personas)));
      })
      .catch((err) => {
        if (cancelado) return;
        setExtras([]);
        toast.push({
          tone: 'error',
          message: err instanceof ApiError ? err.message : 'No se pudieron cargar las novedades extra.',
        });
      });
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desde, hasta]);

  useEffect(() => {
    let cancelado = false;
    void Promise.all([
      api<Version[]>('/planning/versions?capa=PLANIFICADA'),
      api<Version[]>('/planning/versions?capa=REAL'),
    ])
      .then(([plan, real]) => {
        if (!cancelado) setVersiones({ plan, real });
      })
      .catch(() => {
        /* la grilla ya avisó si falló el catálogo */
      });
    return () => {
      cancelado = true;
    };
  }, []);

  useEffect(() => {
    let cancelado = false;
    void Promise.all([
      api<CatalogoCodigo[]>('/operations/licencias?activas=1&turnos=1'),
      api<MotivoCat[]>('/operations/timer-motivos'),
    ])
      .then(([rows, motivos]) => {
        if (cancelado) return;
        const mapa = new Map<string, CatalogoCodigo>();
        for (const r of rows) {
          const key = (r.codigo || '').trim().toUpperCase();
          if (key && !mapa.has(key)) mapa.set(key, r);
        }
        setCatalogo(mapa);
        setMotivosCat(motivos);
      })
      .catch(() => {
        if (cancelado) return;
        setCatalogo(new Map());
        setMotivosCat([]);
      });
    return () => {
      cancelado = true;
    };
  }, []);

  useEffect(() => {
    let cancelado = false;
    void api<GuardadoResumen[]>('/operations/timer-guardados')
      .then((rows) => {
        if (!cancelado) setGuardados(rows);
      })
      .catch(() => {
        if (!cancelado) setGuardados([]);
      });
    return () => {
      cancelado = true;
    };
  }, []);

  useEffect(() => {
    if (mismoPeriodo) {
      setPlanLocal(null);
      setRealLocal(null);
      return;
    }
    let cancelado = false;
    const planId = elegirVersion(versiones.plan, desde, hasta)?.id;
    const realId = elegirVersion(versiones.real, desde, hasta)?.id;
    void (async () => {
      try {
        const q = new URLSearchParams({ date_from: desde, date_to: hasta });
        const [p, r] = await Promise.all([
          planId
            ? api<BoardResponse>(`/planning/${planId}/calendar?${q}`)
            : Promise.resolve(null),
          realId
            ? api<BoardResponse>(`/planning/${realId}/calendar?${q}`)
            : Promise.resolve(null),
        ]);
        if (cancelado) return;
        setPlanLocal(p);
        setRealLocal(r);
      } catch (err) {
        if (cancelado) return;
        setPlanLocal(null);
        setRealLocal(null);
        toast.push({
          tone: 'error',
          message: err instanceof ApiError ? err.message : 'No se pudo cargar ese período.',
        });
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [mismoPeriodo, desde, hasta, versiones]);

  function aplicarRango(a: string, b: string) {
    const from = a <= b ? a : b;
    const to = a <= b ? b : a;
    if (from === fromGrilla && to === toGrilla) setPropio(null);
    else setPropio({ from, to });
  }

  function aplicarAutos(next: TimerFila[]) {
    const vivos = new Set(next.filter((f) => f.origen === 'auto').map((f) => f.id));
    setQuitados(auto.filter((a) => !vivos.has(a.id)).map((a) => a.id));
    const nextEdits: Record<string, TimerFila> = {};
    for (const f of next) {
      if (f.origen !== 'auto') continue;
      const orig = auto.find((a) => a.id === f.id);
      if (!orig) continue;
      if (
        f.ideal !== orig.ideal ||
        f.real !== orig.real ||
        f.motivo !== orig.motivo ||
        f.observacion !== orig.observacion
      ) {
        nextEdits[f.id] = f;
      }
    }
    setEdits(nextEdits);
  }

  function guardarExtra(fila: TimerFila) {
    const prev = extraSave.current.get(fila.id);
    if (prev) window.clearTimeout(prev);
    const handle = window.setTimeout(() => {
      extraSave.current.delete(fila.id);
      void api(`/operations/timer-extras/${fila.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          motivo: fila.motivo,
          observacion: fila.observacion,
          ideal: fila.ideal,
          real: fila.real,
        }),
      }).catch((err) => {
        toast.push({
          tone: 'error',
          message: err instanceof ApiError ? err.message : 'No se pudo guardar la novedad.',
        });
      });
    }, 450);
    extraSave.current.set(fila.id, handle);
  }

  function patch(id: string, campo: keyof TimerFila, valor: string) {
    if (cerrado) return;
    const actual = filas.find((f) => f.id === id);
    if (!actual) return;
    const next = { ...actual, [campo]: valor };
    if (actual.origen === 'extra') {
      setExtras((prev) => prev.map((f) => (f.id === id ? next : f)));
      guardarExtra(next);
      return;
    }
    aplicarAutos(filas.map((f) => (f.id === id ? next : f)));
  }

  async function agregar() {
    if (cerrado) return;
    const p = people.find((x) => x.id === inspector);
    if (!p || !fechaAlta) return;
    const texto = motivo.trim();
    if (texto.length < 3) return;
    try {
      const row = await api<ExtraApi>('/operations/timer-extras', {
        method: 'POST',
        body: JSON.stringify({
          inspector_id: p.id,
          fecha: fechaAlta,
          motivo: texto,
          observacion: nota.trim(),
        }),
      });
      setExtras((prev) => [...prev, extraAFila(row, personas)]);
      setMotivo('');
      setNota('');
    } catch (err) {
      toast.push({
        tone: 'error',
        message: err instanceof ApiError ? err.message : 'No se pudo agregar la novedad.',
      });
    }
  }

  async function quitar(id: string) {
    if (cerrado) return;
    const actual = filas.find((f) => f.id === id);
    if (!actual) return;
    if (actual.origen === 'extra') {
      try {
        await api(`/operations/timer-extras/${id}`, { method: 'DELETE' });
        setExtras((prev) => prev.filter((f) => f.id !== id));
        toast.push({ tone: 'success', message: 'Novedad sacada del Timer. La cuadratura no se tocó.' });
      } catch (err) {
        toast.push({
          tone: 'error',
          message: err instanceof ApiError ? err.message : 'No se pudo quitar la novedad.',
        });
      }
      return;
    }
    aplicarAutos(filas.filter((f) => f.id !== id));
    toast.push({ tone: 'success', message: 'Línea sacada del Timer. La cuadratura no se tocó.' });
  }

  async function abrirGuardado(id: string) {
    if (!id) {
      setVisto('');
      setFilasCerradas(null);
      return;
    }
    setBusy(true);
    try {
      const doc = await api<{
        id: string;
        fecha_desde: string;
        fecha_hasta: string;
        filas: Array<{
          id: string;
          fecha: string;
          inspector_id: string | null;
          origen: 'auto' | 'extra';
          legajo: string;
          persona: string;
          ideal: string;
          real: string;
          motivo: string;
          observacion: string;
        }>;
      }>(`/operations/timer-guardados/${id}`);
      setVisto(id);
      setFilasCerradas(
        doc.filas.map((f) => ({
          id: f.id,
          origen: f.origen,
          fecha: f.fecha.slice(0, 10),
          inspector_id: f.inspector_id ?? '',
          legajo: f.legajo || '—',
          persona: f.persona,
          ideal: f.ideal || '',
          real: f.real || '',
          motivo: f.motivo || '',
          observacion: f.observacion || '',
        })),
      );
    } catch (err) {
      toast.push({
        tone: 'error',
        message: err instanceof ApiError ? err.message : 'No se pudo abrir ese Timer.',
      });
    } finally {
      setBusy(false);
    }
  }

  async function guardar() {
    if (!filasBorrador.length) {
      toast.push({ tone: 'error', message: 'No hay renglones para guardar.' });
      return;
    }
    setBusy(true);
    try {
      const creado = await api<GuardadoResumen>('/operations/timer-guardados', {
        method: 'POST',
        body: JSON.stringify({
          from: desde,
          to: hasta,
          filas: filasBorrador.map((f) => ({
            fecha: f.fecha,
            inspector_id: f.inspector_id || undefined,
            origen: f.origen,
            legajo: f.legajo === '—' ? '' : f.legajo,
            persona: f.persona,
            ideal: f.ideal,
            real: f.real,
            motivo: f.motivo,
            observacion: f.observacion,
          })),
        }),
      });
      setGuardados((prev) => [
        {
          id: creado.id,
          fecha_desde: creado.fecha_desde,
          fecha_hasta: creado.fecha_hasta,
          nota: creado.nota ?? '',
          guardado_en: creado.guardado_en,
          filas: typeof creado.filas === 'number' ? creado.filas : filasBorrador.length,
        },
        ...prev,
      ]);
      toast.push({
        tone: 'success',
        message: 'Timer guardado. Ya no se puede modificar; queda en la lista de períodos.',
      });
    } catch (err) {
      toast.push({
        tone: 'error',
        message: err instanceof ApiError ? err.message : 'No se pudo guardar el Timer.',
      });
    } finally {
      setBusy(false);
    }
  }

  async function descargar() {
    if (!filas.length) {
      toast.push({ tone: 'error', message: 'No hay novedades para este período.' });
      return;
    }
    setBusy(true);
    try {
      const base = import.meta.env.VITE_API_URL || '/api';
      const res = await fetch(`${base}/exports/timer.xlsx`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('sv_token') ?? ''}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: guardados.find((g) => g.id === visto)?.fecha_desde ?? desde,
          to: guardados.find((g) => g.id === visto)?.fecha_hasta ?? hasta,
          filas: filas.map((f) => ({
            fecha: f.fecha,
            legajo: f.legajo === '—' ? '' : f.legajo,
            persona: f.persona,
            origen: f.origen,
            ideal: f.ideal,
            real: f.real,
            motivo: f.motivo,
            observacion: f.observacion,
          })),
        }),
      });
      if (!res.ok) throw new Error('No se pudo generar el timer');
      const blob = await res.blob();
      const nombre =
        res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] ?? 'Timer.xlsx';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = nombre;
      a.click();
      URL.revokeObjectURL(url);
      toast.push({ tone: 'success', message: `Descargado: ${nombre}` });
    } catch {
      toast.push({ tone: 'error', message: 'No se pudo generar el timer.' });
    } finally {
      setBusy(false);
    }
  }

  const n = auto.length + extras.length;

  const periodo = (
    <div className="timer-board-period">
      <div className="cuad-month" role="group" aria-label="Mes del timer">
        <button
          type="button"
          className="btn secondary sm"
          onClick={() => {
            const b = shiftMonth(desde, -1);
            aplicarRango(b.from, b.to);
          }}
        >
          ‹
        </button>
        <strong>
          {esMes ? monthLabel(desde) : `${isoToDmy(desde)} → ${isoToDmy(hasta)}`}
        </strong>
        <button
          type="button"
          className="btn secondary sm"
          onClick={() => {
            const b = shiftMonth(desde, 1);
            aplicarRango(b.from, b.to);
          }}
        >
          ›
        </button>
      </div>
      {abierto && !esMes ? (
        <div className="cuad-range" role="group" aria-label="Período del timer">
          <DateField
            id="timer-desde"
            aria-label="Desde"
            value={desde}
            onChange={(v) => aplicarRango(v, hasta)}
          />
          <span className="cuad-range-sep" aria-hidden>
            –
          </span>
          <DateField
            id="timer-hasta"
            aria-label="Hasta"
            value={hasta}
            onChange={(v) => aplicarRango(desde, v)}
          />
        </div>
      ) : null}
      {abierto && !mismoPeriodo ? (
        <button
          type="button"
          className="btn ghost sm"
          onClick={() => aplicarRango(fromGrilla, toGrilla)}
        >
          Período de la grilla
        </button>
      ) : null}
    </div>
  );

  if (!abierto) {
    return (
      <div className="panel timer-board-bar">
        <div className="timer-board-copy">
          <h2>
            Timer
            {n ? (
              <span className="badge pending">{n} cambio{n === 1 ? '' : 's'}</span>
            ) : (
              <span className="badge neutral">Sin cambios</span>
            )}
          </h2>
        </div>
        <button type="button" className="btn secondary sm" onClick={() => setAbierto(true)}>
          Mostrar detalle
        </button>
      </div>
    );
  }

  return (
    <section className="panel timer-board" aria-label="Timer">
      <header className="timer-board-head">
        <div className="timer-board-copy">
          <h2>
            Timer
            {n ? (
              <span className="badge pending">{n} cambio{n === 1 ? '' : 's'}</span>
            ) : null}
          </h2>
          {periodo}
        </div>
        <div className="timer-board-actions">
          {cerrado ? <span className="muted">Cerrado</span> : null}
          {guardados.length ? (
            <label className="timer-board-pick">
              <span>Guardados</span>
              <select
                value={visto}
                disabled={busy}
                aria-label="Timer guardado"
                onChange={(e) => void abrirGuardado(e.target.value)}
              >
                <option value="">Borrador</option>
                {guardados.map((g) => (
                  <option key={g.id} value={g.id}>
                    {etiquetaGuardado(g)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {!cerrado ? (
            <button
              type="button"
              className="btn secondary sm"
              onClick={() => void guardar()}
              disabled={busy || filasBorrador.length === 0}
            >
              Guardar
            </button>
          ) : null}
          <ExcelMenu
            busy={busy}
            disabled={busy || filas.length === 0}
            items={[{ id: 'timer', label: 'Timer' }]}
            onPick={() => void descargar()}
          />
          <button type="button" className="btn secondary sm" onClick={() => setAbierto(false)}>
            Ocultar
          </button>
        </div>
      </header>

          {diasLista.length > 0 ? (
            <div className="timer-dias" role="tablist" aria-label="Día">
              <button
                type="button"
                role="tab"
                className={dia ? undefined : 'active'}
                onClick={() => setDia('')}
              >
                Todos ({filas.length})
              </button>
              {diasLista.map(([f, c]) => (
                <button
                  key={f}
                  type="button"
                  role="tab"
                  className={dia === f ? 'active' : undefined}
                  onClick={() => setDia(f)}
                >
                  {weekdayAbbrev(f)} {f.slice(8, 10)}/{f.slice(5, 7)}
                  <span className="timer-dias-n">{c}</span>
                </button>
              ))}
            </div>
          ) : null}

          {visibles.length === 0 ? (
            <p className="muted timer-empty">
              {filas.length === 0
                ? 'No hay renglones. Agregá una novedad si hace falta dejarla en el Excel.'
                : 'Este día no tiene renglones.'}
            </p>
          ) : (
            <div className="timer-scroll">
              <div className="timer-list-head">
                <span>Persona</span>
                <span>Ideal</span>
                <span>Real</span>
                <span>Motivo</span>
                <span>Observación</span>
                <span />
              </div>
              {grupos.map(([fecha, rows]) => (
                <section key={fecha} className="timer-grupo">
                  {dia ? null : (
                    <h3 className="timer-grupo-titulo">
                      {weekdayLong(fecha)} {isoToDmy(fecha)}
                      <span>{rows.length}</span>
                    </h3>
                  )}
                  <ul className="timer-grupo-filas">
                    {rows.map((f) => (
                      <li key={f.id} className="timer-fila">
                        <div className="timer-persona">
                          <span className="timer-persona-nom">{f.persona}</span>
                          {f.legajo && f.legajo !== '—' ? (
                            <span className="timer-persona-leg">{f.legajo}</span>
                          ) : null}
                          {f.origen === 'extra' ? (
                            <span className="timer-origen">Agregada</span>
                          ) : (
                            <span className="timer-origen">Cambio</span>
                          )}
                        </div>
                        <div className="timer-code-cell">
                          <input
                            className="timer-code"
                            type="text"
                            value={f.ideal}
                            readOnly={cerrado}
                            onChange={(e) => patch(f.id, 'ideal', e.target.value)}
                            aria-label={`Ideal ${f.persona}`}
                          />
                          {etiquetaCodigo(f.ideal, catalogo) ? (
                            <span className="timer-code-desc">
                              {etiquetaCodigo(f.ideal, catalogo)}
                            </span>
                          ) : null}
                        </div>
                        <div className="timer-code-cell">
                          <input
                            className="timer-code"
                            type="text"
                            value={f.real}
                            readOnly={cerrado}
                            onChange={(e) => patch(f.id, 'real', e.target.value)}
                            aria-label={`Real ${f.persona}`}
                          />
                          {etiquetaCodigo(f.real, catalogo) ? (
                            <span className="timer-code-desc">
                              {etiquetaCodigo(f.real, catalogo)}
                            </span>
                          ) : null}
                        </div>
                        <div className="timer-motivo">
                          <SearchSelect
                            id={`timer-motivo-${f.id}`}
                            options={opcionesMotivo(motivosCat, f.motivo)}
                            value={f.motivo}
                            onChange={(id) => patch(f.id, 'motivo', id)}
                            placeholder="Motivo"
                            emptyLabel="Ningún motivo coincide"
                            disabled={cerrado}
                          />
                        </div>
                        <input
                          className="timer-obs"
                          type="text"
                          value={f.observacion}
                          readOnly={cerrado}
                          onChange={(e) => patch(f.id, 'observacion', e.target.value)}
                          placeholder="Opcional"
                          aria-label={`Observación ${f.persona}`}
                        />
                        <div className="timer-accion">
                          {cerrado ? null : (
                            <button
                              type="button"
                              className="btn ghost sm"
                              onClick={() => void quitar(f.id)}
                            >
                              Quitar
                            </button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}

          {!cerrado ? (
          <details className="timer-add">
            <summary>Agregar novedad</summary>
            <form
              className="timer-add-form"
              onSubmit={(e) => {
                e.preventDefault();
                void agregar();
              }}
            >
            <div className="timer-add-row">
              <div className="field">
                <label htmlFor="timer-fecha">Fecha</label>
                <DateField
                  id="timer-fecha"
                  aria-label="Fecha"
                  value={fechaAlta}
                  onChange={setFechaAlta}
                />
              </div>
              <div className="field timer-add-person">
                <label htmlFor="timer-insp">Persona</label>
                <PeoplePicker
                  id="timer-insp"
                  people={people}
                  value={inspector}
                  onChange={setInspector}
                  placeholder="Buscar legajo, apellido o nombre…"
                />
              </div>
              <div className="field timer-add-grow">
                <label htmlFor="timer-motivo">Motivo</label>
                <SearchSelect
                  id="timer-motivo"
                  options={opcionesMotivo(motivosCat, motivo)}
                  value={motivo}
                  onChange={setMotivo}
                  placeholder="Motivo de la novedad"
                  emptyLabel="Ningún motivo coincide"
                />
              </div>
              <div className="field timer-add-grow">
                <label htmlFor="timer-nota">Observación</label>
                <input
                  id="timer-nota"
                  type="text"
                  value={nota}
                  onChange={(e) => setNota(e.target.value)}
                  placeholder="Opcional"
                />
              </div>
              <button
                type="submit"
                className="btn secondary sm"
                disabled={!inspector || motivo.trim().length < 3}
              >
                Agregar
              </button>
            </div>
            </form>
          </details>
          ) : null}
    </section>
  );
}
