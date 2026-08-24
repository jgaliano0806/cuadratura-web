import { FormEvent, useEffect, useMemo, useState } from 'react';
import { VACATION_DURATIONS } from '@plataforma/shared';
import { api, ApiError } from '../lib/api';
import { ConfirmDialog, EmptyState, useToast } from '../components/ui';

type Inspector = { id: string; nombre_completo: string };
type Version = {
  id: string;
  codigo: string;
  capa: string;
  numero_version: number;
  estado: string;
};
type Vacation = {
  id: string;
  inspector: string;
  fecha_desde: string;
  fecha_hasta: string;
  cantidad_dias: number;
  cantidad_trabajos_demanda: number;
  estado: string;
};
type Proposal = {
  fecha_operativa: string;
  movil: number;
  turno: string;
  cantidad_asignada: number;
  prioridad_turno: number;
};

function shiftLabel(t: string): string {
  if (t === 'M') return 'Mañana';
  if (t === 'T') return 'Tarde';
  if (t === 'N') return 'Noche';
  return t;
}

function stateBadgeClass(estado: string): string {
  if (estado === 'BORRADOR') return 'badge neutral';
  if (estado === 'CONFIRMADA' || estado === 'APROBADA') return 'badge ok';
  if (estado === 'RECHAZADA') return 'badge pending';
  return 'badge neutral';
}

