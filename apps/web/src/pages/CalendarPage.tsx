import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import {
  firstIssueFor,
  validateDateRange,
} from '../lib/dateRange';

type Version = {
  id: string;
  codigo: string;
  nombre: string;
  capa: string;
  numero_version: number;
  estado: string;
  periodo_desde?: string;
  periodo_hasta?: string;
};

type DayRow = {
  fecha_operativa: string;
  tipo_dia: string;
  codigo: string;
  movil: number | null;
  inspector: string | null;
  legajo: string | null;
  posicion_codigo: string;
};

type CoverageRow = {
  fecha_operativa: string;
  movil: number;
  turno: string;
  cantidad_asignada: number;
  estado: string;
};

type DailyTotal = {
  fecha_operativa: string;
  francos: number;
  vacaciones: number;
  enfermedades: number;
  trabajos: number;
};

type BoardResponse = {
  days: DayRow[];
  coverage: CoverageRow[];
  daily_totals: DailyTotal[];
  summary: {
    huecos: number;
    solapamientos: number;
    dias_con_vacaciones: number;
    asignaciones_vacacion: number;
  };
};

const WEEKDAYS = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
const MONTHS = [
  'ENERO',
  'FEBRERO',
  'MARZO',
  'ABRIL',
  'MAYO',
  'JUNIO',
  'JULIO',
  'AGOSTO',
  'SEPTIEMBRE',
  'OCTUBRE',
  'NOVIEMBRE',
  'DICIEMBRE',
];
const SHIFTS = ['M', 'T', 'N'] as const;
const SHIFT_LABEL: Record<string, string> = {
  M: 'Mañana',
  T: 'Tarde',
  N: 'Noche',
};

function weekdayLetter(iso: string) {
  const d = new Date(iso + 'T12:00:00');
  return WEEKDAYS[d.getDay()];
}

function eachDate(from: string, to: string): string[] {
  if (!from || !to || from > to) return [];
  const out: string[] = [];
  const cur = new Date(from + 'T12:00:00');
  const end = new Date(to + 'T12:00:00');
  while (cur <= end) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, '0');
    const d = String(cur.getDate()).padStart(2, '0');
    out.push(`${y}-${m}-${d}`);
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

/** Agrupa fechas contiguas del mismo mes para el encabezado tipo Excel. */
function monthSpans(dates: string[]): Array<{ label: string; span: number; key: string }> {
  const spans: Array<{ label: string; span: number; key: string }> = [];
  for (const d of dates) {
    const month = Number(d.slice(5, 7));
    const year = d.slice(0, 4);
    const label = `${MONTHS[month - 1]} ${year}`;
    const last = spans[spans.length - 1];
    if (last && last.label === label) last.span += 1;
    else spans.push({ label, span: 1, key: `${year}-${month}` });
  }
  return spans;
}

function cellClass(codigo: string, tipo: string) {
  if (tipo === 'VACACION' || codigo === 'V') return 'xlsx-v';
  if (tipo === 'ENFERMEDAD' || codigo === 'EF') return 'xlsx-ef';
  if (tipo === 'FRANCO' || codigo === 'F') return 'xlsx-f';
  if (codigo.startsWith('M')) return 'xlsx-m';
  if (codigo.startsWith('T')) return 'xlsx-t';
  if (codigo.startsWith('N')) return 'xlsx-n';
  return '';
}

function coverageClass(n: number) {
  if (n === 0) return 'cov-gap';
  if (n === 1) return 'cov-ok';
  return 'cov-overlap';
}

function rowKey(row: DayRow) {
  return row.legajo || row.inspector || row.posicion_codigo;
}

/** Fecha calendario YYYY-MM-DD sin corrimiento por zona horaria. */
function toDateOnly(value?: string | null) {
  if (!value) return '';
  const s = String(value);
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : s.slice(0, 10);
}

function pickDefaultVersion(data: Version[]) {
  return (
    data.find((v) => v.capa === 'BASE' && v.estado === 'APROBADA_PUBLICADA') ||
    data.find((v) => v.estado === 'APROBADA_PUBLICADA') ||
    data[0]
  );
}

function normalizeDay(row: DayRow): DayRow {
  return { ...row, fecha_operativa: toDateOnly(row.fecha_operativa) };
}

