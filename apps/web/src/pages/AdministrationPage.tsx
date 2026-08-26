import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { api, ApiError } from '../lib/api';
import { Modal } from '../components/ui';
import { apellidoYNombre } from '../lib/personLabel';

type Tab =
  | 'inspectores'
  | 'licencias'
  | 'moviles'
  | 'posiciones'
  | 'perfiles'
  | 'usuarios';

type Column = { key: string; label: string; secondary?: string };

type InspectorRow = {
  id: string;
  legajo: string;
  nombres?: string | null;
  apellido?: string | null;
  nombre_completo: string;
  tipo_plantel: string;
  estado: string;
  vigencia_desde?: string | null;
  posicion_codigo?: string | null;
  posicion_etiqueta?: string | null;
};

type PosicionOpt = {
  id: string;
  codigo: string;
  perfil: string;
  turnos: string;
  moviles: string;
  ocupante_id: string | null;
  ocupante: string | null;
};

type LicenciaRow = {
  id: string;
  codigo: string;
  nombre: string;
  activo: boolean;
  orden: number;
  color_fondo?: string | null;
  color_letra?: string | null;
};

type MovilRow = {
  id: string;
  numero: number;
  capacidad_maxima: number;
  estado: string;
  base_operativa_id: string;
  base_nombre: string;
  vigencia_desde?: string | null;
  vigencia_hasta?: string | null;
  horarios_texto?: string;
};

type BaseRow = { id: string; codigo: string; nombre: string };

const COLUMNS: Record<Exclude<Tab, 'inspectores' | 'licencias' | 'moviles'>, Column[]> = {
  posiciones: [
    { key: 'ocupante_vigente', label: 'Inspector' },
    { key: 'codigo', label: 'Código posición' },
    { key: 'tipo', label: 'Tipo' },
    { key: 'perfil', label: 'Perfil' },
    { key: 'grupo_franco', label: 'Grupo franco' },
    { key: 'grupo_vinculado', label: 'Dupla' },
    { key: 'estado', label: 'Estado' },
  ],
  perfiles: [
    { key: 'nombre', label: 'Perfil' },
    { key: 'tipo', label: 'Tipo' },
    { key: 'turnos_texto', label: 'Turnos' },
    { key: 'moviles_texto', label: 'Móviles' },
    { key: 'estado', label: 'Estado' },
  ],
  usuarios: [
    { key: 'nombre_mostrar', label: 'Nombre' },
    { key: 'nombre_usuario', label: 'Usuario' },
    { key: 'roles_texto', label: 'Roles' },
    { key: 'estado', label: 'Estado' },
  ],
};

function mensaje(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return 'Error inesperado';
}

function partesNombre(row: InspectorRow): { apellido: string; nombres: string } {
  const ape = (row.apellido || '').trim();
  const nom = (row.nombres || '').trim();
  if (ape || nom) return { apellido: ape, nombres: nom };
  const raw = (row.nombre_completo || '').trim();
  if (!raw) return { apellido: '', nombres: '' };
  if (raw.includes(',')) {
    const [a, ...rest] = raw.split(',');
    return { apellido: a.trim(), nombres: rest.join(',').trim() };
  }
  const sp = raw.split(/\s+/);
  return { apellido: sp[0] || '', nombres: sp.slice(1).join(' ') };
}

function hoyIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function cellText(row: Record<string, unknown>, col: Column): string {
  const primary = row[col.key];
  if (primary === null || primary === undefined || primary === '') return '—';
  return String(primary);
}

function cellSecondary(row: Record<string, unknown>, col: Column): string | null {
  if (!col.secondary) return null;
  const v = row[col.secondary];
  if (v === null || v === undefined || v === '') return null;
  return String(v);
}

type InspectorForm = {
  id?: string;
  apellido: string;
  nombres: string;
  legajo: string;
  tipo_plantel: 'TITULAR' | 'REEMPLAZANTE';
  fecha_desde: string;
  posicion_id: string;
  posicion_inicial?: string;
};

