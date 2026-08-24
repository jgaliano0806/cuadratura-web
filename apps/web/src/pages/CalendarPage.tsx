import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { VACATION_DURATIONS } from '@plataforma/shared';
import { api } from '../lib/api';
import {
  daysInRange,
  firstIssueFor,
  isIsoDate,
  validateDateRange,
} from '../lib/dateRange';
import { useLocalStorage } from '../lib/useLocalStorage';
import { downloadCsv } from '../lib/csv';
import {
  DayDetailPanel,
  InspectorMasterList,
  ScheduleObjectBar,
  ShiftCell,
  SwapInspectorsModal,
  type AbsenceKind,
  type ScheduleMode,
  type ScheduleTab,
} from '../components/schedule';
import { Modal, SkeletonTable, useToast } from '../components/ui';
import {
  type BoardResponse,
  type CoverageRow,
  type DailyTotal,
  type DayRow,
  type InspectorRow,
  MONTHS_ES,
  SHIFTS,
  SHIFT_LABEL,
  cellTone,
  coverageClass,
  eachDate,
  iso,
  monthBounds,
  monthLabel,
  monthSpansHelper,
  rowKey,
  shiftMonth,
  toDateOnly,
  weekdayLetter,
} from '../lib/scheduleUtils';

function monthSpans(dates: string[]) {
  return monthSpansHelper(
    dates,
    MONTHS_ES.map((m) => m.toUpperCase()),
  );
}

/** La grilla UI no debe cargar el horizonte completo de proyección. */
const CALENDAR_MAX_DAYS = 62;

function resolveCalendarRange(
  fromRaw: string,
  toRaw: string,
  fallbackAnchor: string,
): { from: string; to: string } {
  if (fromRaw && toRaw && isIsoDate(fromRaw) && isIsoDate(toRaw) && fromRaw <= toRaw) {
    if (daysInRange(fromRaw, toRaw) <= CALENDAR_MAX_DAYS) {
      return { from: fromRaw, to: toRaw };
    }
    return monthBounds(fromRaw);
  }
  return monthBounds(fallbackAnchor || iso(new Date()));
}

function networkErrorMessage(err: unknown): string {
  if (err instanceof TypeError || (err instanceof Error && err.message === 'Failed to fetch')) {
    return 'No se pudo completar la consulta. Probá un rango de un mes (‹ ›) o verificá que la API esté en marcha.';
  }
  return err instanceof Error ? err.message : 'Error';
}

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

type PersistedCalendarFilters = {
  versionId: string;
  inspector: string;
  mobile: string;
};

const CALENDAR_FILTERS_KEY = 'sv_calendar_filters_v1';
const CALENDAR_RANGE_KEY = 'sv_calendar_range_v1';
const CALENDAR_MODE_KEY = 'sv_calendar_mode_v1';
const ALL_VERSIONS = '__ALL__';

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
  if (v.capa === 'REAL') return 1;
  if (v.capa === 'PLANIFICADA') return 2;
  if (v.capa === 'BASE' && v.estado === 'APROBADA_PUBLICADA') return 3;
  if (v.estado === 'APROBADA_PUBLICADA') return 4;
  return 5;
}

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
      dias_con_vacaciones: totalRows.filter((r) => Number(r.vacaciones) > 0)
        .length,
    },
  };
}

function classicCellClass(codigo: string, tipo: string) {
  const tone = cellTone(codigo, tipo);
  if (tone === 'vacacion') return 'xlsx-v';
  if (tone === 'enfermedad') return 'xlsx-ef';
  if (tone === 'franco') return 'xlsx-f';
  if (tone === 'manana') return 'xlsx-m';
  if (tone === 'tarde') return 'xlsx-t';
  if (tone === 'noche') return 'xlsx-n';
  return '';
}

type CalendarLayer = 'planned' | 'real';