function versionPriority(v: Version, preferredId: string) {
  if (v.id === preferredId) return 0;
  if (v.capa === 'PLANIFICADA') return 1;
  if (v.capa === 'BASE' && v.estado === 'APROBADA_PUBLICADA') return 2;
  if (v.estado === 'APROBADA_PUBLICADA') return 3;
  return 4;
}

/** Une tableros de varias versiones; la preferida gana en solapes. */
function mergeBoards(
  entries: Array<{ version: Version; board: BoardResponse }>,
  preferredId: string,
): BoardResponse {
  const ordered = [...entries].sort(
    (a, b) =>
      versionPriority(a.version, preferredId) -
      versionPriority(b.version, preferredId),
  );

  const days = new Map<string, DayRow>();
  const coverage = new Map<string, CoverageRow>();
  const totals = new Map<string, DailyTotal>();

  for (const { board } of ordered) {
    for (const raw of board.days) {
      const row = normalizeDay(raw);
      const key = `${rowKey(row)}|${row.fecha_operativa}`;
      if (!days.has(key)) days.set(key, row);
    }
    for (const raw of board.coverage) {
      const fecha = toDateOnly(raw.fecha_operativa);
      const key = `${fecha}|${raw.movil}|${raw.turno}`;
      if (!coverage.has(key)) {
        coverage.set(key, { ...raw, fecha_operativa: fecha });
      }
    }
    for (const raw of board.daily_totals) {
      const fecha = toDateOnly(raw.fecha_operativa);
      if (!totals.has(fecha)) {
        totals.set(fecha, { ...raw, fecha_operativa: fecha });
      }
    }
  }

  const coverageRows = [...coverage.values()];
  const totalRows = [...totals.values()];
  return {
    days: [...days.values()],
    coverage: coverageRows,
    daily_totals: totalRows,
    summary: {
      huecos: coverageRows.filter((r) => Number(r.cantidad_asignada) === 0).length,
      solapamientos: coverageRows.filter((r) => Number(r.cantidad_asignada) >= 2)
        .length,
      asignaciones_vacacion: totalRows.reduce(
        (acc, r) => acc + Number(r.vacaciones || 0),
        0,
      ),
      dias_con_vacaciones: totalRows.filter((r) => Number(r.vacaciones) > 0).length,
    },
  };
}

const ALL_VERSIONS = '__ALL__';
/** Tope de grilla para no congelar el navegador. */
const CALENDAR_MAX_DAYS = 186;