export function VacationsPage() {
  const toast = useToast();
  const [inspectors, setInspectors] = useState<Inspector[]>([]);
  const [versions, setVersions] = useState<Version[]>([]);
  const [list, setList] = useState<Vacation[]>([]);
  const [proposals, setProposals] = useState<Proposal[] | null>(null);
  const [inspectorId, setInspectorId] = useState('');
  const [inspectorQuery, setInspectorQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [days, setDays] = useState<number>(14);
  const [reason, setReason] = useState('Vacaciones programadas');
  const [versionId, setVersionId] = useState('');
  const [selectedVacation, setSelectedVacation] = useState<Vacation | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmAssign, setConfirmAssign] = useState(false);

  async function refresh() {
    const [i, v, vac] = await Promise.all([
      api<Inspector[]>('/operations/inspectors'),
      api<Version[]>('/planning/versions?capa=PLANIFICADA'),
      api<Vacation[]>('/vacations'),
    ]);
    setInspectors(i);
    setVersions(v);
    setList(vac);
    if (!inspectorId && i[0]) setInspectorId(i[0].id);
    if (!versionId && v[0]) setVersionId(v[0].id);
  }

  useEffect(() => {
    refresh().catch((e) => toast.error(e.message ?? 'Error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const inspectorOptions = useMemo(() => {
    const q = inspectorQuery.trim().toLowerCase();
    if (!q) return inspectors;
    return inspectors.filter((i) => i.nombre_completo.toLowerCase().includes(q));
  }, [inspectors, inspectorQuery]);

  const dateTo = useMemo(() => {
    if (!dateFrom || !days) return '';
    const d = new Date(`${dateFrom}T12:00:00`);
    if (Number.isNaN(d.getTime())) return '';
    d.setDate(d.getDate() + days - 1);
    return d.toISOString().slice(0, 10);
  }, [dateFrom, days]);

  const protocolHint = useMemo(() => {
    if (days === 7) return 'RN-021 · 3F + 7V + 1F · sin trabajo a demanda';
    if (days === 14) return 'RN-022 · 3F + 14V + 1 trabajo a demanda + 1F';
    if (days === 21) return 'RN-023 · 3F + 21V + 2 trabajos a demanda + 1F';
    if (days === 28) return 'RN-022 · 3F + 28V + 1 trabajo a demanda + 1F';
    if (days === 35) return 'RN-023 · 3F + 35V + 2 trabajos a demanda + 1F';
    return '';
  }, [days]);

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!inspectorId) {
      toast.warning('Elegí un inspector.');
      return;
    }
    if (!dateFrom) {
      toast.warning('Elegí la fecha de inicio.');
      return;
    }
    setBusy(true);
    try {
      const demandByDays: Record<number, number> = {
        7: 0,
        14: 1,
        21: 2,
        28: 1,
        35: 2,
      };
      const demand = demandByDays[days] ?? 0;
      const vacEnd = dateTo;
      const franco = new Date(`${dateFrom}T12:00:00`);
      franco.setDate(franco.getDate() + days + demand);
      const francoPost = franco.toISOString().slice(0, 10);

      await api('/vacations', {
        method: 'POST',
        body: JSON.stringify({
          inspectorId,
          dateFrom,
          days,
          reason,
          layer: 'REAL',
          versionId: versionId || undefined,
        }),
      });

      await api('/schedule-engine/absence', {
        method: 'POST',
        body: JSON.stringify({
          inspector_id: inspectorId,
          date_from: dateFrom,
          date_to: vacEnd,
          kind: 'VACACION',
          reason,
          rematerialize: false,
        }),
      });

      await api('/schedule-engine/absence', {
        method: 'POST',
        body: JSON.stringify({
          inspector_id: inspectorId,
          date_from: francoPost,
          date_to: francoPost,
          kind: 'FERIADO',
          reason: 'Franco post-vacación (RN-021/022/023)',
          rematerialize: false,
        }),
      });

      await api('/schedule-engine/apply-real', {
        method: 'POST',
        body: JSON.stringify({
          date_from: dateFrom,
          date_to: francoPost,
        }),
      });

      toast.success('Vacación registrada en cronograma real.');
      await refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error al registrar.');
    } finally {
      setBusy(false);
    }
  }

  async function loadProposals() {
    if (!selectedVacation) {
      toast.info('Seleccioná una vacación en el listado para proponer.');
      return;
    }
    if (!versionId) {
      toast.warning('Elegí una versión planificada.');
      return;
    }
    try {
      const data = await api<Proposal[]>(
        `/vacations/${selectedVacation.id}/demand-work/proposals?version_id=${versionId}`,
      );
      setProposals(data);
      if (!data.length) toast.info('No hay candidatos para trabajos a demanda.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error al proponer.');
    }
  }

  async function assignDemand() {
    if (!selectedVacation || !versionId) return;
    setConfirmAssign(false);
    try {
      await api(`/vacations/${selectedVacation.id}/demand-work/assign`, {
        method: 'POST',
        body: JSON.stringify({ versionId }),
      });
      toast.success('Trabajos a demanda asignados.');
      await refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Error al asignar.');
    }
  }

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <h1>Vacaciones</h1>
          <p>Protocolos 7/14/21/28/35 con trabajos a demanda T→N→M.</p>
        </div>
      </header>

      <section className="panel">
        <h2 style={{ marginTop: 0, fontFamily: 'var(--font-display)' }}>
          Registrar nueva vacación
        </h2>
        <form className="filters" onSubmit={create}>
          <div className="field" style={{ minWidth: 260 }}>
            <label htmlFor="insp-search">Inspector</label>
            <input
              id="insp-search"
              list="insp-datalist"
              value={inspectorQuery}
              placeholder="Buscar por nombre…"
              onChange={(e) => {
                setInspectorQuery(e.target.value);
                const match = inspectors.find(
                  (i) => i.nombre_completo === e.target.value,
                );
                if (match) setInspectorId(match.id);
              }}
            />
            <datalist id="insp-datalist">
              {inspectorOptions.slice(0, 60).map((i) => (
                <option key={i.id} value={i.nombre_completo} />
              ))}
            </datalist>
          </div>
          <div className="field">
            <label htmlFor="df">Inicio</label>
            <input
              id="df"
              type="date"
              required
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="days">Días</label>
            <select
              id="days"
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
            >
              {VACATION_DURATIONS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ minWidth: 220 }}>
            <label htmlFor="reason">Motivo</label>
            <input
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              minLength={5}
            />
          </div>
          <button className="btn" type="submit" disabled={busy}>
            {busy ? 'Registrando…' : 'Registrar'}
          </button>
        </form>
        {dateFrom && dateTo ? (
          <p className="muted" style={{ margin: '0.5rem 0 0' }}>
            Vigencia calculada: <strong>{dateFrom} → {dateTo}</strong> · {protocolHint}
          </p>
        ) : null}
      </section>

      <section className="panel">
        <h2 style={{ marginTop: 0, fontFamily: 'var(--font-display)' }}>Listado</h2>
        <table className="data">
          <thead>
            <tr>
              <th>Inspector</th>
              <th>Desde</th>
              <th>Hasta</th>
              <th>Días</th>
              <th>Demanda</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: 0 }}>
                  <EmptyState
                    compact
                    title="Sin vacaciones registradas"
                    description="Registrá una vacación arriba para poder proponer trabajos a demanda."
                  />
                </td>
              </tr>
            ) : (
              list.map((v) => (
                <tr
                  key={v.id}
                  onClick={() => setSelectedVacation(v)}
                  style={{
                    cursor: 'pointer',
                    background:
                      selectedVacation?.id === v.id
                        ? 'rgba(15,61,94,0.06)'
                        : undefined,
                  }}
                  aria-selected={selectedVacation?.id === v.id}
                >
                  <td>{v.inspector}</td>
                  <td>{v.fecha_desde}</td>
                  <td>{v.fecha_hasta}</td>
                  <td>{v.cantidad_dias}</td>
                  <td>{v.cantidad_trabajos_demanda}</td>
                  <td>
                    <span className={stateBadgeClass(v.estado)}>{v.estado}</span>
                  </td>
                  <td>
                    {selectedVacation?.id === v.id ? (
                      <span className="badge neutral">Seleccionada</span>
                    ) : (
                      <button
                        type="button"
                        className="btn sm secondary"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedVacation(v);
                        }}
                      >
                        Seleccionar
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <section className="panel">
        <h2 style={{ marginTop: 0, fontFamily: 'var(--font-display)' }}>
          Trabajos a demanda
        </h2>
        {selectedVacation ? (
          <p className="muted" style={{ marginTop: 0 }}>
            Vacación seleccionada: <strong>{selectedVacation.inspector}</strong> ·{' '}
            {selectedVacation.fecha_desde} → {selectedVacation.fecha_hasta} ·{' '}
            {selectedVacation.cantidad_trabajos_demanda} trabajo(s) a asignar
          </p>
        ) : (
          <p className="muted" style={{ marginTop: 0 }}>
            Elegí una vacación en la tabla para proponer sus trabajos a demanda.
          </p>
        )}
        <div className="filters">
          <div className="field" style={{ minWidth: 260 }}>
            <label htmlFor="ver">Versión planificada</label>
            <select
              id="ver"
              value={versionId}
              onChange={(e) => setVersionId(e.target.value)}
            >
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.codigo} v{v.numero_version} · {v.estado}
                </option>
              ))}
            </select>
          </div>
          <button
            className="btn secondary"
            type="button"
            onClick={loadProposals}
            disabled={!selectedVacation}
          >
            Proponer
          </button>
          <button
            className="btn amber"
            type="button"
            onClick={() => setConfirmAssign(true)}
            disabled={!selectedVacation || !proposals?.length}
            title={
              !proposals?.length
                ? 'Ejecutá "Proponer" primero'
                : undefined
            }
          >
            Asignar
          </button>
        </div>

        {proposals === null ? null : proposals.length === 0 ? (
          <EmptyState
            compact
            title="Sin propuestas"
            description="El motor no encontró candidatos para trabajos a demanda con la versión y vacación seleccionadas."
          />
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Móvil</th>
                <th>Turno</th>
                <th>Cobertura actual</th>
                <th>Prioridad turno</th>
              </tr>
            </thead>
            <tbody>
              {proposals.map((p, i) => (
                <tr key={`${p.fecha_operativa}-${p.movil}-${p.turno}-${i}`}>
                  <td>{p.fecha_operativa}</td>
                  <td>Móvil {p.movil}</td>
                  <td>
                    <span
                      className={`badge ${
                        p.turno === 'M'
                          ? 'ok'
                          : p.turno === 'T'
                            ? 'warn'
                            : 'neutral'
                      }`}
                    >
                      {shiftLabel(p.turno)}
                    </span>
                  </td>
                  <td>{p.cantidad_asignada}</td>
                  <td>{p.prioridad_turno}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <ConfirmDialog
        open={confirmAssign}
        title="Asignar trabajos a demanda"
        message={
          selectedVacation
            ? `Se asignarán los ${selectedVacation.cantidad_trabajos_demanda} trabajo(s) a demanda para ${selectedVacation.inspector} sobre la versión elegida.`
            : ''
        }
        confirmLabel="Asignar"
        onCancel={() => setConfirmAssign(false)}
        onConfirm={() => assignDemand()}
      />
    </div>
  );
}