const FORM_VACIO: InspectorForm = {
  apellido: '',
  nombres: '',
  legajo: '',
  tipo_plantel: 'TITULAR',
  fecha_desde: hoyIso(),
  posicion_id: '',
};

export function AdministrationPage() {
  const [tab, setTab] = useState<Tab>('inspectores');
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [inspectores, setInspectores] = useState<InspectorRow[]>([]);
  const [posiciones, setPosiciones] = useState<PosicionOpt[]>([]);
  const [licencias, setLicencias] = useState<LicenciaRow[]>([]);
  const [moviles, setMoviles] = useState<MovilRow[]>([]);
  const [bases, setBases] = useState<BaseRow[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<InspectorForm | null>(null);
  const [licEdit, setLicEdit] = useState<Partial<LicenciaRow> | null>(null);
  const [movilForm, setMovilForm] = useState<{
    id?: string;
    numero: string;
    base_operativa_id: string;
    capacidad_maxima: string;
    vigencia_desde: string;
    estado: string;
  } | null>(null);

  async function cargarInspectores() {
    const [ins, pos] = await Promise.all([
      api<InspectorRow[]>('/admin/inspectors'),
      api<PosicionOpt[]>('/admin/positions-assignable'),
    ]);
    setInspectores(ins);
    setPosiciones(pos);
  }

  async function cargarLicencias() {
    setLicencias(await api<LicenciaRow[]>('/admin/licencias'));
  }

  async function cargarMoviles() {
    const [m, b] = await Promise.all([
      api<MovilRow[]>('/admin/mobiles'),
      api<BaseRow[]>('/admin/bases'),
    ]);
    setMoviles(m);
    setBases(b);
  }

  useEffect(() => {
    setBusy(true);
    setError('');
    const run = async () => {
      if (tab === 'inspectores') {
        await cargarInspectores();
        return;
      }
      if (tab === 'licencias') {
        await cargarLicencias();
        return;
      }
      if (tab === 'moviles') {
        await cargarMoviles();
        return;
      }
      const path: Record<Exclude<Tab, 'inspectores' | 'licencias' | 'moviles'>, string> = {
        posiciones: '/admin/positions',
        perfiles: '/admin/profiles',
        usuarios: '/admin/users',
      };
      setRows(await api<Record<string, unknown>[]>(path[tab]));
    };
    run()
      .catch((e) => {
        setRows([]);
        setInspectores([]);
        setLicencias([]);
        setError(mensaje(e));
      })
      .finally(() => setBusy(false));
  }, [tab]);

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'inspectores', label: 'Inspectores' },
    { id: 'licencias', label: 'Licencias' },
    { id: 'moviles', label: 'Móviles' },
    { id: 'posiciones', label: 'Posiciones' },
    { id: 'perfiles', label: 'Perfiles' },
    { id: 'usuarios', label: 'Usuarios' },
  ];

  const columns =
    tab === 'inspectores' || tab === 'licencias' || tab === 'moviles' ? [] : COLUMNS[tab];

  async function guardarInspector(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    if (!form.posicion_id) {
      setError('Elegí la secuencia (posición). Sin eso no se puede inferir.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const body: Record<string, unknown> = {
        nombres: form.nombres.trim(),
        apellido: form.apellido.trim(),
        legajo: form.legajo.trim(),
        tipo_plantel: form.tipo_plantel,
      };
      const cambiaSecuencia = !form.id || form.posicion_id !== form.posicion_inicial;
      if (cambiaSecuencia) {
        body.fecha_desde = form.fecha_desde;
        body.posicion_id = form.posicion_id;
      }
      if (form.id) {
        await api(`/admin/inspectors/${form.id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      } else {
        await api('/admin/inspectors', {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }
      setForm(null);
      await cargarInspectores();
    } catch (err) {
      setError(mensaje(err));
    } finally {
      setBusy(false);
    }
  }

  async function bajaInspector(row: InspectorRow) {
    if (!confirm(`¿Dar de baja a ${row.nombre_completo}? Deja de ocupar la secuencia.`)) return;
    setBusy(true);
    setError('');
    try {
      await api(`/admin/inspectors/${row.id}`, { method: 'DELETE' });
      await cargarInspectores();
    } catch (err) {
      setError(mensaje(err));
    } finally {
      setBusy(false);
    }
  }

  async function guardarLicencia(e: FormEvent) {
    e.preventDefault();
    if (!licEdit?.nombre?.trim() || !licEdit.codigo?.trim()) return;
    setBusy(true);
    setError('');
    try {
      const body = {
        nombre: licEdit.nombre.trim(),
        codigo: licEdit.codigo.trim().toUpperCase(),
        color_fondo: licEdit.color_fondo || null,
        color_letra: licEdit.color_letra || null,
      };
      if (licEdit.id) {
        await api(`/admin/licencias/${licEdit.id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      } else {
        await api('/admin/licencias', { method: 'POST', body: JSON.stringify(body) });
      }
      setLicEdit(null);
      await cargarLicencias();
    } catch (err) {
      setError(mensaje(err));
    } finally {
      setBusy(false);
    }
  }

  async function toggleLicencia(item: LicenciaRow) {
    setBusy(true);
    setError('');
    try {
      await api(`/admin/licencias/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ activo: !item.activo }),
      });
      await cargarLicencias();
    } catch (err) {
      setError(mensaje(err));
    } finally {
      setBusy(false);
    }
  }

  async function eliminarLicencia(item: LicenciaRow) {
    if (!confirm(`¿Eliminar ${item.codigo}? Si ya se usó en Real, desactivala.`)) return;
    setBusy(true);
    setError('');
    try {
      await api(`/admin/licencias/${item.id}`, { method: 'DELETE' });
      await cargarLicencias();
    } catch (err) {
      setError(mensaje(err));
    } finally {
      setBusy(false);
    }
  }

  async function guardarMovil(e: FormEvent) {
    e.preventDefault();
    if (!movilForm) return;
    setBusy(true);
    setError('');
    try {
      if (movilForm.id) {
        await api(`/admin/mobiles/${movilForm.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            base_operativa_id: movilForm.base_operativa_id,
            capacidad_maxima: Number(movilForm.capacidad_maxima),
            estado: movilForm.estado,
          }),
        });
      } else {
        await api('/admin/mobiles', {
          method: 'POST',
          body: JSON.stringify({
            numero: Number(movilForm.numero),
            base_operativa_id: movilForm.base_operativa_id,
            capacidad_maxima: Number(movilForm.capacidad_maxima),
            vigencia_desde: movilForm.vigencia_desde,
          }),
        });
      }
      setMovilForm(null);
      await cargarMoviles();
    } catch (err) {
      setError(mensaje(err));
    } finally {
      setBusy(false);
    }
  }

  async function bajaMovil(row: MovilRow) {
    if (!confirm(`¿Dar de baja el móvil ${row.numero}? Deja de usarse en la inferencia.`)) return;
    setBusy(true);
    setError('');
    try {
      await api(`/admin/mobiles/${row.id}`, { method: 'DELETE' });
      await cargarMoviles();
    } catch (err) {
      setError(mensaje(err));
    } finally {
      setBusy(false);
    }
  }

  const posicionElegida = useMemo(
    () => posiciones.find((p) => p.id === form?.posicion_id) ?? null,
    [posiciones, form?.posicion_id],
  );

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <h1>Administración</h1>
          <p>Inspectores, secuencias, licencias y catálogos.</p>
        </div>
      </header>

      {error ? <div className="error-box">{error}</div> : null}

      <nav className="admin-tabs" aria-label="Secciones de administración">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={tab === t.id ? 'active' : undefined}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'inspectores' ? (
        <section className="panel">
          <div className="admin-toolbar">
            <p className="admin-hint">
              La secuencia (turno y móvil) es de la posición. Si entra a mitad de mes, poné la
              fecha de incorporación: desde ese día ocupa esa posición y hereda el ciclo. Quien
              estaba deja de ocuparla el día anterior. Después volvé a generar el ciclo.
            </p>
            <button
              type="button"
              className="btn primary sm"
              onClick={() => setForm({ ...FORM_VACIO, fecha_desde: hoyIso() })}
            >
              Incorporar inspector
            </button>
          </div>
          {busy ? <p className="muted">Cargando…</p> : null}
          {!busy && inspectores.length === 0 ? (
            <p className="muted">Sin inspectores.</p>
          ) : (
            <div className="xlsx-scroll">
              <table className="data">
                <thead>
                  <tr>
                    <th>Legajo</th>
                    <th>Apellido y Nombre</th>
                    <th>Secuencia</th>
                    <th>Desde</th>
                    <th>Estado</th>
                    <th className="admin-row-actions">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {inspectores.map((row) => (
                    <tr key={row.id}>
                      <td>{row.legajo}</td>
                      <td>
                        <span className="cell-primary">{apellidoYNombre(row)}</span>
                      </td>
                      <td>{row.posicion_etiqueta || row.posicion_codigo || 'Sin secuencia'}</td>
                      <td>{row.vigencia_desde || '—'}</td>
                      <td>{row.estado}</td>
                      <td className="admin-row-actions">
                        <button
                          type="button"
                          className="btn secondary sm"
                          onClick={() => {
                            const n = partesNombre(row);
                            setForm({
                              id: row.id,
                              apellido: n.apellido,
                              nombres: n.nombres,
                              legajo: row.legajo,
                              tipo_plantel:
                                row.tipo_plantel === 'REEMPLAZANTE' ? 'REEMPLAZANTE' : 'TITULAR',
                              fecha_desde: hoyIso(),
                              posicion_id:
                                posiciones.find((p) => p.ocupante_id === row.id)?.id || '',
                              posicion_inicial:
                                posiciones.find((p) => p.ocupante_id === row.id)?.id || '',
                            });
                          }}
                        >
                          Modificar
                        </button>
                        {row.estado === 'ACTIVO' ? (
                          <button
                            type="button"
                            className="btn ghost sm"
                            onClick={() => void bajaInspector(row)}
                          >
                            Dar de baja
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {tab === 'moviles' ? (
        <section className="panel">
          <div className="admin-toolbar">
            <p className="admin-hint">
              Alta y baja de móviles. Un móvil nuevo queda disponible para asignarlo en Real.
              Si entra a mitad de mes, poné la fecha de vigencia. Dar de baja lo saca de la
              inferencia.
            </p>
            <button
              type="button"
              className="btn primary sm"
              onClick={() =>
                setMovilForm({
                  numero: '',
                  base_operativa_id: bases[0]?.id ?? '',
                  capacidad_maxima: '2',
                  vigencia_desde: hoyIso(),
                  estado: 'ACTIVO',
                })
              }
            >
              Incorporar móvil
            </button>
          </div>
          {busy ? <p className="muted">Cargando…</p> : null}
          <div className="xlsx-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th>Móvil</th>
                  <th>Base</th>
                  <th>Capacidad</th>
                  <th>Horarios</th>
                  <th>Desde</th>
                  <th>Estado</th>
                  <th className="admin-row-actions">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {moviles.map((row) => (
                  <tr key={row.id} className={row.estado === 'ACTIVO' ? undefined : 'is-off'}>
                    <td>{row.numero}</td>
                    <td>{row.base_nombre}</td>
                    <td>{row.capacidad_maxima}</td>
                    <td>{row.horarios_texto || '—'}</td>
                    <td>{row.vigencia_desde || '—'}</td>
                    <td>{row.estado}</td>
                    <td className="admin-row-actions">
                      <button
                        type="button"
                        className="btn secondary sm"
                        onClick={() =>
                          setMovilForm({
                            id: row.id,
                            numero: String(row.numero),
                            base_operativa_id: row.base_operativa_id,
                            capacidad_maxima: String(row.capacidad_maxima),
                            vigencia_desde: row.vigencia_desde || hoyIso(),
                            estado: row.estado,
                          })
                        }
                      >
                        Modificar
                      </button>
                      {row.estado === 'ACTIVO' ? (
                        <button
                          type="button"
                          className="btn ghost sm"
                          onClick={() => void bajaMovil(row)}
                        >
                          Dar de baja
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn ghost sm"
                          onClick={() =>
                            void api(`/admin/mobiles/${row.id}`, {
                              method: 'PATCH',
                              body: JSON.stringify({ estado: 'ACTIVO' }),
                            }).then(() => cargarMoviles())
                          }
                        >
                          Reactivar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {tab === 'licencias' ? (
        <section className="panel">
          <div className="admin-toolbar">
            <p className="admin-hint">
              Código y nombre del tipo de licencia. El color se usa en la cuadratura Real.
            </p>
            <button
              type="button"
              className="btn primary sm"
              onClick={() =>
                setLicEdit({
                  codigo: '',
                  nombre: '',
                  activo: true,
                  color_fondo: '#3d5348',
                  color_letra: '#eaf3ec',
                })
              }
            >
              Agregar licencia
            </button>
          </div>
          {busy ? <p className="muted">Cargando…</p> : null}
          <div className="xlsx-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Nombre</th>
                  <th>Color</th>
                  <th>Estado</th>
                  <th className="admin-row-actions">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {licencias.map((item) => (
                  <tr key={item.id} className={item.activo ? undefined : 'is-off'}>
                    <td>
                      <code>{item.codigo}</code>
                    </td>
                    <td>
                      <span
                        className="lic-chip"
                        style={
                          item.color_fondo || item.color_letra
                            ? {
                                background: item.color_fondo || undefined,
                                color: item.color_letra || undefined,
                              }
                            : undefined
                        }
                      >
                        {item.nombre}
                      </span>
                    </td>
                    <td>
                      {item.color_fondo || item.color_letra ? (
                        <span className="lic-color-pair">
                          <i
                            className="lic-dot"
                            style={{ background: item.color_fondo || 'transparent' }}
                            title="Fondo"
                          />
                          <i
                            className="lic-dot"
                            style={{ background: item.color_letra || 'transparent' }}
                            title="Letra"
                          />
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>{item.activo ? 'Activo' : 'Inactivo'}</td>
                    <td className="admin-row-actions">
                      <button
                        type="button"
                        className="btn secondary sm"
                        onClick={() => setLicEdit(item)}
                      >
                        Modificar
                      </button>
                      <button
                        type="button"
                        className="btn ghost sm"
                        onClick={() => void toggleLicencia(item)}
                      >
                        {item.activo ? 'Desactivar' : 'Activar'}
                      </button>
                      <button
                        type="button"
                        className="btn ghost sm"
                        onClick={() => void eliminarLicencia(item)}
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {tab !== 'inspectores' &&
      tab !== 'licencias' &&
      tab !== 'moviles' ? (
        <section className="panel">
          {busy ? <p className="muted">Cargando…</p> : null}
          {!busy && rows.length === 0 ? (
            <p className="muted">Sin registros para esta sección.</p>
          ) : null}
          {!busy && rows.length > 0 ? (
            <div className="xlsx-scroll">
              <table className="data">
                <thead>
                  <tr>
                    {columns.map((c) => (
                      <th key={c.key}>{c.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => (
                    <tr key={String(row.id ?? row.codigo ?? idx)}>
                      {columns.map((col) => {
                        const secondary = cellSecondary(row, col);
                        return (
                          <td key={col.key}>
                            <span className="cell-primary">{cellText(row, col)}</span>
                            {secondary ? (
                              <div className="muted cell-secondary">{secondary}</div>
                            ) : null}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      ) : null}

      <Modal
        open={Boolean(form)}
        onClose={() => setForm(null)}
        title={form?.id ? 'Modificar inspector' : 'Incorporar inspector'}
        description="No es peajista: es un inspector con una secuencia (posición) para inferir el ciclo."
        size="md"
        footer={
          <>
            <button type="button" className="btn secondary" onClick={() => setForm(null)}>
              Cancelar
            </button>
            <button type="submit" form="insp-form" className="btn primary" disabled={busy}>
              Guardar
            </button>
          </>
        }
      >
        {form ? (
          <form id="insp-form" className="admin-form" onSubmit={guardarInspector}>
            <div className="field">
              <label htmlFor="insp-apellido">Apellido</label>
              <input
                id="insp-apellido"
                value={form.apellido}
                onChange={(e) => setForm({ ...form, apellido: e.target.value })}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="insp-nombres">Nombre</label>
              <input
                id="insp-nombres"
                value={form.nombres}
                onChange={(e) => setForm({ ...form, nombres: e.target.value })}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="insp-legajo">Legajo</label>
              <input
                id="insp-legajo"
                value={form.legajo}
                onChange={(e) => setForm({ ...form, legajo: e.target.value })}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="insp-plantel">Plantel</label>
              <select
                id="insp-plantel"
                value={form.tipo_plantel}
                onChange={(e) =>
                  setForm({
                    ...form,
                    tipo_plantel: e.target.value as InspectorForm['tipo_plantel'],
                  })
                }
              >
                <option value="TITULAR">Titular</option>
                <option value="REEMPLAZANTE">Reemplazante</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="insp-desde">Fecha de incorporación</label>
              <input
                id="insp-desde"
                type="date"
                value={form.fecha_desde}
                onChange={(e) => setForm({ ...form, fecha_desde: e.target.value })}
                required
              />
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label htmlFor="insp-pos">Secuencia (posición)</label>
              <select
                id="insp-pos"
                value={form.posicion_id}
                onChange={(e) => setForm({ ...form, posicion_id: e.target.value })}
                required
              >
                <option value="">Elegí…</option>
                {posiciones.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.codigo}
                    {p.ocupante ? ` · ocupa ${p.ocupante}` : ' · vacante'}
                    {` · ${p.moviles} / ${p.turnos}`}
                  </option>
                ))}
              </select>
              {posicionElegida?.ocupante && posicionElegida.ocupante_id !== form.id ? (
                <p className="hint">
                  {posicionElegida.ocupante} deja esa secuencia el día anterior a la
                  incorporación.
                </p>
              ) : (
                <p className="hint">
                  A mitad de mes: el ciclo de esa posición sigue; el inspector nuevo entra desde
                  la fecha. Inferí de nuevo para verlo en Ideal.
                </p>
              )}
            </div>
          </form>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(licEdit)}
        onClose={() => setLicEdit(null)}
        title={licEdit?.id ? 'Modificar licencia' : 'Agregar licencia'}
        size="sm"
        footer={
          <>
            <button type="button" className="btn secondary" onClick={() => setLicEdit(null)}>
              Cancelar
            </button>
            <button type="submit" form="lic-form" className="btn primary" disabled={busy}>
              Guardar
            </button>
          </>
        }
      >
        {licEdit ? (
          <form id="lic-form" className="stack" onSubmit={guardarLicencia}>
            <div className="field">
              <label htmlFor="lic-codigo">Código</label>
              <input
                id="lic-codigo"
                value={licEdit.codigo ?? ''}
                onChange={(e) =>
                  setLicEdit({ ...licEdit, codigo: e.target.value.toUpperCase() })
                }
                placeholder="CASAMIENTO"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="lic-nombre">Nombre</label>
              <input
                id="lic-nombre"
                value={licEdit.nombre ?? ''}
                onChange={(e) => setLicEdit({ ...licEdit, nombre: e.target.value })}
                placeholder="Licencia por casamiento"
                required
              />
            </div>
            <div className="admin-color-row">
              <div className="field">
                <label htmlFor="lic-fondo">Color de fondo</label>
                <div className="admin-color-ctrl">
                  <input
                    id="lic-fondo"
                    type="color"
                    value={licEdit.color_fondo || '#3d5348'}
                    onChange={(e) => setLicEdit({ ...licEdit, color_fondo: e.target.value })}
                  />
                  <code>{licEdit.color_fondo || '—'}</code>
                </div>
              </div>
              <div className="field">
                <label htmlFor="lic-letra">Color de letra</label>
                <div className="admin-color-ctrl">
                  <input
                    id="lic-letra"
                    type="color"
                    value={licEdit.color_letra || '#eaf3ec'}
                    onChange={(e) => setLicEdit({ ...licEdit, color_letra: e.target.value })}
                  />
                  <code>{licEdit.color_letra || '—'}</code>
                </div>
              </div>
            </div>
            <p className="admin-hint" style={{ margin: 0 }}>
              Vista previa:{' '}
              <span
                className="lic-chip"
                style={{
                  background: licEdit.color_fondo || undefined,
                  color: licEdit.color_letra || undefined,
                }}
              >
                {licEdit.nombre || licEdit.codigo || 'Licencia'}
              </span>
            </p>
          </form>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(movilForm)}
        onClose={() => setMovilForm(null)}
        title={movilForm?.id ? 'Modificar móvil' : 'Incorporar móvil'}
        description="Número, base y fecha de vigencia. Los horarios se copian del móvil 1."
        size="sm"
        footer={
          <>
            <button type="button" className="btn secondary" onClick={() => setMovilForm(null)}>
              Cancelar
            </button>
            <button type="submit" form="movil-form" className="btn primary" disabled={busy}>
              Guardar
            </button>
          </>
        }
      >
        {movilForm ? (
          <form id="movil-form" className="stack" onSubmit={guardarMovil}>
            <div className="field">
              <label htmlFor="mov-num">Número</label>
              <input
                id="mov-num"
                type="number"
                min={1}
                max={99}
                value={movilForm.numero}
                onChange={(e) => setMovilForm({ ...movilForm, numero: e.target.value })}
                disabled={Boolean(movilForm.id)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="mov-base">Base</label>
              <select
                id="mov-base"
                value={movilForm.base_operativa_id}
                onChange={(e) =>
                  setMovilForm({ ...movilForm, base_operativa_id: e.target.value })
                }
                required
              >
                <option value="">Elegí…</option>
                {bases.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="mov-cap">Capacidad</label>
              <select
                id="mov-cap"
                value={movilForm.capacidad_maxima}
                onChange={(e) =>
                  setMovilForm({ ...movilForm, capacidad_maxima: e.target.value })
                }
              >
                <option value="1">1 inspector</option>
                <option value="2">2 inspectores</option>
              </select>
            </div>
            {movilForm.id ? (
              <div className="field">
                <label htmlFor="mov-est">Estado</label>
                <select
                  id="mov-est"
                  value={movilForm.estado}
                  onChange={(e) => setMovilForm({ ...movilForm, estado: e.target.value })}
                >
                  <option value="ACTIVO">Activo</option>
                  <option value="MANTENIMIENTO">Mantenimiento</option>
                  <option value="FUERA_SERVICIO">Fuera de servicio</option>
                </select>
              </div>
            ) : (
              <div className="field">
                <label htmlFor="mov-desde">Vigente desde</label>
                <input
                  id="mov-desde"
                  type="date"
                  value={movilForm.vigencia_desde}
                  onChange={(e) =>
                    setMovilForm({ ...movilForm, vigencia_desde: e.target.value })
                  }
                  required
                />
              </div>
            )}
          </form>
        ) : null}
      </Modal>
    </div>
  );
}