export function CalendarPage() {
  const [versions, setVersions] = useState<Version[]>([]);
  const [versionId, setVersionId] = useState(ALL_VERSIONS);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [board, setBoard] = useState<BoardResponse | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadedLabel, setLoadedLabel] = useState('');
  const [touched, setTouched] = useState({ from: false, to: false });
  const [filterInspector, setFilterInspector] = useState('');
  const [filterMobile, setFilterMobile] = useState('');

  const dataBounds = useMemo(() => {
    const froms = versions
      .map((v) => toDateOnly(v.periodo_desde))
      .filter(Boolean)
      .sort();
    const tos = versions
      .map((v) => toDateOnly(v.periodo_hasta))
      .filter(Boolean)
      .sort();
    if (versionId !== ALL_VERSIONS) {
      const v = versions.find((x) => x.id === versionId);
      return {
        min: toDateOnly(v?.periodo_desde) || froms[0] || '',
        max: toDateOnly(v?.periodo_hasta) || tos[tos.length - 1] || '',
      };
    }
    return {
      min: froms[0] || '',
      max: tos[tos.length - 1] || '',
    };
  }, [versions, versionId]);

  const dateIssues = useMemo(
    () =>
      validateDateRange(dateFrom, dateTo, {
        required: true,
        maxDays: CALENDAR_MAX_DAYS,
      }),
    [dateFrom, dateTo],
  );

  const fromError =
    touched.from || touched.to ? firstIssueFor(dateIssues, 'from') : '';
  const toError =
    touched.from || touched.to ? firstIssueFor(dateIssues, 'to') : '';
  const rangeError = firstIssueFor(dateIssues, 'range');
  const datesValid = dateIssues.length === 0;

  useEffect(() => {
    api<Version[]>('/planning/versions')
      .then((data) => {
        setVersions(data);
        const preferred = pickDefaultVersion(data);
        const froms = data
          .map((v) => toDateOnly(v.periodo_desde))
          .filter(Boolean)
          .sort();
        const tos = data
          .map((v) => toDateOnly(v.periodo_hasta))
          .filter(Boolean)
          .sort();
        const from = froms[0] || toDateOnly(preferred?.periodo_desde);
        let to = tos[tos.length - 1] || toDateOnly(preferred?.periodo_hasta);
        if (from && to) {
          const span = validateDateRange(from, to, {
            required: true,
            maxDays: CALENDAR_MAX_DAYS,
          });
          if (span.length) {
            // Acota al máximo permitido desde el inicio del período.
            const cur = new Date(from + 'T12:00:00');
            cur.setDate(cur.getDate() + CALENDAR_MAX_DAYS - 1);
            const y = cur.getFullYear();
            const m = String(cur.getMonth() + 1).padStart(2, '0');
            const d = String(cur.getDate()).padStart(2, '0');
            to = `${y}-${m}-${d}`;
          }
        }
        setVersionId(ALL_VERSIONS);
        if (from) setDateFrom(from);
        if (to) setDateTo(to);
      })
      .catch((e) => setError(e.message));
  }, []);

  async function loadBoard(
    selectedVersionId: string,
    from: string,
    to: string,
  ) {
    const issues = validateDateRange(from, to, {
      required: true,
      maxDays: CALENDAR_MAX_DAYS,
    });
    if (issues.length) {
      setTouched({ from: true, to: true });
      setError(issues[0].message);
      setBoard(null);
      setLoadedLabel('');
      return;
    }
    if (!versions.length) return;

    setBusy(true);
    setError('');
    const q = new URLSearchParams({ date_from: from, date_to: to });

    try {
      const targets =
        selectedVersionId === ALL_VERSIONS
          ? versions
          : versions.filter((v) => v.id === selectedVersionId);

      if (!targets.length) {
        setError('No hay versión seleccionada');
        setBoard(null);
        return;
      }

      const results = await Promise.all(
        targets.map(async (version) => ({
          version,
          board: await api<BoardResponse>(
            `/planning/${version.id}/calendar?${q.toString()}`,
          ),
        })),
      );

      const preferred =
        selectedVersionId === ALL_VERSIONS
          ? pickDefaultVersion(versions)?.id || versions[0].id
          : selectedVersionId;

      const merged =
        results.length === 1
          ? {
              ...results[0].board,
              days: results[0].board.days.map(normalizeDay),
              coverage: results[0].board.coverage.map((r) => ({
                ...r,
                fecha_operativa: toDateOnly(r.fecha_operativa),
              })),
              daily_totals: results[0].board.daily_totals.map((r) => ({
                ...r,
                fecha_operativa: toDateOnly(r.fecha_operativa),
              })),
            }
          : mergeBoards(results, preferred);

      setBoard(merged);
      const used = results
        .filter((r) => r.board.days.length > 0)
        .map((r) => `${r.version.capa} ${r.version.codigo}`);
      setLoadedLabel(
        used.length
          ? `Datos de: ${used.join(' + ')}`
          : 'Sin días en el rango para las versiones consultadas',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
      setBoard(null);
      setLoadedLabel('');
    } finally {
      setBusy(false);
    }
  }

  async function load(e?: FormEvent) {
    e?.preventDefault();
    setTouched({ from: true, to: true });
    await loadBoard(versionId, dateFrom, dateTo);
  }

  useEffect(() => {
    if (versions.length && dateFrom && dateTo) {
      const issues = validateDateRange(dateFrom, dateTo, {
        required: true,
        maxDays: CALENDAR_MAX_DAYS,
      });
      if (!issues.length) void loadBoard(versionId, dateFrom, dateTo);
    }
    // Carga inicial al tener versiones + rango; Consultar dispara load() después.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versions]);

  const dates = useMemo(() => {
    if (datesValid) return eachDate(dateFrom, dateTo);
    if (!board) return [] as string[];
    return [...new Set(board.days.map((d) => toDateOnly(d.fecha_operativa)))].sort();
  }, [board, dateFrom, dateTo, datesValid]);

  const months = useMemo(() => monthSpans(dates), [dates]);

  const allInspectors = useMemo(() => {
    if (!board) return [] as Array<{ key: string; name: string; legajo: string }>;
    const map = new Map<string, { key: string; name: string; legajo: string }>();
    for (const row of board.days) {
      const key = rowKey(row);
      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          key,
          name: row.inspector || row.posicion_codigo,
          legajo: row.legajo || '',
        });
      } else if (row.inspector && existing.name === row.posicion_codigo) {
        map.set(key, {
          key,
          name: row.inspector,
          legajo: row.legajo || existing.legajo,
        });
      }
    }
    return [...map.values()].sort((a, b) =>
      a.legajo.localeCompare(b.legajo) || a.name.localeCompare(b.name),
    );
  }, [board]);

  const mobileNumber = filterMobile ? Number(filterMobile) : null;

  const inspectors = useMemo(() => {
    let list = allInspectors;
    if (filterInspector) {
      list = list.filter((i) => i.key === filterInspector);
    }
    if (mobileNumber != null && board) {
      const withMobile = new Set<string>();
      for (const row of board.days) {
        if (Number(row.movil) === mobileNumber) withMobile.add(rowKey(row));
      }
      list = list.filter((i) => withMobile.has(i.key));
    }
    return list;
  }, [allInspectors, filterInspector, mobileNumber, board]);

  const coverageMobiles = useMemo(
    () => (mobileNumber != null ? [mobileNumber] : [1, 2, 3, 4, 5]),
    [mobileNumber],
  );

  const cellMap = useMemo(() => {
    const map = new Map<string, DayRow>();
    if (!board) return map;
    for (const row of board.days) {
      map.set(`${rowKey(row)}|${toDateOnly(row.fecha_operativa)}`, {
        ...row,
        fecha_operativa: toDateOnly(row.fecha_operativa),
      });
    }
    return map;
  }, [board]);

  function visibleCell(cell: DayRow | undefined): DayRow | undefined {
    if (!cell) return undefined;
    if (mobileNumber == null) return cell;
    // Con filtro de móvil: mostrar trabajo de ese móvil; francos/V/EF del inspector filtrado.
    if (cell.tipo_dia === 'TRABAJO' || cell.codigo.match(/^[MTN]\d/)) {
      return Number(cell.movil) === mobileNumber ? cell : undefined;
    }
    return cell;
  }

  const coverageMap = useMemo(() => {
    const map = new Map<string, number>();
    if (!board) return map;
    for (const row of board.coverage) {
      map.set(
        `${toDateOnly(row.fecha_operativa)}|${row.movil}|${row.turno}`,
        Number(row.cantidad_asignada),
      );
    }
    return map;
  }, [board]);

  const totalsMap = useMemo(() => {
    const map = new Map<string, DailyTotal>();
    if (!board) return map;
    for (const row of board.daily_totals) {
      const fecha = toDateOnly(row.fecha_operativa);
      map.set(fecha, { ...row, fecha_operativa: fecha });
    }
    return map;
  }, [board]);

  useEffect(() => {
    if (
      filterInspector &&
      allInspectors.length &&
      !allInspectors.some((i) => i.key === filterInspector)
    ) {
      setFilterInspector('');
    }
  }, [allInspectors, filterInspector]);

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <h1>Cronograma de turnos</h1>
          <p>Vista operativa tipo planilla: inspectores × fechas, con cuadro de cobertura.</p>
        </div>
      </header>

      {error ? <div className="error-box">{error}</div> : null}

      <section className="panel">
        <form className="filters" onSubmit={load} noValidate>
          <div className="field" style={{ minWidth: 320 }}>
            <label htmlFor="version">Versión</label>
            <select
              id="version"
              value={versionId}
              onChange={(e) => setVersionId(e.target.value)}
            >
              <option value={ALL_VERSIONS}>Todas (unir capas del rango)</option>
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.capa} · {v.codigo} v{v.numero_version} · {v.estado}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="from">Desde</label>
            <input
              id="from"
              type="date"
              required
              max={dateTo || undefined}
              value={dateFrom}
              aria-invalid={Boolean(fromError)}
              aria-describedby={fromError ? 'from-error' : undefined}
              className={fromError ? 'input-invalid' : undefined}
              onBlur={() => setTouched((t) => ({ ...t, from: true }))}
              onChange={(e) => setDateFrom(e.target.value)}
            />
            {fromError ? (
              <p id="from-error" className="field-error" role="alert">
                {fromError}
              </p>
            ) : null}
          </div>
          <div className="field">
            <label htmlFor="to">Hasta</label>
            <input
              id="to"
              type="date"
              required
              min={dateFrom || undefined}
              value={dateTo}
              aria-invalid={Boolean(toError)}
              aria-describedby={toError ? 'to-error' : undefined}
              className={toError ? 'input-invalid' : undefined}
              onBlur={() => setTouched((t) => ({ ...t, to: true }))}
              onChange={(e) => setDateTo(e.target.value)}
            />
            {toError ? (
              <p id="to-error" className="field-error" role="alert">
                {toError}
              </p>
            ) : null}
          </div>
          <div className="field">
            <label htmlFor="inspector">Inspector</label>
            <select
              id="inspector"
              value={filterInspector}
              onChange={(e) => setFilterInspector(e.target.value)}
              disabled={!board}
            >
              <option value="">Todos</option>
              {allInspectors.map((i) => (
                <option key={i.key} value={i.key}>
                  {i.name}
                  {i.legajo ? ` (${i.legajo})` : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="mobile">Móvil</label>
            <select
              id="mobile"
              value={filterMobile}
              onChange={(e) => setFilterMobile(e.target.value)}
              disabled={!board}
            >
              <option value="">Todos</option>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={String(n)}>
                  Móvil {n}
                </option>
              ))}
            </select>
          </div>
          <button
            className="btn"
            type="submit"
            disabled={busy || !versions.length || !datesValid}
          >
            {busy ? 'Cargando…' : 'Consultar'}
          </button>
          {(filterInspector || filterMobile) && board ? (
            <button
              className="btn secondary"
              type="button"
              onClick={() => {
                setFilterInspector('');
                setFilterMobile('');
              }}
            >
              Limpiar filtros
            </button>
          ) : null}
          {versionId !== ALL_VERSIONS ? (
            <button
              className="btn secondary"
              type="button"
              disabled={busy}
              onClick={() => {
                const v = versions.find((x) => x.id === versionId);
                if (!v) return;
                const from = toDateOnly(v.periodo_desde);
                const to = toDateOnly(v.periodo_hasta);
                setTouched({ from: true, to: true });
                setDateFrom(from);
                setDateTo(to);
                void loadBoard(versionId, from, to);
              }}
            >
              Período de la versión
            </button>
          ) : null}
        </form>
        {rangeError ? (
          <p className="filters-errors" role="alert">
            {rangeError}
          </p>
        ) : null}
        {loadedLabel ? (
          <p className="muted" style={{ margin: '0.65rem 0 0' }}>
            {loadedLabel}
            {dataBounds.min && dataBounds.max
              ? ` · Datos en versiones: ${dataBounds.min} → ${dataBounds.max}`
              : ''}
          </p>
        ) : null}
      </section>

      {board ? (
        <>
          <section className="panel summary-strip">
            <div>
              <strong>{board.summary.huecos}</strong>
              <span>Huecos (0)</span>
            </div>
            <div>
              <strong>{board.summary.solapamientos}</strong>
              <span>Solapamientos (2)</span>
            </div>
            <div>
              <strong>{board.summary.asignaciones_vacacion}</strong>
              <span>Días-inspector en vacaciones</span>
            </div>
            <div>
              <strong>{board.summary.dias_con_vacaciones}</strong>
              <span>Días calendario con V</span>
            </div>
          </section>

          <section className="panel legend-strip" aria-label="Leyenda de códigos">
            <span className="leg xlsx-m">M# mañana</span>
            <span className="leg xlsx-t">T# tarde</span>
            <span className="leg xlsx-n">N# noche</span>
            <span className="leg xlsx-f">F franco</span>
            <span className="leg xlsx-v">V vacaciones</span>
            <span className="leg xlsx-ef">EF enfermedad</span>
          </section>

          <section className="panel xlsx-wrap">
            {inspectors.length === 0 ? (
              <p className="muted" style={{ margin: '0.5rem 0.75rem' }}>
                {allInspectors.length === 0
                  ? `No hay días para ${dateFrom || '…'} → ${dateTo || '…'}. Proyectá el futuro en Proyección o ampliá el rango con “Todas (unir capas)”.`
                  : 'Ningún inspector coincide con los filtros de inspector/móvil.'}
              </p>
            ) : null}
            <div className="xlsx-scroll">
              <table className="xlsx-grid">
                <thead>
                  <tr className="month-row">
                    <th className="sticky-col" />
                    <th className="sticky-col-2" />
                    {months.map((m) => (
                      <th key={m.key} colSpan={m.span} className="month-cell">
                        {m.label}
                      </th>
                    ))}
                  </tr>
                  <tr>
                    <th className="sticky-col">#</th>
                    <th className="sticky-col-2">Inspector</th>
                    {dates.map((d) => (
                      <th key={`wd-${d}`}>{weekdayLetter(d)}</th>
                    ))}
                  </tr>
                  <tr>
                    <th className="sticky-col" />
                    <th className="sticky-col-2" />
                    {dates.map((d) => (
                      <th key={`dt-${d}`}>{d.slice(8)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {inspectors.map((insp, idx) => (
                    <tr key={insp.key} className={idx % 2 ? 'alt' : undefined}>
                      <td className="sticky-col">{idx + 1}</td>
                      <td className="sticky-col-2 inspector-name">{insp.name}</td>
                      {dates.map((d) => {
                        const cell = visibleCell(cellMap.get(`${insp.key}|${d}`));
                        if (!cell) return <td key={`${insp.key}-${d}`} />;
                        return (
                          <td
                            key={`${insp.key}-${d}`}
                            className={cellClass(cell.codigo, cell.tipo_dia)}
                            title={`${d} · ${cell.codigo}`}
                          >
                            {cell.codigo}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel">
            <h2 style={{ marginTop: 0, fontFamily: 'var(--font-display)' }}>
              Cuadro de cobertura
            </h2>
            <p className="muted">
              0 = hueco · 1 = cobertura normal · 2 = solapamiento / reforzada
              {mobileNumber != null ? ` · filtrado móvil ${mobileNumber}` : ''}
            </p>
            <div className="xlsx-scroll">
              <table className="xlsx-grid coverage-grid">
                <thead>
                  <tr className="month-row">
                    <th className="sticky-col" />
                    <th className="sticky-col-2" />
                    {months.map((m) => (
                      <th key={`cov-m-${m.key}`} colSpan={m.span} className="month-cell">
                        {m.label}
                      </th>
                    ))}
                  </tr>
                  <tr>
                    <th className="sticky-col">Móvil</th>
                    <th className="sticky-col-2">Turno</th>
                    {dates.map((d) => (
                      <th key={`c-${d}`}>{d.slice(8)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {coverageMobiles.flatMap((mobile) =>
                    SHIFTS.map((shift, i) => (
                      <tr key={`${mobile}-${shift}`}>
                        {i === 0 ? (
                          <td className="sticky-col" rowSpan={3}>
                            {mobile}
                          </td>
                        ) : null}
                        <td className="sticky-col-2">{SHIFT_LABEL[shift]}</td>
                        {dates.map((d) => {
                          const n = coverageMap.get(`${d}|${mobile}|${shift}`);
                          const value = n ?? '';
                          return (
                            <td
                              key={`${d}-${mobile}-${shift}`}
                              className={typeof n === 'number' ? coverageClass(n) : undefined}
                            >
                              {value}
                            </td>
                          );
                        })}
                      </tr>
                    )),
                  )}
                  {mobileNumber == null ? (
                    <>
                      <tr>
                        <td className="sticky-col" colSpan={2}>
                          Franco
                        </td>
                        {dates.map((d) => (
                          <td key={`f-${d}`}>{totalsMap.get(d)?.francos ?? 0}</td>
                        ))}
                      </tr>
                      <tr>
                        <td className="sticky-col" colSpan={2}>
                          Vacaciones
                        </td>
                        {dates.map((d) => {
                          const n = totalsMap.get(d)?.vacaciones ?? 0;
                          return (
                            <td key={`v-${d}`} className={n > 0 ? 'xlsx-v' : undefined}>
                              {n}
                            </td>
                          );
                        })}
                      </tr>
                      <tr>
                        <td className="sticky-col" colSpan={2}>
                          Enfermedad
                        </td>
                        {dates.map((d) => {
                          const n = totalsMap.get(d)?.enfermedades ?? 0;
                          return (
                            <td key={`ef-${d}`} className={n > 0 ? 'xlsx-ef' : undefined}>
                              {n}
                            </td>
                          );
                        })}
                      </tr>
                    </>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : (
        <section className="panel muted">
          {versions.length === 0
            ? 'No hay versiones. Confirme primero la inicialización Excel.'
            : 'Indique un rango y pulse Consultar.'}
        </section>
      )}
    </div>
  );
}
