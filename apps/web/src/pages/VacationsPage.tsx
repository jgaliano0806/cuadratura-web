import { FormEvent, useEffect, useState } from 'react';
import { VACATION_DURATIONS } from '@plataforma/shared';
import { api, ApiError } from '../lib/api';

type Inspector = { id: string; nombre_completo: string };
type Version = { id: string; codigo: string; capa: string; numero_version: number; estado: string };
type Vacation = {
  id: string;
  inspector: string;
  fecha_desde: string;
  fecha_hasta: string;
  cantidad_dias: number;
  cantidad_trabajos_demanda: number;
  estado: string;
};
type Proposal = Record<string, unknown>;

export function VacationsPage() {
  const [inspectors, setInspectors] = useState<Inspector[]>([]);
  const [versions, setVersions] = useState<Version[]>([]);
  const [list, setList] = useState<Vacation[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [inspectorId, setInspectorId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [days, setDays] = useState(14);
  const [reason, setReason] = useState('Vacaciones programadas');
  const [versionId, setVersionId] = useState('');
  const [selectedVacation, setSelectedVacation] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

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
    refresh().catch((e) => setError(e.message));
  }, []);

  async function create(e: FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      await api('/vacations', {
        method: 'POST',
        body: JSON.stringify({
          inspectorId,
          dateFrom,
          days,
          reason,
          layer: 'PLANIFICADA',
          versionId: versionId || undefined,
        }),
      });
      setMessage('Vacación registrada en borrador.');
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error');
    }
  }

  async function loadProposals() {
    if (!selectedVacation || !versionId) return;
    setError('');
    try {
      const data = await api<Proposal[]>(
        `/vacations/${selectedVacation}/demand-work/proposals?version_id=${versionId}`,
      );
      setProposals(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error');
    }
  }

  async function assignDemand() {
    if (!selectedVacation || !versionId) return;
    setError('');
    try {
      await api(`/vacations/${selectedVacation}/demand-work/assign`, {
        method: 'POST',
        body: JSON.stringify({ versionId }),
      });
      setMessage('Trabajos a demanda asignados.');
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Error');
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

      {error ? <div className="error-box">{error}</div> : null}
      {message ? <div className="panel">{message}</div> : null}

      <section className="panel">
        <form className="filters" onSubmit={create}>
          <div className="field" style={{ minWidth: 220 }}>
            <label htmlFor="insp">Inspector</label>
            <select id="insp" value={inspectorId} onChange={(e) => setInspectorId(e.target.value)}>
              {inspectors.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.nombre_completo}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="df">Inicio</label>
            <input id="df" type="date" required value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="days">Días</label>
            <select id="days" value={days} onChange={(e) => setDays(Number(e.target.value))}>
              {VACATION_DURATIONS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ minWidth: 220 }}>
            <label htmlFor="reason">Motivo</label>
            <input id="reason" value={reason} onChange={(e) => setReason(e.target.value)} required />
          </div>
          <button className="btn" type="submit">
            Registrar
          </button>
        </form>
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
            </tr>
          </thead>
          <tbody>
            {list.map((v) => (
              <tr key={v.id} onClick={() => setSelectedVacation(v.id)} style={{ cursor: 'pointer' }}>
                <td>{v.inspector}</td>
                <td>{v.fecha_desde}</td>
                <td>{v.fecha_hasta}</td>
                <td>{v.cantidad_dias}</td>
                <td>{v.cantidad_trabajos_demanda}</td>
                <td>{v.estado}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="panel">
        <h2 style={{ marginTop: 0, fontFamily: 'var(--font-display)' }}>Trabajos a demanda</h2>
        <div className="filters">
          <div className="field" style={{ minWidth: 240 }}>
            <label htmlFor="ver">Versión planificada</label>
            <select id="ver" value={versionId} onChange={(e) => setVersionId(e.target.value)}>
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.codigo} v{v.numero_version} · {v.estado}
                </option>
              ))}
            </select>
          </div>
          <button className="btn secondary" type="button" onClick={loadProposals} disabled={!selectedVacation}>
            Proponer
          </button>
          <button className="btn amber" type="button" onClick={assignDemand} disabled={!selectedVacation}>
            Asignar
          </button>
        </div>
        <pre style={{ overflow: 'auto', fontSize: 12 }}>
          {JSON.stringify(proposals, null, 2)}
        </pre>
      </section>
    </div>
  );
}