export function CalendarPage({ layer = 'planned' }: { layer?: CalendarLayer }) {
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [persistedFilters, setPersistedFilters] =
    useLocalStorage<PersistedCalendarFilters>(CALENDAR_FILTERS_KEY, {
      versionId: ALL_VERSIONS,
      inspector: '',
      mobile: '',
    });
  const [persistedRange, setPersistedRange] = useLocalStorage<{
    from: string;
    to: string;
  }>(CALENDAR_RANGE_KEY, { from: '', to: '' });
  const [mode, setMode] = useLocalStorage<ScheduleMode>(CALENDAR_MODE_KEY, 'sap');

  const initialRange = resolveCalendarRange(
    searchParams.get('from') || persistedRange.from || '',
    searchParams.get('to') || persistedRange.to || '',
    iso(new Date()),
  );

  const [versions, setVersions] = useState<Version[]>([]);
  const [versionId, setVersionId] = useState(persistedFilters.versionId);
  const [dateFrom, setDateFrom] = useState(initialRange.from);
  const [dateTo, setDateTo] = useState(initialRange.to);
  const [board, setBoard] = useState<BoardResponse | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadedLabel, setLoadedLabel] = useState('');
  const [filterInspector, setFilterInspector] = useState(
    persistedFilters.inspector,
  );
  const [filterMobile, setFilterMobile] = useState(persistedFilters.mobile);
  const [tab, setTab] = useState<ScheduleTab>('plan');
  const [selection, setSelection] = useState<{
    cell: DayRow;
    dateFrom: string;
    dateTo: string;
  } | null>(null);
  const [catalogInspectors, setCatalogInspectors] = useState<
    Array<{ id: string; nombre_completo: string }>
  >([]);
  const [swapOpen, setSwapOpen] = useState(false);
  const [absenceKind, setAbsenceKind] = useState<AbsenceKind | null>(null);
  const [absenceReason, setAbsenceReason] = useState('');
  const [vacationDays, setVacationDays] = useState<number>(VACATION_DURATIONS[0]);
  const [actionBusy, setActionBusy] = useState(false);

  useEffect(() => {
    setPersistedFilters({
      versionId,
      inspector: filterInspector,
      mobile: filterMobile,
    });
  }, [versionId, filterInspector, filterMobile, setPersistedFilters]);

  useEffect(() => {
    if (dateFrom && dateTo) setPersistedRange({ from: dateFrom, to: dateTo });
  }, [dateFrom, dateTo, setPersistedRange]);

  const dateIssues = useMemo(
    () =>
      validateDateRange(dateFrom, dateTo, {
        required: true,
        maxDays: CALENDAR_MAX_DAYS,
      }),
    [dateFrom, dateTo],
  );
  const datesValid = dateIssues.length === 0;
  const rangeError = firstIssueFor(dateIssues, 'range');

  useEffect(() => {
    // Si quedó un horizonte enorme de sesiones previas, forzar mes.
    const clamped = resolveCalendarRange(dateFrom, dateTo, iso(new Date()));
    if (clamped.from !== dateFrom || clamped.to !== dateTo) {
      setDateFrom(clamped.from);
      setDateTo(clamped.to);
      setPersistedRange(clamped);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refreshVersions(opts?: { preserveRange?: boolean }) {
    const requestedLayer = layer === 'real' ? 'REAL' : 'PLANIFICADA';
    const requested = await api<Version[]>(`/planning/versions?capa=${requestedLayer}`);
    let data: Version[];
    if (layer === 'real') {
      const planVersions = await api<Version[]>('/planning/versions?capa=PLANIFICADA');
      data = [...requested, ...planVersions];
    } else {
      data = requested.length ? requested : await api<Version[]>('/planning/versions?capa=BASE');
    }
    setVersions(data);
    setVersionId(ALL_VERSIONS);

    if (opts?.preserveRange) return data;

    const qsFrom = searchParams.get('from') || '';
    const qsTo = searchParams.get('to') || '';
    if (qsFrom && qsTo) {
      const clamped = resolveCalendarRange(qsFrom, qsTo, qsFrom);
      setDateFrom(clamped.from);
      setDateTo(clamped.to);
      return data;
    }
    if (dateFrom && dateTo) return data;

    const preferred = pickDefaultVersion(data);
    const anchor =
      toDateOnly(preferred?.periodo_desde) || '2026-06-01';
    const b = monthBounds(anchor);
    setDateFrom(b.from);
    setDateTo(b.to);
    return data;
  }

  useEffect(() => {
    refreshVersions().catch((e) => {
      const msg = networkErrorMessage(e);
      setError(msg);
      toast.error(msg);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layer]);

  async function loadBoard(
    selectedVersionId: string,
    from: string,
    to: string,
    overrideVersions?: Version[],
  ) {
    const versionsList = overrideVersions ?? versions;
    const issues = validateDateRange(from, to, {
      required: true,
      maxDays: CALENDAR_MAX_DAYS,
    });
    if (issues.length) {
      setError(issues[0].message);
      setBoard(null);
      setLoadedLabel('');
      return;
    }
    if (!versionsList.length) {
      setError(
        'No hay versiones publicadas todavía. Andá a Proyección → "Generar PLANIFICADA".',
      );
      setBoard(null);
      setLoadedLabel('');
      return;
    }

    setBusy(true);
    setError('');
    const q = new URLSearchParams({ date_from: from, date_to: to });

    try {
      let targets: Version[];
      if (selectedVersionId === ALL_VERSIONS) {
        if (layer === 'real') {
          const realVersions = versionsList.filter((v) => v.capa === 'REAL');
          const planVersions = versionsList.filter((v) => v.capa === 'PLANIFICADA');
          const bestPlan = pickDefaultVersion(planVersions) ?? planVersions[0];
          targets = [...realVersions, ...(bestPlan ? [bestPlan] : [])];
        } else {
          targets = versionsList.slice(0, 1);
        }
      } else {
        targets = versionsList.filter((v) => v.id === selectedVersionId);
      }

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
          ? (versionsList.find((v) => v.capa === 'REAL')?.id ?? versionsList[0].id)
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
      setSelection(null);
      const used = results
        .filter((r) => r.board.days.length > 0)
        .map((r) => `${r.version.capa} ${r.version.codigo}`);
      setLoadedLabel(
        used.length
          ? `Datos de: ${used.join(' + ')}`
          : 'Sin días en el rango para las versiones consultadas',
      );
    } catch (err) {
      setError(networkErrorMessage(err));
      setBoard(null);
      setLoadedLabel('');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (versions.length && dateFrom && dateTo && datesValid) {
      void loadBoard(versionId, dateFrom, dateTo);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versions]);

  function applyRange(from: string, to: string) {
    setDateFrom(from);
    setDateTo(to);
    setSearchParams((prev) => {
      prev.set('from', from);
      prev.set('to', to);
      return prev;
    });
    if (versions.length) void loadBoard(versionId, from, to);
  }

  function goMonth(delta: number) {
    const b = shiftMonth(dateFrom || iso(new Date()), delta);
    applyRange(b.from, b.to);
  }

  const dates = useMemo(() => {
    if (datesValid) return eachDate(dateFrom, dateTo);
    if (!board) return [] as string[];
    return [
      ...new Set(board.days.map((d) => toDateOnly(d.fecha_operativa))),
    ].sort();
  }, [board, dateFrom, dateTo, datesValid]);

  const months = useMemo(() => monthSpans(dates), [dates]);

  const allInspectors = useMemo(() => {
    if (!board) return [] as InspectorRow[];
    const map = new Map<string, InspectorRow>();
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
    return [...map.values()].sort(
      (a, b) => a.legajo.localeCompare(b.legajo) || a.name.localeCompare(b.name),
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
    () => (mobileNumber != null ? [mobileNumber] : [1, 2, 3, 4, 5, 6, 7]),
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

  const todayIso = iso(new Date());
  const todayByKey = useMemo(() => {
    const map = new Map<string, DayRow | undefined>();
    for (const insp of allInspectors) {
      map.set(insp.key, visibleCell(cellMap.get(`${insp.key}|${todayIso}`)));
    }
    return map;
  }, [allInspectors, cellMap, todayIso, mobileNumber]);

  const versionOptions = useMemo(
    () => [
      {
        id: ALL_VERSIONS,
        label: layer === 'real' ? 'Cronograma real vigente' : 'Cuadratura ideal',
      },
      ...versions.map((v) => ({
        id: v.id,
        label: `${v.capa} · ${v.codigo} v${v.numero_version}`,
      })),
    ],
    [versions, layer],
  );

  function exportInspectorsCsv() {
    if (!board || !inspectors.length || !dates.length) {
      toast.info('Nada para exportar todavía.');
      return;
    }
    const header = ['#', 'Legajo', 'Inspector', ...dates];
    const rows: unknown[][] = [header];
    inspectors.forEach((insp, idx) => {
      const line: unknown[] = [idx + 1, insp.legajo, insp.name];
      for (const d of dates) {
        const cell = visibleCell(cellMap.get(`${insp.key}|${d}`));
        line.push(cell?.codigo ?? '');
      }
      rows.push(line);
    });
    downloadCsv(`cronograma-${dateFrom}_${dateTo}.csv`, rows);
    toast.success('Archivo CSV descargado.');
  }

  function exportCoverageCsv() {
    if (!board || !dates.length) {
      toast.info('Nada para exportar todavía.');
      return;
    }
    const header = ['Móvil', 'Turno', ...dates];
    const rows: unknown[][] = [header];
    for (const m of coverageMobiles) {
      for (const s of SHIFTS) {
        const line: unknown[] = [`Móvil ${m}`, SHIFT_LABEL[s]];
        for (const d of dates) {
          line.push(coverageMap.get(`${d}|${m}|${s}`) ?? '');
        }
        rows.push(line);
      }
    }
    downloadCsv(`cobertura-${dateFrom}_${dateTo}.csv`, rows);
    toast.success('Cobertura exportada a CSV.');
  }

  function onVersionChange(id: string) {
    setVersionId(id);
    if (datesValid) void loadBoard(id, dateFrom, dateTo);
  }

  useEffect(() => {
    if (layer !== 'real') return;
    api<Array<{ id: string; nombre_completo: string }>>('/operations/inspectors')
      .then(setCatalogInspectors)
      .catch(() => setCatalogInspectors([]));
  }, [layer]);

  function selectCell(
    cell: DayRow,
    date: string,
    opts?: { extend?: boolean },
  ) {
    if (layer === 'real' && selection && rowKey(selection.cell) === rowKey(cell)) {
      if (date === selection.dateFrom && date === selection.dateTo) {
        return;
      }
      const anchor = selection.dateFrom;
      const lo = anchor <= date ? anchor : date;
      const hi = anchor <= date ? date : anchor;
      setSelection({ cell, dateFrom: lo, dateTo: hi });
      return;
    }
    setSelection({ cell, dateFrom: date, dateTo: date });
  }

  function isDateInSelection(inspKey: string, date: string) {
    if (!selection || rowKey(selection.cell) !== inspKey) return false;
    return date >= selection.dateFrom && date <= selection.dateTo;
  }

  async function confirmSwap(payload: {
    inspectorBId: string;
    reason: string;
  }) {
    if (!selection?.cell.inspector_id) return;
    setActionBusy(true);
    try {
      await api('/schedule-engine/swap', {
        method: 'POST',
        body: JSON.stringify({
          inspector_a_id: selection.cell.inspector_id,
          inspector_b_id: payload.inspectorBId,
          date_from: selection.dateFrom,
          date_to: selection.dateTo,
          reason: payload.reason,
          rematerialize: true,
        }),
      });
      toast.success('Enroque aplicado en cronograma real. La ideal no cambió.');
      setSwapOpen(false);
      const fresh = await refreshVersions({ preserveRange: true });
      if (fresh?.length) await loadBoard(ALL_VERSIONS, dateFrom, dateTo, fresh);
    } catch (err) {
      toast.error(networkErrorMessage(err));
    } finally {
      setActionBusy(false);
    }
  }

  const DEMAND_WORK: Record<number, number> = { 7: 0, 14: 1, 21: 2, 28: 1, 35: 2 };

  function offsetDate(base: string, days: number) {
    const d = new Date(base + 'T00:00:00');
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }

  function vacationValidation(): { ok: boolean; errors: string[] } {
    if (!selection) return { ok: false, errors: ['Sin selección'] };
    const inspKey = rowKey(selection.cell);
    const errors: string[] = [];

    for (let i = 1; i <= 3; i++) {
      const prevDate = offsetDate(selection.dateFrom, -i);
      const prevCell = cellMap.get(`${inspKey}|${prevDate}`);
      if (!prevCell || (prevCell.tipo_dia !== 'FRANCO' && prevCell.codigo !== 'F')) {
        errors.push(
          `RN-021: Las vacaciones deben empezar después de 3 francos. El día ${prevDate} no es franco.`,
        );
        break;
      }
    }
    return { ok: errors.length === 0, errors };
  }

  function vacationSummary() {
    if (!selection) return null;
    const demand = DEMAND_WORK[vacationDays] ?? 0;
    const vacEnd = offsetDate(selection.dateFrom, vacationDays - 1);
    const demandStart = demand > 0 ? offsetDate(selection.dateFrom, vacationDays) : null;
    const demandEnd = demand > 0 ? offsetDate(selection.dateFrom, vacationDays + demand - 1) : null;
    const francoPost = offsetDate(selection.dateFrom, vacationDays + demand);
    return { demand, vacEnd, demandStart, demandEnd, francoPost };
  }

  async function confirmAbsence() {
    if (!selection?.cell.inspector_id || !absenceKind) return;
    if (absenceReason.trim().length < 5) {
      toast.info('Indicá un motivo de al menos 5 caracteres.');
      return;
    }

    if (absenceKind === 'VACACION') {
      const { ok, errors } = vacationValidation();
      if (!ok) {
        toast.error(errors[0]);
        return;
      }
    }

    setActionBusy(true);
    try {
      if (absenceKind === 'VACACION') {
        const sum = vacationSummary()!;
        const inspId = selection.cell.inspector_id;
        const reason = absenceReason.trim();

        const vacResult = await api<{ id: string }>('/vacations', {
          method: 'POST',
          body: JSON.stringify({
            inspectorId: inspId,
            dateFrom: selection.dateFrom,
            days: vacationDays,
            reason,
            layer: 'REAL',
          }),
        });

        await api('/schedule-engine/absence', {
          method: 'POST',
          body: JSON.stringify({
            inspector_id: inspId,
            date_from: selection.dateFrom,
            date_to: sum.vacEnd,
            kind: 'VACACION',
            reason,
            rematerialize: false,
          }),
        });

        await api('/schedule-engine/absence', {
          method: 'POST',
          body: JSON.stringify({
            inspector_id: inspId,
            date_from: sum.francoPost,
            date_to: sum.francoPost,
            kind: 'FERIADO',
            reason: 'Franco post-vacación (RN-021/022/023)',
            rematerialize: false,
          }),
        });

        // applyReal solo copia el rango pedido. Hay que materializar V + demanda + 1F,
        // no únicamente el franco posterior.
        await api('/schedule-engine/apply-real', {
          method: 'POST',
          body: JSON.stringify({
            date_from: selection.dateFrom,
            date_to: sum.francoPost,
          }),
        });

        if (sum.demand > 0 && vacResult?.id) {
          toast.info(
            `Vacación registrada. Quedan ${sum.demand} trabajo${sum.demand > 1 ? 's' : ''} a demanda por asignar (ver Vacaciones y licencias).`,
          );
        }
      } else {
        await api('/schedule-engine/absence', {
          method: 'POST',
          body: JSON.stringify({
            inspector_id: selection.cell.inspector_id,
            date_from: selection.dateFrom,
            date_to: selection.dateTo,
            kind: absenceKind,
            reason: absenceReason.trim(),
            rematerialize: true,
          }),
        });
      }
      toast.success(`${absenceKind} registrada en cronograma real.`);
      setAbsenceKind(null);
      setAbsenceReason('');
      const fresh = await refreshVersions({ preserveRange: true });
      if (fresh?.length) await loadBoard(ALL_VERSIONS, dateFrom, dateTo, fresh);
    } catch (err) {
      toast.error(networkErrorMessage(err));
    } finally {
      setActionBusy(false);
    }
  }

  return (
    <div className="stack sap-page">
      <header className="page-header">
        <div>
          <h1>{layer === 'real' ? 'Cronograma real' : 'Cronograma planificado'}</h1>
          <p>
            {layer === 'real'
              ? 'Gestión diaria de enroques, francos, coberturas, vacaciones y licencias sin alterar la cuadratura ideal.'
              : 'Cuadratura ideal por defecto: turnos, móviles y francos previstos para cada inspector.'}
          </p>
        </div>
      </header>

      {layer === 'real' ? (
        <section className="workflow-actions no-print" aria-label="Acciones del cronograma real">
          <Link className="workflow-action" to="/huecos">
            <strong>Enroques y coberturas</strong>
            <span>Resolver huecos y reemplazos del día.</span>
          </Link>
          <Link className="workflow-action" to="/vacaciones">
            <strong>Vacaciones y licencias</strong>
            <span>Registrar ausencias y asignaciones temporales.</span>
          </Link>
          <Link className="workflow-action" to="/proyeccion">
            <strong>Actualizar cronograma real</strong>
            <span>Materializar las novedades operativas registradas.</span>
          </Link>
        </section>
      ) : (
        <section className="workflow-note no-print">
          <strong>Referencia protegida</strong>
          <span>Los cambios del día se gestionan en Cronograma real y no modifican esta secuencia.</span>
          <Link to="/aprobacion">Revisar y aprobar</Link>
        </section>
      )}

      {error ? <div className="error-box">{error}</div> : null}

      <ScheduleObjectBar
        monthLabel={monthLabel(dateFrom || iso(new Date()))}
        onPrevMonth={() => goMonth(-1)}
        onNextMonth={() => goMonth(1)}
        onThisMonth={() => {
          const b = monthBounds(iso(new Date()));
          applyRange(b.from, b.to);
        }}
        versionId={versionId}
        versions={versionOptions}
        onVersionChange={onVersionChange}
        primaryTabLabel={layer === 'real' ? 'Detalle diario' : 'Planificación'}
        tab={tab}
        onTabChange={setTab}
        mode={mode}
        onModeChange={setMode}
        busy={busy}
        onRefresh={() => void loadBoard(versionId, dateFrom, dateTo)}
        actions={
          <>
            <button
              type="button"
              className="btn secondary sm"
              onClick={exportInspectorsCsv}
              disabled={!board}
            >
              CSV
            </button>
            <button
              type="button"
              className="btn secondary sm"
              onClick={() => window.print()}
              disabled={!board}
            >
              PDF
            </button>
          </>
        }
      />

      {!versions.length ? (
        <section className="panel">
          <p className="muted" style={{ margin: 0 }}>
            {layer === 'real'
              ? 'Todavía no hay un cronograma real para este período. '
              : 'Todavía no hay una cuadratura ideal publicada. '}
            <Link to="/proyeccion">Ir a generación de cronogramas</Link>.
          </p>
        </section>
      ) : null}

      {rangeError ? (
        <p className="filters-errors" role="alert">
          {rangeError}
        </p>
      ) : null}

      {busy && !board ? (
        <section className="panel">
          <table className="data">
            <tbody>
              <SkeletonTable cols={6} rows={6} />
            </tbody>
          </table>
        </section>
      ) : null}

      {board && mode === 'sap' && tab === 'plan' ? (
        <div className={`sap-shell${selection ? ' with-detail' : ''}`}>
          <InspectorMasterList
            inspectors={allInspectors}
            selectedKey={filterInspector}
            onSelect={setFilterInspector}
            todayByKey={todayByKey}
            todayIso={todayIso}
          />

          <section className="sap-board panel">
            <div className="sap-board-meta muted">
              {loadedLabel || `${dateFrom} → ${dateTo}`}
              {filterMobile ? ` · Móvil ${filterMobile}` : ''}
              {layer === 'real' ? (
                <span> · Click 2.ª celda del mismo inspector para rango</span>
              ) : null}
              <div className="sap-board-filters">
                <label>
                  Móvil
                  <select
                    value={filterMobile}
                    onChange={(e) => setFilterMobile(e.target.value)}
                  >
                    <option value="">Todos</option>
                    {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                      <option key={n} value={String(n)}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            {board.summary ? (
              <div className="summary-strip sap-summary">
                <div>
                  <strong>{board.summary.huecos}</strong>
                  <span>Huecos</span>
                </div>
                <div>
                  <strong>{board.summary.solapamientos}</strong>
                  <span>Solapamientos</span>
                </div>
                <div>
                  <strong>{board.summary.asignaciones_vacacion}</strong>
                  <span>Días en vacaciones</span>
                </div>
              </div>
            ) : null}

            <div className="sap-legend" aria-label="Leyenda">
              <span className="sap-chip-manana">M mañana</span>
              <span className="sap-chip-tarde">T tarde</span>
              <span className="sap-chip-noche">N noche</span>
              <span className="sap-chip-franco">F franco</span>
              <span className="sap-chip-vacacion">V vacaciones</span>
              <span className="sap-chip-enfermedad">EF enfermedad</span>
            </div>

            {inspectors.length === 0 ? (
              <p className="muted">Ningún inspector coincide con los filtros.</p>
            ) : (
              <div className="sap-grid-scroll">
                <table className="sap-grid">
                  <thead>
                    <tr>
                      <th className="sap-sticky-name">Inspector</th>
                      {dates.map((d) => (
                        <th key={d} className={d === todayIso ? 'is-today' : undefined}>
                          <span className="sap-wd">{weekdayLetter(d)}</span>
                          <span className="sap-day">{d.slice(8)}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {inspectors.map((insp) => (
                      <tr key={insp.key}>
                        <th className="sap-sticky-name">
                          <div className="sap-insp-name">{insp.name}</div>
                          {insp.legajo ? (
                            <div className="sap-insp-legajo">{insp.legajo}</div>
                          ) : null}
                        </th>
                        {dates.map((d) => {
                          const cell = visibleCell(
                            cellMap.get(`${insp.key}|${d}`),
                          );
                          if (!cell) {
                            return (
                              <td key={`${insp.key}-${d}`} className="sap-empty" />
                            );
                          }
                          const selected =
                            selection != null &&
                            rowKey(selection.cell) === insp.key &&
                            d === selection.dateFrom;
                          const inRange = isDateInSelection(insp.key, d);
                          return (
                            <td key={`${insp.key}-${d}`}>
                              <ShiftCell
                                cell={cell}
                                date={d}
                                selected={selected}
                                rangeSelected={inRange && !selected}
                                onSelect={selectCell}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <DayDetailPanel
            cell={selection?.cell ?? null}
            dateFrom={selection?.dateFrom ?? null}
            dateTo={selection?.dateTo ?? null}
            editable={layer === 'real'}
            busy={actionBusy}
            onClose={() => setSelection(null)}
            onSwap={() => setSwapOpen(true)}
            onAbsence={(kind) => {
              setAbsenceKind(kind);
              setAbsenceReason('');
            }}
          />
        </div>
      ) : null}

      <SwapInspectorsModal
        open={swapOpen && layer === 'real'}
        source={selection?.cell ?? null}
        dateFrom={selection?.dateFrom ?? ''}
        dateTo={selection?.dateTo ?? selection?.dateFrom ?? ''}
        inspectors={catalogInspectors}
        busy={actionBusy}
        onClose={() => setSwapOpen(false)}
        onConfirm={confirmSwap}
      />

      <Modal
        open={!!absenceKind && layer === 'real'}
        onClose={() => {
          if (!actionBusy) setAbsenceKind(null);
        }}
        title={absenceKind ? `Registrar ${absenceKind}` : 'Ausencia'}
        description={
          selection
            ? `${selection.cell.inspector ?? 'Inspector'} · ${selection.dateFrom}${
                selection.dateTo !== selection.dateFrom
                  ? ` → ${selection.dateTo}`
                  : ''
              }`
            : undefined
        }
        footer={
          <>
            <button
              type="button"
              className="btn secondary"
              disabled={actionBusy}
              onClick={() => setAbsenceKind(null)}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn amber"
              disabled={
                actionBusy ||
                absenceReason.trim().length < 5 ||
                (absenceKind === 'VACACION' && !vacationValidation().ok)
              }
              onClick={() => void confirmAbsence()}
            >
              {actionBusy ? 'Guardando…' : 'Confirmar'}
            </button>
          </>
        }
      >
        {absenceKind === 'VACACION' && selection ? (
          <div style={{ marginBottom: '0.75rem' }}>
            <div className="field">
              <label htmlFor="vacation-days">Días de vacaciones a otorgar</label>
              <select
                id="vacation-days"
                value={vacationDays}
                onChange={(e) => setVacationDays(Number(e.target.value))}
              >
                {VACATION_DURATIONS.map((d) => (
                  <option key={d} value={d}>
                    {d} días{DEMAND_WORK[d] ? ` (+${DEMAND_WORK[d]} trabajo a demanda)` : ''}
                  </option>
                ))}
              </select>
            </div>

            {(() => {
              const sum = vacationSummary();
              const val = vacationValidation();
              if (!sum) return null;
              return (
                <div style={{ marginTop: '0.75rem' }}>
                  <p style={{ margin: '0 0 0.25rem' }}>
                    <strong>Secuencia según RN-021/022/023:</strong>
                  </p>
                  <table style={{ fontSize: '0.85rem', width: '100%', marginBottom: '0.5rem' }}>
                    <tbody>
                      <tr>
                        <td style={{ padding: '2px 8px 2px 0', whiteSpace: 'nowrap' }}>3F (previos):</td>
                        <td>{offsetDate(selection.dateFrom, -3)} → {offsetDate(selection.dateFrom, -1)}</td>
                      </tr>
                      <tr>
                        <td style={{ padding: '2px 8px 2px 0', whiteSpace: 'nowrap' }}><strong>{vacationDays}V:</strong></td>
                        <td><strong>{selection.dateFrom} → {sum.vacEnd}</strong></td>
                      </tr>
                      {sum.demand > 0 ? (
                        <tr>
                          <td style={{ padding: '2px 8px 2px 0', whiteSpace: 'nowrap' }}>
                            {sum.demand} trabajo{sum.demand > 1 ? 's' : ''} a demanda:
                          </td>
                          <td>{sum.demandStart} → {sum.demandEnd}</td>
                        </tr>
                      ) : null}
                      <tr>
                        <td style={{ padding: '2px 8px 2px 0', whiteSpace: 'nowrap' }}>1F (post):</td>
                        <td>{sum.francoPost}</td>
                      </tr>
                    </tbody>
                  </table>
                  {sum.demand > 0 ? (
                    <p className="muted" style={{ margin: '0 0 0.5rem', fontSize: '0.8rem' }}>
                      Los trabajos a demanda se asignan desde "Vacaciones y licencias" una vez confirmada la vacación.
                    </p>
                  ) : null}
                  {!val.ok ? (
                    <p className="error-box" style={{ margin: '0.5rem 0 0' }}>
                      {val.errors[0]}
                    </p>
                  ) : (
                    <p className="success-box" style={{ margin: '0.5rem 0 0' }}>
                      Los 3 francos previos se verificaron correctamente.
                    </p>
                  )}
                </div>
              );
            })()}
          </div>
        ) : null}

        <div className="field">
          <label htmlFor="absence-reason">Motivo (mín. 5 caracteres)</label>
          <textarea
            id="absence-reason"
            rows={3}
            value={absenceReason}
            onChange={(e) => setAbsenceReason(e.target.value)}
            placeholder="Motivo operativo"
          />
        </div>
        <p className="muted" style={{ marginBottom: 0 }}>
          Se registra como overlay en cronograma real. La cuadratura ideal no se
          modifica.
        </p>
      </Modal>

      {board && mode === 'sap' && tab === 'coverage' ? (
        <section className="panel">
          <h2 style={{ marginTop: 0, fontFamily: 'var(--font-display)' }}>
            Cuadro de cobertura
          </h2>
          <p className="muted">
            0 = hueco · 1 = cobertura normal · 2 = solapamiento
          </p>
          <div className="xlsx-scroll">
            <table className="xlsx-grid coverage-grid">
              <thead>
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
                        return (
                          <td
                            key={`${d}-${mobile}-${shift}`}
                            className={
                              typeof n === 'number' ? coverageClass(n) : undefined
                            }
                          >
                            {n ?? ''}
                          </td>
                        );
                      })}
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {board && mode === 'classic' ? (
        <>
          <section className="panel legend-strip" aria-label="Leyenda">
            <span className="leg xlsx-m">M# mañana</span>
            <span className="leg xlsx-t">T# tarde</span>
            <span className="leg xlsx-n">N# noche</span>
            <span className="leg xlsx-f">F franco</span>
            <span className="leg xlsx-v">V vacaciones</span>
            <span className="leg xlsx-ef">EF enfermedad</span>
          </section>
          <section className="panel xlsx-wrap">
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
                            className={classicCellClass(cell.codigo, cell.tipo_dia)}
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
        </>
      ) : null}

      {!board && !busy && versions.length ? (
        <section className="panel muted">
          Indicá un rango válido o pulsá Actualizar.
        </section>
      ) : null}
    </div>
  );
}
