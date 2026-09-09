import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { FilterPicker, Modal, type SearchSelectOption } from '../components/ui';
import { AppearancePanel } from '../components/AppearancePanel';
import { apellidoYNombre } from '../lib/personLabel';
import { downloadCsv } from '../lib/csv';
import { isoToDmy } from '../lib/dateRange';
import {
  esSeccionPeaje,
  etiquetaRolSeccion,
  etiquetaSeccion,
  parseAmbito,
  parsePlantel,
  plantelDeSeccion,
  plantelPorDefecto,
  PLANTEL_AMBITO,
  PLANTELES,
  seccionDePlantel,
  SECCIONES_SV_SORTED,
  type AmbitoId,
  type PlantelId,
  type SeccionSv,
} from '../lib/plantel';
import { boxIdDeCodigo, colorValido, resolveCodeColors } from '../lib/scheduleUtils';
import { useBoxTheme } from '../lib/boxTheme';
import { useAuth } from '../lib/auth';
import {
  PERMISSION_CODES,
  PERMISSION_GROUPS,
  ROLE_CODES,
  ROLE_META,
  ROLE_TIPO_ORDEN,
  defaultsDeTipo,
  tipoPrincipal,
  veSeccion,
  type PermissionCode,
  type RoleCode,
} from '@plataforma/shared';

type Tab =
  | 'inspectores'
  | 'licencias'
  | 'motivos'
  | 'moviles'
  | 'posiciones'
  | 'perfiles'
  | 'usuarios'
  | 'registro'
  | 'apariencia';

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
  seccion?: string | null;
};

type HistorialFila = {
  origen: string;
  seccion: string;
  fecha_desde: string;
  fecha_hasta: string | null;
  posicion_codigo: string | null;
  posicion_etiqueta: string | null;
  motivo: string;
};

type PosicionOpt = {
  id: string;
  codigo: string;
  tipo?: string | null;
  perfil_id?: string | null;
  perfil: string;
  turnos: string;
  moviles: string;
  ocupante_id: string | null;
  ocupante: string | null;
};

function claveGrupoPosicion(p: PosicionOpt): string {
  if (p.tipo === 'MOVIL4' || /^M4-/i.test(p.codigo)) return 'MOVIL4';
  if (p.tipo === 'MOVIL6' || /^M6-/i.test(p.codigo)) return 'MOVIL6';
  if (p.tipo === 'MOVIL7' || /^M7-/i.test(p.codigo)) return 'MOVIL7';
  if (p.tipo === 'VINCULADA') return 'VINCULADA';
  return 'GENERAL';
}

function nombreGrupoClave(clave: string): string {
  if (clave === 'MOVIL4') return 'Móvil 4';
  if (clave === 'MOVIL6') return 'Móvil 6';
  if (clave === 'MOVIL7') return 'Móvil 7';
  if (clave === 'VINCULADA') return 'Dupla';
  return 'Rotación de móviles';
}

function idSecuencia(p: PosicionOpt): string {
  return p.perfil_id || `${claveGrupoPosicion(p)}|${p.moviles}|${p.turnos}`;
}

function etiquetaSecuencia(p: PosicionOpt): string {
  const ciclo = [p.moviles, p.turnos].filter((x) => x && x !== '—').join(' / ');
  const clave = claveGrupoPosicion(p);
  if (clave === 'GENERAL') return ciclo || 'Rotación de móviles';
  const nombre = nombreGrupoClave(clave);
  return ciclo ? `${nombre} · ${ciclo}` : nombre;
}

function etiquetaPlaza(p: PosicionOpt, personaId?: string | null): string {
  if (!p.ocupante) return `${p.codigo} · libre`;
  if (personaId && p.ocupante_id === personaId) return `${p.codigo} · esta persona`;
  return `${p.codigo} · ocupada`;
}

type LicenciaRow = {
  id: string;
  codigo: string;
  codigo_sap?: string | null;
  nombre: string;
  horario?: string | null;
  ambito?: string;
  tipo?: string;
  activo: boolean;
  orden: number;
  color_fondo?: string | null;
  color_letra?: string | null;
};

type RegistroFila = {
  id: string;
  ocurrido_en: string;
  usuario: string;
  detalle: string;
  entidad: string;
  accion: string;
};

type MotivoRow = {
  id: string;
  nombre: string;
  activo: boolean;
  orden: number;
};

type RolCat = { codigo: string; nombre: string; descripcion?: string | null; permisos?: string[] };

type UserRow = {
  id: string;
  legajo: string | null;
  apellido: string | null;
  nombres: string | null;
  nombre_mostrar: string;
  nombre_usuario: string;
  email: string | null;
  estado: string;
  secciones_todas: boolean;
  roles: string[];
  roles_texto: string;
  permisos: string[];
  secciones: string[];
};

type UserForm = {
  id?: string;
  nombre_usuario: string;
  nombre: string;
  email: string;
  legajo: string;
  tipo: RoleCode;
  permisos: string[];
  secciones: string[];
  secciones_todas: boolean;
  estado: 'ACTIVO' | 'INACTIVO';
};

const USER_VACIO: UserForm = {
  nombre_usuario: '',
  nombre: '',
  email: '',
  legajo: '',
  tipo: ROLE_CODES.CONSULTA,
  permisos: defaultsDeTipo(ROLE_CODES.CONSULTA),
  secciones: [],
  secciones_todas: false,
  estado: 'ACTIVO',
};

function defaultsRol(cat: RolCat[], codigo: string): string[] {
  return cat.find((r) => r.codigo === codigo)?.permisos?.length
    ? [...(cat.find((r) => r.codigo === codigo)?.permisos ?? [])]
    : defaultsDeTipo(codigo);
}

type ClaveUnaVez = {
  quien: string;
  clave: string;
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

const COLUMNS: Record<
  Exclude<Tab, 'inspectores' | 'licencias' | 'motivos' | 'moviles' | 'apariencia'>,
  Column[]
> = {
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

function normalizarTexto(s: string) {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
}

function partirNombre(raw: string): { apellido: string; nombres: string } {
  const t = raw.trim();
  if (!t) return { apellido: '', nombres: '' };
  if (t.includes(',')) {
    const [a, ...rest] = t.split(',');
    return { apellido: a.trim(), nombres: rest.join(',').trim() || a.trim() };
  }
  const sp = t.split(/\s+/);
  if (sp.length === 1) return { apellido: sp[0], nombres: sp[0] };
  return { apellido: sp[0], nombres: sp.slice(1).join(' ') };
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
  nombre: string;
  legajo: string;
  seccion: SeccionSv;
  tipo_plantel: 'TITULAR' | 'REEMPLAZANTE';
  fecha_desde: string;
  posicion_id: string;
  posicion_inicial?: string;
  secuencia_id: string;
  nueva_moviles: number[];
  nueva_turnos: Array<'M' | 'N' | 'T'>;
};

const FORM_VACIO: InspectorForm = {
  nombre: '',
  legajo: '',
  seccion: 'MOVILES',
  tipo_plantel: 'TITULAR',
  fecha_desde: hoyIso(),
  posicion_id: '',
  secuencia_id: '',
  nueva_moviles: [],
  nueva_turnos: [],
};

const TURNOS_SEQ: Array<'M' | 'N' | 'T'> = ['M', 'N', 'T'];

export function AdministrationPage() {
  const [params, setParams] = useSearchParams();
  const { user, hasPermission } = useAuth();
  const alcance = {
    seccionesTodas: user?.seccionesTodas ?? true,
    secciones: user?.secciones ?? [],
  };
  const seccionesUsuario = SECCIONES_SV_SORTED.filter((s) => veSeccion(alcance, s.id));
  const { patchBox } = useBoxTheme();
  const ambitoUi = parseAmbito(params.get('ambito'), params.get('plantel'));
  const plantel = parsePlantel(params.get('plantel'), ambitoUi);
  const plantelLabel = PLANTELES.find((p) => p.id === plantel)?.label ?? 'Inspectores';
  const ambito = PLANTEL_AMBITO[plantel];
  const [tab, setTab] = useState<Tab>('inspectores');
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [inspectores, setInspectores] = useState<InspectorRow[]>([]);
  const [posiciones, setPosiciones] = useState<PosicionOpt[]>([]);
  const [licencias, setLicencias] = useState<LicenciaRow[]>([]);
  const [motivos, setMotivos] = useState<MotivoRow[]>([]);
  const [usuarios, setUsuarios] = useState<UserRow[]>([]);
  const [registro, setRegistro] = useState<RegistroFila[]>([]);
  const [rolesCat, setRolesCat] = useState<RolCat[]>([]);
  const [userForm, setUserForm] = useState<UserForm | null>(null);
  const [claveUnaVez, setClaveUnaVez] = useState<ClaveUnaVez | null>(null);
  const [userFiltro, setUserFiltro] = useState('');
  const [moviles, setMoviles] = useState<MovilRow[]>([]);
  const [bases, setBases] = useState<BaseRow[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<InspectorForm | null>(null);
  const [historial, setHistorial] = useState<{
    nombre: string;
    filas: HistorialFila[];
  } | null>(null);
  const [licEdit, setLicEdit] = useState<Partial<LicenciaRow> | null>(null);
  const [motEdit, setMotEdit] = useState<Partial<MotivoRow> | null>(null);
  const [filtroTexto, setFiltroTexto] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<string[]>([]);
  const [filtroCondicion, setFiltroCondicion] = useState<string[]>([]);
  const [filtroSeccion, setFiltroSeccion] = useState<string[]>([]);
  const [filtroSecuencia, setFiltroSecuencia] = useState<string[]>([]);
  // filtros tab licencias
  const [licFiltroTexto, setLicFiltroTexto] = useState('');
  const [licFiltroTipo, setLicFiltroTipo] = useState<string[]>([]);
  const [licFiltroEstado, setLicFiltroEstado] = useState<string[]>([]);
  const [motFiltroTexto, setMotFiltroTexto] = useState('');
  const [motFiltroEstado, setMotFiltroEstado] = useState<string[]>([]);
  const [movilForm, setMovilForm] = useState<{
    id?: string;
    numero: string;
    base_operativa_id: string;
    capacidad_maxima: string;
    vigencia_desde: string;
    estado: string;
  } | null>(null);

  function setAmbito(id: AmbitoId) {
    setParams(
      (prev) => {
        const n = new URLSearchParams(prev);
        n.set('ambito', id);
        n.set('plantel', plantelPorDefecto(id));
        return n;
      },
      { replace: true },
    );
  }

  function setPlantel(id: PlantelId) {
    setParams(
      (prev) => {
        const n = new URLSearchParams(prev);
        n.set('plantel', id);
        n.set('ambito', ambitoUi);
        return n;
      },
      { replace: true },
    );
  }

  const seccionVista = seccionDePlantel(plantel);
  const personasVista = inspectores.filter((i) => veSeccion(alcance, i.seccion));
  const personasFiltradas = useMemo(() => {
    const q = normalizarTexto(filtroTexto.trim());
    const est = new Set(filtroEstado);
    const cond = new Set(filtroCondicion);
    const sec = new Set(filtroSeccion);
    const seq = new Set(filtroSecuencia);
    return personasVista.filter((row) => {
      if (est.size && !est.has(row.estado)) return false;
      const tipo = row.tipo_plantel === 'PEAJISTA' ? 'PEAJISTA' : row.tipo_plantel === 'REEMPLAZANTE' ? 'REEMPLAZANTE' : 'TITULAR';
      if (cond.size && !cond.has(tipo)) return false;
      const rowSeccion = row.seccion || 'MOVILES';
      if (sec.size && !sec.has(rowSeccion)) return false;
      const secId = row.posicion_codigo || 'sin';
      if (seq.size && !seq.has(secId)) return false;
      if (!q) return true;
      const blob = normalizarTexto(
        [row.legajo, apellidoYNombre(row), row.posicion_etiqueta, row.posicion_codigo].join(' '),
      );
      return blob.includes(q);
    });
  }, [personasVista, filtroTexto, filtroEstado, filtroCondicion, filtroSeccion, filtroSecuencia]);
  const codigosVista = useMemo(() => {
    const q = normalizarTexto(licFiltroTexto.trim());
    const tipos = new Set(licFiltroTipo);
    const estados = new Set(licFiltroEstado);
    const unicos = new Map<string, LicenciaRow>();
    for (const l of licencias) {
      const key = l.codigo.trim().toUpperCase();
      const prev = unicos.get(key);
      if (!prev || (prev.ambito !== 'SEGURIDAD_VIAL' && l.ambito === 'SEGURIDAD_VIAL')) {
        unicos.set(key, l);
      }
    }
    return [...unicos.values()]
      .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0) || a.codigo.localeCompare(b.codigo, 'es'))
      .filter((l) => {
      if (tipos.size && !tipos.has(l.tipo ?? 'AUSENCIA')) return false;
      if (estados.size) {
        const est = l.activo ? 'ACTIVO' : 'INACTIVO';
        if (!estados.has(est)) return false;
      }
      if (!q) return true;
      const blob = normalizarTexto(
        [l.codigo, l.codigo_sap, l.nombre, l.horario].join(' '),
      );
      return blob.includes(q);
    });
  }, [licencias, licFiltroTexto, licFiltroTipo, licFiltroEstado]);

  const motivosVista = useMemo(() => {
    const q = normalizarTexto(motFiltroTexto);
    const estados = new Set(motFiltroEstado);
    return motivos.filter((m) => {
      if (estados.size) {
        const est = m.activo ? 'ACTIVO' : 'INACTIVO';
        if (!estados.has(est)) return false;
      }
      if (!q) return true;
      return normalizarTexto(m.nombre).includes(q);
    });
  }, [motivos, motFiltroTexto, motFiltroEstado]);

  async function cargarInspectores() {
    const [ins, pos] = await Promise.all([
      api<InspectorRow[]>('/admin/inspectors'),
      api<PosicionOpt[]>('/admin/positions-assignable'),
    ]);
    setInspectores(ins);
    setPosiciones(pos);
    if (!moviles.length) {
      api<MovilRow[]>('/admin/mobiles')
        .then(setMoviles)
        .catch(() => undefined);
    }
  }

  async function cargarLicencias() {
    setLicencias(await api<LicenciaRow[]>('/admin/licencias'));
  }

  async function cargarMotivos() {
    setMotivos(await api<MotivoRow[]>('/admin/timer-motivos'));
  }

  async function cargarMoviles() {
    const [m, b] = await Promise.all([
      api<MovilRow[]>('/admin/mobiles'),
      api<BaseRow[]>('/admin/bases'),
    ]);
    setMoviles(m);
    setBases(b);
  }

  async function cargarUsuarios() {
    const [lista, roles] = await Promise.all([
      api<UserRow[]>('/admin/users'),
      api<RolCat[]>('/admin/roles'),
    ]);
    setUsuarios(lista);
    setRolesCat(roles);
  }

  async function cargarRegistro() {
    setRegistro(await api<RegistroFila[]>('/audit?limit=200'));
  }

  function abrirUsuario(row?: UserRow) {
    if (!row) {
      setUserForm({ ...USER_VACIO });
      return;
    }
    setUserForm({
      id: row.id,
      nombre_usuario: row.nombre_usuario,
      nombre: apellidoYNombre(row) || row.nombre_mostrar,
      email: row.email || '',
      legajo: row.legajo || '',
      tipo: tipoPrincipal(row.roles ?? []),
      permisos: row.permisos?.length
        ? row.permisos
        : defaultsDeTipo(tipoPrincipal(row.roles ?? [])),
      secciones: row.secciones ?? [],
      secciones_todas: row.secciones_todas,
      estado: row.estado === 'INACTIVO' ? 'INACTIVO' : 'ACTIVO',
    });
  }

  async function guardarUsuario(e: FormEvent) {
    e.preventDefault();
    if (!userForm) return;
    const partes = partirNombre(userForm.nombre);
    if (!partes.apellido || !partes.nombres) {
      setError('Escribí apellido y nombre.');
      return;
    }
    if (!userForm.email.trim()) {
      setError('El email es obligatorio: con eso se ingresa.');
      return;
    }
    if (!userForm.permisos.length) {
      setError('Asigná al menos un permiso.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const email = userForm.email.trim();
      const body: Record<string, unknown> = {
        nombre_usuario: userForm.nombre_usuario.trim() || email,
        apellido: partes.apellido,
        nombres: partes.nombres,
        email,
        legajo: userForm.legajo.trim() || null,
        roles: [userForm.tipo],
        permisos: userForm.permisos,
        secciones: userForm.secciones_todas ? [] : userForm.secciones,
        secciones_todas: userForm.secciones_todas,
      };
      if (userForm.id) body.estado = userForm.estado;
      if (userForm.id) {
        await api(`/admin/users/${userForm.id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      } else {
        const creado = await api<{ clave_inicial?: string }>('/admin/users', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        if (creado.clave_inicial) {
          setClaveUnaVez({
            quien: userForm.nombre.trim() || email,
            clave: creado.clave_inicial,
          });
        }
      }
      setUserForm(null);
      await cargarUsuarios();
    } catch (err) {
      setError(mensaje(err));
    } finally {
      setBusy(false);
    }
  }

  async function toggleUsuario(row: UserRow) {
    setBusy(true);
    setError('');
    try {
      await api(`/admin/users/${row.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          estado: row.estado === 'ACTIVO' ? 'INACTIVO' : 'ACTIVO',
        }),
      });
      await cargarUsuarios();
    } catch (err) {
      setError(mensaje(err));
    } finally {
      setBusy(false);
    }
  }

  async function resetearClave(row: UserRow) {
    const quien = apellidoYNombre(row) || row.nombre_mostrar || row.email || row.nombre_usuario;
    if (!confirm(`¿Resetear la contraseña de ${quien}? La actual deja de servir.`)) return;
    setBusy(true);
    setError('');
    try {
      const r = await api<{ clave: string }>(`/admin/users/${row.id}/password`, {
        method: 'PATCH',
      });
      setClaveUnaVez({ quien, clave: r.clave });
    } catch (err) {
      setError(mensaje(err));
    } finally {
      setBusy(false);
    }
  }

  async function eliminarUsuario(row: UserRow) {
    if (!confirm(`¿Borrar a ${row.email || row.nombre_usuario}? Si ya firmó un Timer, ponelo Inactivo en Modificar.`)) return;
    setBusy(true);
    setError('');
    try {
      await api(`/admin/users/${row.id}`, { method: 'DELETE' });
      await cargarUsuarios();
    } catch (err) {
      setError(mensaje(err));
    } finally {
      setBusy(false);
    }
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
      if (tab === 'motivos') {
        await cargarMotivos();
        return;
      }
      if (tab === 'moviles') {
        await cargarMoviles();
        return;
      }
      if (tab === 'usuarios') {
        await cargarUsuarios();
        return;
      }
      if (tab === 'registro') {
        await cargarRegistro();
        return;
      }
      if (tab === 'apariencia') return;
      const path: Record<
        Exclude<Tab, 'inspectores' | 'licencias' | 'motivos' | 'moviles' | 'usuarios' | 'registro' | 'apariencia'>,
        string
      > = {
        posiciones: '/admin/positions',
        perfiles: '/admin/profiles',
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

  useEffect(() => {
    setFiltroTexto('');
    setFiltroEstado([]);
    setFiltroCondicion([]);
    setFiltroSecuencia([]);
  }, [plantel]);

  const tabs: Array<{ id: Tab; label: string; perm?: PermissionCode }> = [
    { id: 'inspectores', label: 'Personas', perm: PERMISSION_CODES.PERSONAS_GESTIONAR },
    { id: 'licencias', label: 'Códigos', perm: PERMISSION_CODES.LICENCIAS_GESTIONAR },
    { id: 'motivos', label: 'Motivos', perm: PERMISSION_CODES.MOTIVOS_GESTIONAR },
    { id: 'moviles', label: 'Móviles', perm: PERMISSION_CODES.MOVILES_GESTIONAR },
    { id: 'usuarios', label: 'Usuarios', perm: PERMISSION_CODES.USUARIOS_ADMINISTRAR },
    { id: 'apariencia', label: 'Apariencia', perm: PERMISSION_CODES.APARIENCIA_GESTIONAR },
    { id: 'registro', label: 'Actividad', perm: PERMISSION_CODES.AUDITORIA_CONSULTAR },
  ].filter((t) => !t.perm || hasPermission(t.perm));

  useEffect(() => {
    if (tabs.length && !tabs.some((t) => t.id === tab)) {
      setTab(tabs[0].id);
    }
  }, [tab, tabs]);

  const columns =
    tab === 'inspectores' ||
    tab === 'licencias' ||
    tab === 'motivos' ||
    tab === 'moviles' ||
    tab === 'usuarios' ||
    tab === 'registro' ||
    tab === 'apariencia'
      ? []
      : COLUMNS[tab];

  async function guardarInspector(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    const partes = partirNombre(form.nombre);
    if (!partes.apellido || !partes.nombres) {
      setError('Escribí apellido y nombre.');
      return;
    }
    if (form.seccion === 'MOVILES' && !form.posicion_id) {
      setError('Elegí la secuencia y una plaza. Sin eso no se puede inferir.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const esPeaje = esSeccionPeaje(form.seccion);
      const body: Record<string, unknown> = {
        nombres: partes.nombres,
        apellido: partes.apellido,
        legajo: form.legajo.trim(),
        tipo_plantel: esPeaje ? 'PEAJISTA' : form.tipo_plantel,
        seccion: form.seccion,
      };
      const cambiaSecuencia =
        form.seccion === 'MOVILES' &&
        (!form.id || form.posicion_id !== form.posicion_inicial);
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
      const seccionNueva = form.seccion;
      setForm(null);
      if (seccionVista !== seccionNueva) setPlantel(plantelDeSeccion(seccionNueva));
      await cargarInspectores();
    } catch (err) {
      setError(mensaje(err));
    } finally {
      setBusy(false);
    }
  }

  async function abrirHistorial(row: InspectorRow) {
    setBusy(true);
    setError('');
    try {
      const doc = await api<{
        inspector: InspectorRow;
        filas: HistorialFila[];
      }>(`/admin/inspectors/${row.id}/historial`);
      setHistorial({
        nombre: apellidoYNombre(doc.inspector),
        filas: doc.filas,
      });
    } catch (err) {
      setError(mensaje(err));
    } finally {
      setBusy(false);
    }
  }

  function exportarPersonas() {
    if (!personasFiltradas.length) {
      setError('No hay personas para exportar con ese filtro.');
      return;
    }
    downloadCsv(`personas-${seccionVista ?? 'listado'}`, [
      ['Legajo', 'Apellido y nombre', 'Sección', 'Secuencia', 'Desde', 'Estado', 'Condición'],
      ...personasFiltradas.map((r) => [
        r.legajo,
        apellidoYNombre(r),
        etiquetaSeccion(r.seccion),
        r.posicion_etiqueta || r.posicion_codigo || '',
        r.vigencia_desde ? isoToDmy(r.vigencia_desde) : '',
        r.estado,
        r.tipo_plantel === 'REEMPLAZANTE' ? 'Reemplazante' : 'Titular',
      ]),
    ]);
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

  function aplicarColorCodigo(
    codigo: string | undefined,
    patch: { bg?: string; fg?: string },
  ) {
    const boxId = boxIdDeCodigo(codigo);
    if (!boxId) return;
    const actual = resolveCodeColors(codigo, '');
    patchBox('boxes', boxId, {
      bg: patch.bg ?? actual?.bg ?? '#3f4a42',
      fg: patch.fg ?? actual?.fg ?? '#dfe3dc',
    });
  }

  async function guardarLicencia(e: FormEvent) {
    e.preventDefault();
    const desc = (licEdit.horario || licEdit.nombre || '').trim();
    if (!licEdit.codigo?.trim() || !desc) return;
    setBusy(true);
    setError('');
    try {
      const body = {
        nombre: desc,
        codigo: licEdit.codigo.trim().toUpperCase(),
        codigo_sap: licEdit.codigo_sap?.trim() || null,
        horario: desc,
        ambito: licEdit.ambito === 'BASE_OPERACIONES' ? 'BASE_OPERACIONES' : 'SEGURIDAD_VIAL',
        tipo: licEdit.tipo || 'AUSENCIA',
        color_fondo: colorValido(licEdit.color_fondo) ?? null,
        color_letra: colorValido(licEdit.color_letra) ?? null,
      };
      if (licEdit.id) {
        await api(`/admin/licencias/${licEdit.id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      } else {
        await api('/admin/licencias', { method: 'POST', body: JSON.stringify(body) });
      }
      const fondo = colorValido(licEdit.color_fondo);
      const letra = colorValido(licEdit.color_letra);
      const boxId = boxIdDeCodigo(body.codigo);
      if (boxId && (fondo || letra)) {
        const actual = resolveCodeColors(body.codigo, '');
        patchBox('boxes', boxId, {
          bg: fondo ?? actual?.bg ?? '#3f4a42',
          fg: letra ?? actual?.fg ?? '#dfe3dc',
        });
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
    if (!confirm(`¿Eliminar ${item.codigo}? Si ya se usó en Real, desactivalo.`)) return;
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

  async function guardarMotivo(e: FormEvent) {
    e.preventDefault();
    const nombre = motEdit?.nombre?.trim() ?? '';
    if (nombre.length < 3) return;
    setBusy(true);
    setError('');
    try {
      if (motEdit?.id) {
        await api(`/admin/timer-motivos/${motEdit.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ nombre }),
        });
      } else {
        await api('/admin/timer-motivos', {
          method: 'POST',
          body: JSON.stringify({ nombre }),
        });
      }
      setMotEdit(null);
      await cargarMotivos();
    } catch (err) {
      setError(mensaje(err));
    } finally {
      setBusy(false);
    }
  }

  async function toggleMotivo(item: MotivoRow) {
    setBusy(true);
    setError('');
    try {
      await api(`/admin/timer-motivos/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ activo: !item.activo }),
      });
      await cargarMotivos();
    } catch (err) {
      setError(mensaje(err));
    } finally {
      setBusy(false);
    }
  }

  async function eliminarMotivo(item: MotivoRow) {
    if (!confirm(`¿Eliminar “${item.nombre}”? Si ya se usó en el Timer, desactivalo.`)) return;
    setBusy(true);
    setError('');
    try {
      await api(`/admin/timer-motivos/${item.id}`, { method: 'DELETE' });
      await cargarMotivos();
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
  const opcionesSecuencia = useMemo(() => {
    const ordenGrupo: Record<string, number> = {
      GENERAL: 0,
      MOVIL4: 1,
      MOVIL6: 2,
      MOVIL7: 3,
      VINCULADA: 4,
    };
    const vistos = new Set<string>();
    const opts: SearchSelectOption[] = [];
    const sorted = [...posiciones].sort((a, b) => {
      const ga = ordenGrupo[claveGrupoPosicion(a)] ?? 9;
      const gb = ordenGrupo[claveGrupoPosicion(b)] ?? 9;
      if (ga !== gb) return ga - gb;
      return etiquetaSecuencia(a).localeCompare(etiquetaSecuencia(b), 'es');
    });
    for (const p of sorted) {
      const id = idSecuencia(p);
      if (vistos.has(id)) continue;
      vistos.add(id);
      opts.push({
        id,
        label: etiquetaSecuencia(p),
        search: [p.perfil, p.moviles, p.turnos, claveGrupoPosicion(p)].filter(Boolean).join(' '),
      });
    }
    opts.push({
      id: '__new__',
      label: '+ Nueva secuencia',
      search: 'nueva secuencia ciclo',
      action: true,
    });
    return opts;
  }, [posiciones]);

  const plazasDeSecuencia = useMemo(() => {
    if (!form?.secuencia_id || form.secuencia_id === '__new__') return [];
    return posiciones.filter((p) => idSecuencia(p) === form.secuencia_id);
  }, [posiciones, form?.secuencia_id]);

  const opcionesPlaza = useMemo(() => {
    const selfId = form?.id ?? null;
    const sorted = [...plazasDeSecuencia].sort((a, b) => {
      const oa = a.ocupante && a.ocupante_id !== selfId ? 1 : 0;
      const ob = b.ocupante && b.ocupante_id !== selfId ? 1 : 0;
      if (oa !== ob) return oa - ob;
      return a.codigo.localeCompare(b.codigo, 'es', { numeric: true });
    });
    const out: SearchSelectOption[] = sorted.map((p) => ({
      id: p.id,
      label: etiquetaPlaza(p, selfId),
      search: [p.codigo, p.ocupante].filter(Boolean).join(' '),
    }));
    const sample = plazasDeSecuencia[0];
    if (sample && claveGrupoPosicion(sample) !== 'VINCULADA') {
      out.unshift({
        id: '__new_plaza__',
        label: '+ Nueva plaza libre',
        search: 'nueva plaza libre',
        action: true,
      });
    }
    return out;
  }, [plazasDeSecuencia, form?.id]);

  function plazaLibreDe(seqId: string, personaId?: string | null) {
    return (
      posiciones.find(
        (p) => idSecuencia(p) === seqId && (!p.ocupante || p.ocupante_id === personaId),
      ) ?? null
    );
  }

  function elegirSecuencia(id: string) {
    if (!form) return;
    if (id === '__new__') {
      setForm({
        ...form,
        secuencia_id: '__new__',
        posicion_id: '',
        nueva_moviles: form.nueva_moviles,
        nueva_turnos: form.nueva_turnos.length ? form.nueva_turnos : ['M', 'N', 'T'],
      });
      return;
    }
    const libre = plazaLibreDe(id, form.id);
    setForm({
      ...form,
      secuencia_id: id,
      posicion_id: libre?.id || '',
      nueva_moviles: [],
      nueva_turnos: [],
    });
  }

  async function elegirPlaza(id: string) {
    if (!form) return;
    if (id !== '__new_plaza__') {
      const p = posiciones.find((x) => x.id === id);
      setForm({
        ...form,
        posicion_id: id,
        secuencia_id: p ? idSecuencia(p) : form.secuencia_id,
      });
      return;
    }
    if (!form.secuencia_id || form.secuencia_id === '__new__') return;
    setBusy(true);
    setError('');
    try {
      const creada = await api<PosicionOpt>('/admin/positions', {
        method: 'POST',
        body: JSON.stringify({
          perfil_id: form.secuencia_id,
          fecha_desde: form.fecha_desde,
        }),
      });
      setPosiciones((prev) => [...prev, creada]);
      setForm((f) =>
        f
          ? { ...f, posicion_id: creada.id, secuencia_id: creada.perfil_id || f.secuencia_id }
          : f,
      );
    } catch (err) {
      setError(mensaje(err));
    } finally {
      setBusy(false);
    }
  }

  async function crearSecuenciaNueva() {
    if (!form) return;
    if (!form.nueva_moviles.length || !form.nueva_turnos.length) {
      setError('Armá el recorrido: al menos un móvil y un turno.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const creada = await api<PosicionOpt>('/admin/positions', {
        method: 'POST',
        body: JSON.stringify({
          moviles: form.nueva_moviles,
          turnos: form.nueva_turnos,
          fecha_desde: form.fecha_desde,
        }),
      });
      setPosiciones((prev) => [...prev, creada]);
      setForm((f) =>
        f
          ? {
              ...f,
              secuencia_id: creada.perfil_id || idSecuencia(creada),
              posicion_id: creada.id,
              nueva_moviles: [],
              nueva_turnos: [],
            }
          : f,
      );
    } catch (err) {
      setError(mensaje(err));
    } finally {
      setBusy(false);
    }
  }

  function toggleNuevoMovil(n: number) {
    if (!form) return;
    const has = form.nueva_moviles.includes(n);
    setForm({
      ...form,
      nueva_moviles: has ? form.nueva_moviles.filter((x) => x !== n) : [...form.nueva_moviles, n],
    });
  }

  function toggleNuevoTurno(t: 'M' | 'N' | 'T') {
    if (!form) return;
    const has = form.nueva_turnos.includes(t);
    setForm({
      ...form,
      nueva_turnos: has ? form.nueva_turnos.filter((x) => x !== t) : [...form.nueva_turnos, t],
    });
  }

  return (
    <div className="stack">
      <header className="page-header">
        <div>
          <h1>Administración</h1>
          <p>Personas, códigos de cuadratura, móviles y catálogos.</p>
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
            <div className="cuad-filters admin-filters">
              <input
                type="search"
                className="admin-search"
                placeholder="Legajo o nombre…"
                aria-label="Buscar personas"
                value={filtroTexto}
                onChange={(e) => setFiltroTexto(e.target.value)}
              />
              <FilterPicker
                aria-label="Sección"
                summaryLabel="Sección"
                allLabel="Todas"
                placeholder="Buscar sección…"
                options={seccionesUsuario.map((s) => ({ id: s.id, label: s.label }))}
                values={filtroSeccion}
                onChange={setFiltroSeccion}
              />
              <FilterPicker
                aria-label="Estado"
                summaryLabel="Estado"
                allLabel="Todos"
                options={[
                  { id: 'ACTIVO', label: 'Activo' },
                  { id: 'INACTIVO', label: 'Inactivo' },
                ]}
                values={filtroEstado}
                onChange={setFiltroEstado}
              />
              <FilterPicker
                aria-label="Condición"
                summaryLabel="Condición"
                allLabel="Todas"
                options={[
                  { id: 'TITULAR', label: 'Titular' },
                  { id: 'REEMPLAZANTE', label: 'Reemplazante' },
                  { id: 'PEAJISTA', label: 'Peajista' },
                ]}
                values={filtroCondicion}
                onChange={setFiltroCondicion}
              />
            </div>
            <div className="admin-toolbar-actions">
              <button
                type="button"
                className="btn secondary sm"
                disabled={!personasFiltradas.length}
                onClick={exportarPersonas}
              >
                Exportar
              </button>
              <button
                type="button"
                className="btn primary sm"
                onClick={() =>
                  setForm({
                    ...FORM_VACIO,
                    fecha_desde: hoyIso(),
                    seccion:
                      seccionesUsuario.some((s) => s.id === (seccionVista ?? ''))
                        ? (seccionVista ?? 'MOVILES')
                        : (seccionesUsuario[0]?.id ?? 'MOVILES'),
                  })
                }
              >
                Incorporar persona
              </button>
            </div>
          </div>
          {busy ? <p className="muted">Cargando…</p> : null}
          {!busy && personasVista.length === 0 ? (
            <p className="muted">Sin personas cargadas.</p>
          ) : null}
          {!busy && personasVista.length > 0 && personasFiltradas.length === 0 ? (
            <p className="muted">Ninguna persona coincide con el filtro.</p>
          ) : null}
          {personasFiltradas.length > 0 ? (
            <div className="xlsx-scroll">
              <table className="data">
                <thead>
                  <tr>
                    <th>Legajo</th>
                    <th>Apellido y Nombre</th>
                    <th>Sección</th>
                    <th>Secuencia</th>
                    <th>Desde</th>
                    <th>Estado</th>
                    <th className="admin-row-actions">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {personasFiltradas.map((row) => (
                    <tr key={row.id}>
                      <td>{row.legajo}</td>
                      <td>
                        <span className="cell-primary">{apellidoYNombre(row)}</span>
                      </td>
                      <td>{etiquetaSeccion(row.seccion)}</td>
                      <td>{row.posicion_etiqueta || row.posicion_codigo || 'Sin secuencia'}</td>
                      <td>{row.vigencia_desde || '—'}</td>
                      <td>{row.estado}</td>
                      <td className="admin-row-actions">
                        <button
                          type="button"
                          className="btn secondary sm"
                          onClick={() => {
                            const pos = posiciones.find((p) => p.ocupante_id === row.id);
                            setForm({
                              id: row.id,
                              nombre: apellidoYNombre(row),
                              seccion:
                                row.seccion === 'EPI' || row.seccion === 'BO'
                                  ? row.seccion
                                  : 'MOVILES',
                              legajo: row.legajo,
                              tipo_plantel:
                                row.tipo_plantel === 'REEMPLAZANTE' ? 'REEMPLAZANTE' : 'TITULAR',
                              fecha_desde: hoyIso(),
                              posicion_id: pos?.id || '',
                              posicion_inicial: pos?.id || '',
                              secuencia_id: pos ? idSecuencia(pos) : '',
                              nueva_moviles: [],
                              nueva_turnos: [],
                            });
                          }}
                        >
                          Modificar
                        </button>
                        <button
                          type="button"
                          className="btn ghost sm"
                          onClick={() => void abrirHistorial(row)}
                        >
                          Historial
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
          ) : null}
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
            <div className="cuad-filters admin-filters">
              <input
                type="search"
                className="admin-search"
                placeholder="Código, SAP, horario…"
                aria-label="Buscar código"
                value={licFiltroTexto}
                onChange={(e) => setLicFiltroTexto(e.target.value)}
              />
              <FilterPicker
                aria-label="Tipo"
                summaryLabel="Tipo"
                allLabel="Todos"
                options={[
                  { id: 'TURNO', label: 'Turno' },
                  { id: 'FRANCO', label: 'Franco' },
                  { id: 'AUSENCIA', label: 'Ausentismo' },
                  { id: 'OTRO', label: 'Otro' },
                ]}
                values={licFiltroTipo}
                onChange={setLicFiltroTipo}
              />
              <FilterPicker
                aria-label="Estado"
                summaryLabel="Estado"
                allLabel="Todos"
                options={[
                  { id: 'ACTIVO', label: 'Activo' },
                  { id: 'INACTIVO', label: 'Inactivo' },
                ]}
                values={licFiltroEstado}
                onChange={setLicFiltroEstado}
              />
            </div>
            <button
              type="button"
              className="btn primary sm"
              onClick={() =>
                setLicEdit({
                  codigo: '',
                  codigo_sap: '',
                  nombre: '',
                  horario: '',
                  ambito: ambito ?? 'SEGURIDAD_VIAL',
                  tipo: 'AUSENCIA',
                  activo: true,
                  color_fondo: '#3f4a42',
                  color_letra: '#dfe3dc',
                })
              }
            >
              Agregar código
            </button>
          </div>
          {busy ? <p className="muted">Cargando…</p> : null}
          {codigosVista.length === 0 && !busy ? (
            <p className="muted">Ningún código coincide con el filtro.</p>
          ) : (
          <div className="xlsx-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>SAP</th>
                  <th>Horario / descripción</th>
                  <th>Tipo</th>
                  <th>Color</th>
                  <th>Estado</th>
                  <th className="admin-row-actions">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {codigosVista.map((item) => {
                  const colores = resolveCodeColors(
                    item.codigo,
                    '',
                    item.color_fondo,
                    item.color_letra,
                  );
                  return (
                  <tr key={item.id} className={item.activo ? undefined : 'is-off'}>
                    <td>
                      <code>{item.codigo}</code>
                    </td>
                    <td>{item.codigo_sap || '—'}</td>
                    <td>
                      <span
                        className="lic-chip"
                        style={
                          colores
                            ? {
                                background: colores.bg,
                                color: colores.fg,
                              }
                            : undefined
                        }
                      >
                        {item.horario || item.nombre}
                      </span>
                    </td>
                    <td>
                      {item.tipo === 'TURNO'
                        ? 'Turno'
                        : item.tipo === 'FRANCO'
                          ? 'Franco'
                          : item.tipo === 'OTRO'
                            ? 'Otro'
                            : 'Ausentismo'}
                    </td>
                    <td>
                      {colores ? (
                        <span className="lic-color-pair">
                          <i
                            className="lic-dot"
                            style={{ background: colores.bg }}
                            title="Fondo"
                          />
                          <i
                            className="lic-dot"
                            style={{ background: colores.fg }}
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
                        onClick={() => {
                          const c = resolveCodeColors(
                            item.codigo,
                            '',
                            item.color_fondo,
                            item.color_letra,
                          );
                          setLicEdit({
                            ...item,
                            color_fondo: c?.bg ?? item.color_fondo,
                            color_letra: c?.fg ?? item.color_letra,
                          });
                        }}
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
                  );
                })}
              </tbody>
            </table>
          </div>
          )}
        </section>
      ) : null}

      {tab === 'motivos' ? (
        <section className="panel">
          <div className="admin-toolbar">
            <div className="cuad-filters admin-filters">
              <input
                type="search"
                className="admin-search"
                placeholder="Buscar motivo…"
                aria-label="Buscar motivo"
                value={motFiltroTexto}
                onChange={(e) => setMotFiltroTexto(e.target.value)}
              />
              <FilterPicker
                aria-label="Estado"
                summaryLabel="Estado"
                allLabel="Todos"
                options={[
                  { id: 'ACTIVO', label: 'Activo' },
                  { id: 'INACTIVO', label: 'Inactivo' },
                ]}
                values={motFiltroEstado}
                onChange={setMotFiltroEstado}
              />
            </div>
            <button
              type="button"
              className="btn primary sm"
              onClick={() => setMotEdit({ nombre: '', activo: true })}
            >
              Agregar motivo
            </button>
          </div>
          <p className="admin-hint">
            Lista del Timer (Motivo de la Novedad/Cambio). Lo que cargues acá es lo que se elige
            en cada fila.
          </p>
          {busy ? <p className="muted">Cargando…</p> : null}
          {motivosVista.length === 0 && !busy ? (
            <p className="muted">Ningún motivo coincide con el filtro.</p>
          ) : (
            <div className="xlsx-scroll">
              <table className="data">
                <thead>
                  <tr>
                    <th>Motivo</th>
                    <th>Estado</th>
                    <th className="admin-row-actions">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {motivosVista.map((item) => (
                    <tr key={item.id} className={item.activo ? undefined : 'is-off'}>
                      <td>{item.nombre}</td>
                      <td>{item.activo ? 'Activo' : 'Inactivo'}</td>
                      <td className="admin-row-actions">
                        <button
                          type="button"
                          className="btn secondary sm"
                          onClick={() => setMotEdit(item)}
                        >
                          Modificar
                        </button>
                        <button
                          type="button"
                          className="btn ghost sm"
                          onClick={() => void toggleMotivo(item)}
                        >
                          {item.activo ? 'Desactivar' : 'Activar'}
                        </button>
                        <button
                          type="button"
                          className="btn ghost sm"
                          onClick={() => void eliminarMotivo(item)}
                        >
                          Eliminar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {tab === 'usuarios' ? (
        <section className="panel">
          <div className="admin-toolbar">
            <div className="cuad-filters admin-filters">
              <input
                type="search"
                className="admin-search"
                placeholder="Legajo, nombre o usuario…"
                aria-label="Buscar usuarios"
                value={userFiltro}
                onChange={(e) => setUserFiltro(e.target.value)}
              />
            </div>
            <button
              type="button"
              className="btn primary sm"
              onClick={() => abrirUsuario()}
            >
              Incorporar usuario
            </button>
          </div>
          <p className="admin-hint">
            El tipo carga permisos por defecto. Después se pueden ajustar. El responsable
            del Timer sale de acá: legajo, apellido y nombre.
          </p>
          {busy ? <p className="muted">Cargando…</p> : null}
          {usuarios.filter((u) => {
            const q = normalizarTexto(userFiltro.trim());
            if (!q) return true;
            return normalizarTexto(
              [u.legajo, u.apellido, u.nombres, u.nombre_mostrar, u.nombre_usuario, u.email, u.roles_texto].join(' '),
            ).includes(q);
          }).length === 0 && !busy ? (
            <p className="muted">Ningún usuario coincide con el filtro.</p>
          ) : (
            <div className="xlsx-scroll">
              <table className="data">
                <thead>
                  <tr>
                    <th>Legajo</th>
                    <th>Apellido y nombre</th>
                    <th>Email</th>
                    <th>Tipo</th>
                    <th>Secciones</th>
                    <th>Estado</th>
                    <th className="admin-row-actions">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {usuarios
                    .filter((u) => {
                      const q = normalizarTexto(userFiltro.trim());
                      if (!q) return true;
                      return normalizarTexto(
                        [u.legajo, u.apellido, u.nombres, u.nombre_mostrar, u.nombre_usuario, u.email, u.roles_texto].join(' '),
                      ).includes(q);
                    })
                    .map((row) => (
                      <tr key={row.id} className={row.estado === 'ACTIVO' ? undefined : 'is-off'}>
                        <td>{row.legajo || '—'}</td>
                        <td>{apellidoYNombre(row) || row.nombre_mostrar}</td>
                        <td>{row.email || row.nombre_usuario || '—'}</td>
                        <td>{row.roles_texto}</td>
                        <td>
                          {row.secciones_todas
                            ? 'Todas'
                            : row.secciones.length
                              ? row.secciones.map((s) => etiquetaSeccion(s)).join(' · ')
                              : '—'}
                        </td>
                        <td>{row.estado}</td>
                        <td className="admin-row-actions">
                          <button
                            type="button"
                            className="btn secondary sm"
                            onClick={() => abrirUsuario(row)}
                          >
                            Modificar
                          </button>
                          <button
                            type="button"
                            className="btn ghost sm"
                            onClick={() => void resetearClave(row)}
                          >
                            Resetear
                          </button>
                          <button
                            type="button"
                            className="btn ghost sm"
                            onClick={() => void toggleUsuario(row)}
                          >
                            {row.estado === 'ACTIVO' ? 'Desactivar' : 'Activar'}
                          </button>
                          <button
                            type="button"
                            className="btn ghost sm"
                            onClick={() => void eliminarUsuario(row)}
                          >
                            Borrar
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {tab === 'apariencia' ? (
        <section className="panel">
          <h2 className="admin-section-title">Apariencia</h2>
          <p className="admin-hint">
            Color de fondo y de letras de la app. Se guarda en este navegador, por tema.
          </p>
          <AppearancePanel />
        </section>
      ) : null}

      {tab === 'registro' ? (
        <section className="panel">
          <p className="admin-hint">
            Quién hizo qué. Las contraseñas no se muestran.
          </p>
          {busy && !registro.length ? <p className="muted">Cargando…</p> : null}
          {!busy && !registro.length ? (
            <p className="muted">Todavía no hay movimientos.</p>
          ) : (
            <ol className="audit-log">
              {registro.map((f) => (
                <li key={f.id} className="audit-line">
                  <time dateTime={f.ocurrido_en}>
                    {new Date(f.ocurrido_en).toLocaleString('es-AR', {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </time>
                  <strong>{f.usuario}</strong>
                  <span>{f.detalle}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      ) : null}

      {tab !== 'inspectores' &&
      tab !== 'licencias' &&
      tab !== 'motivos' &&
      tab !== 'moviles' &&
      tab !== 'usuarios' &&
      tab !== 'registro' &&
      tab !== 'apariencia' ? (
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
        title={
          form?.id
            ? `Modificar ${etiquetaRolSeccion(form.seccion)}`
            : `Incorporar ${etiquetaRolSeccion(form?.seccion)}`
        }
        description={
          form?.seccion === 'MOVILES'
            ? 'La secuencia es el recorrido (móviles y turnos). La plaza es el asiento de esa secuencia.'
            : esSeccionPeaje(form?.seccion)
              ? 'Peajista de la estación elegida en Sección.'
              : form?.seccion === 'BO'
                ? 'Operario de Base de Operaciones.'
                : form?.seccion === 'EPI'
                  ? 'Persona de E.P.I.'
                  : 'Elegí la sección y los datos de la persona.'
        }
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
              <label htmlFor="insp-seccion">Sección</label>
              <select
                id="insp-seccion"
                value={form.seccion}
                onChange={(e) =>
                  setForm({
                    ...form,
                    seccion: e.target.value as SeccionSv,
                    posicion_id: e.target.value === 'MOVILES' ? form.posicion_id : '',
                    secuencia_id: e.target.value === 'MOVILES' ? form.secuencia_id : '',
                  })
                }
              >
                {(['Peajes', 'Seguridad Vial'] as const)
                  .filter((grupo) =>
                    SECCIONES_SV_SORTED.some(
                      (s) => s.grupo === grupo && veSeccion(alcance, s.id),
                    ),
                  )
                  .map((grupo) => (
                  <optgroup key={grupo} label={grupo}>
                    {SECCIONES_SV_SORTED.filter(
                      (s) => s.grupo === grupo && veSeccion(alcance, s.id),
                    ).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
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
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label htmlFor="insp-nombre">Apellido y nombre</label>
              <input
                id="insp-nombre"
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                placeholder="Acosta, Juan"
                required
              />
            </div>
            {!esSeccionPeaje(form.seccion) && (
              <div className="field">
                <label htmlFor="insp-plantel">Condición</label>
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
            )}
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
            {form.seccion === 'MOVILES' ? (
            <>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <span className="field-label">Secuencia</span>
              <div className="seq-choices" role="listbox" aria-label="Secuencia">
                {opcionesSecuencia.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    role="option"
                    aria-selected={form.secuencia_id === o.id}
                    className={`seq-choice${form.secuencia_id === o.id ? ' is-on' : ''}${
                      o.action ? ' is-action' : ''
                    }`}
                    onClick={() => elegirSecuencia(o.id)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              {form.secuencia_id === '__new__' ? (
                <div className="seq-builder">
                  <p className="hint" style={{ margin: 0 }}>
                    Clic en orden. Preview:{' '}
                    {[(form.nueva_moviles ?? []).join('→') || '—', (form.nueva_turnos ?? []).join('→') || '—'].join(' / ')}
                  </p>
                  <div className="seq-builder-row">
                    <span className="muted">Móviles</span>
                    {moviles
                      .filter((m) => m.estado === 'ACTIVO')
                      .map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          className={`btn sm${(form.nueva_moviles ?? []).includes(m.numero) ? ' primary' : ' secondary'}`}
                          onClick={() => toggleNuevoMovil(m.numero)}
                        >
                          {m.numero}
                          {(form.nueva_moviles ?? []).includes(m.numero)
                            ? ` · ${(form.nueva_moviles ?? []).indexOf(m.numero) + 1}`
                            : ''}
                        </button>
                      ))}
                  </div>
                  <div className="seq-builder-row">
                    <span className="muted">Turnos</span>
                    {TURNOS_SEQ.map((t) => (
                      <button
                        key={t}
                        type="button"
                        className={`btn sm${(form.nueva_turnos ?? []).includes(t) ? ' primary' : ' secondary'}`}
                        onClick={() => toggleNuevoTurno(t)}
                      >
                        {t}
                        {(form.nueva_turnos ?? []).includes(t)
                          ? ` · ${(form.nueva_turnos ?? []).indexOf(t) + 1}`
                          : ''}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="btn primary sm"
                    disabled={
                      busy ||
                      !(form.nueva_moviles ?? []).length ||
                      !(form.nueva_turnos ?? []).length
                    }
                    onClick={() => void crearSecuenciaNueva()}
                  >
                    Crear secuencia
                  </button>
                </div>
              ) : (
                <p className="hint">
                  El recorrido de móviles y turnos. «Nueva secuencia» arma uno distinto.
                </p>
              )}
            </div>
            {form.secuencia_id && form.secuencia_id !== '__new__' ? (
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <span className="field-label">Plaza</span>
              <div className="seq-choices is-scroll" role="listbox" aria-label="Plaza">
                {opcionesPlaza.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    role="option"
                    aria-selected={form.posicion_id === o.id}
                    className={`seq-choice${form.posicion_id === o.id ? ' is-on' : ''}${
                      o.action ? ' is-action' : ''
                    }`}
                    onClick={() => void elegirPlaza(o.id)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              {posicionElegida ? (
                <p className="hint">
                  {posicionElegida.ocupante && posicionElegida.ocupante_id !== form.id
                    ? `Hoy la usa ${posicionElegida.ocupante}; al guardar se cierra el día anterior.`
                    : 'Plaza libre: entra sin sacar a nadie.'}
                </p>
              ) : (
                <p className="hint">
                  Asiento de esa secuencia. «Nueva plaza libre» crea uno vacío.
                </p>
              )}
            </div>
            ) : null}
            </>
            ) : (
              <p className="hint" style={{ gridColumn: '1 / -1' }}>
                E.P.I. y Base de Operaciones todavía no usan secuencia de móviles.
              </p>
            )}
          </form>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(historial)}
        onClose={() => setHistorial(null)}
        title={historial ? `Historial · ${historial.nombre}` : 'Historial'}
        description="Dónde estuvo. Si cambia de sección o de secuencia, el período anterior se cierra y no se pisa."
        size="md"
        footer={
          <button type="button" className="btn secondary" onClick={() => setHistorial(null)}>
            Cerrar
          </button>
        }
      >
        {historial && historial.filas.length === 0 ? (
          <p className="muted">Todavía no hay períodos cargados.</p>
        ) : null}
        {historial && historial.filas.length > 0 ? (
          <div className="xlsx-scroll">
            <table className="data">
              <thead>
                <tr>
                  <th>Desde</th>
                  <th>Hasta</th>
                  <th>Dónde</th>
                  <th>Motivo</th>
                </tr>
              </thead>
              <tbody>
                {historial.filas.map((f, i) => (
                  <tr key={`${f.origen}-${f.fecha_desde}-${i}`}>
                    <td>{isoToDmy(f.fecha_desde)}</td>
                    <td>{f.fecha_hasta ? isoToDmy(f.fecha_hasta) : 'Vigente'}</td>
                    <td>
                      {etiquetaSeccion(f.seccion)}
                      {f.posicion_etiqueta ? ` · ${f.posicion_etiqueta}` : ''}
                    </td>
                    <td>{f.motivo || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(licEdit)}
        onClose={() => setLicEdit(null)}
        title={licEdit?.id ? 'Modificar código' : 'Agregar código'}
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
              <label htmlFor="lic-codigo">Código interno</label>
              <input
                id="lic-codigo"
                value={licEdit.codigo ?? ''}
                onChange={(e) =>
                  setLicEdit({ ...licEdit, codigo: e.target.value.toUpperCase() })
                }
                placeholder="AC"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="lic-sap">Código SAP</label>
              <input
                id="lic-sap"
                value={licEdit.codigo_sap ?? ''}
                onChange={(e) => setLicEdit({ ...licEdit, codigo_sap: e.target.value })}
                placeholder="02AC"
              />
            </div>
            <div className="field">
              <label htmlFor="lic-horario">Horario / descripción</label>
              <input
                id="lic-horario"
                value={licEdit.horario ?? licEdit.nombre ?? ''}
                onChange={(e) =>
                  setLicEdit({
                    ...licEdit,
                    horario: e.target.value,
                    nombre: e.target.value,
                  })
                }
                placeholder="Accidente a cargo empresa"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="lic-tipo">Tipo</label>
              <select
                id="lic-tipo"
                value={licEdit.tipo || 'AUSENCIA'}
                onChange={(e) => setLicEdit({ ...licEdit, tipo: e.target.value })}
              >
                <option value="TURNO">Turno</option>
                <option value="AUSENCIA">Ausentismo</option>
                <option value="FRANCO">Franco</option>
                <option value="OTRO">Otro</option>
              </select>
            </div>
            <div className="admin-color-row">
              {(() => {
                const c = resolveCodeColors(
                  licEdit.codigo,
                  '',
                  licEdit.color_fondo,
                  licEdit.color_letra,
                );
                const fondo = c?.bg ?? '#3f4a42';
                const letra = c?.fg ?? '#dfe3dc';
                return (
                  <>
              <div className="field">
                <label htmlFor="lic-fondo">Color de fondo</label>
                <div className="admin-color-ctrl">
                  <input
                    id="lic-fondo"
                    type="color"
                    value={fondo}
                    onChange={(e) => {
                      const hex = e.target.value.toUpperCase();
                      setLicEdit({ ...licEdit, color_fondo: hex });
                      aplicarColorCodigo(licEdit.codigo, { bg: hex });
                    }}
                  />
                  <code>{fondo}</code>
                </div>
              </div>
              <div className="field">
                <label htmlFor="lic-letra">Color de letra</label>
                <div className="admin-color-ctrl">
                  <input
                    id="lic-letra"
                    type="color"
                    value={letra}
                    onChange={(e) => {
                      const hex = e.target.value.toUpperCase();
                      setLicEdit({ ...licEdit, color_letra: hex });
                      aplicarColorCodigo(licEdit.codigo, { fg: hex });
                    }}
                  />
                  <code>{letra}</code>
                </div>
              </div>
                  </>
                );
              })()}
            </div>
            <p className="admin-hint" style={{ margin: 0 }}>
              Vista previa:{' '}
              <span
                className="lic-chip"
                style={(() => {
                  const c = resolveCodeColors(
                    licEdit.codigo,
                    '',
                    licEdit.color_fondo,
                    licEdit.color_letra,
                  );
                  return c
                    ? { background: c.bg, color: c.fg }
                    : undefined;
                })()}
              >
                {licEdit.codigo || 'Código'}{' '}
                {licEdit.horario || licEdit.nombre
                  ? `· ${licEdit.horario || licEdit.nombre}`
                  : ''}
              </span>
            </p>
          </form>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(motEdit)}
        onClose={() => setMotEdit(null)}
        title={motEdit?.id ? 'Modificar motivo' : 'Agregar motivo'}
        description="Texto que aparece en el validar del Timer."
        size="sm"
        footer={
          <>
            <button type="button" className="btn secondary" onClick={() => setMotEdit(null)}>
              Cancelar
            </button>
            <button type="submit" form="mot-form" className="btn primary" disabled={busy}>
              Guardar
            </button>
          </>
        }
      >
        {motEdit ? (
          <form id="mot-form" className="stack" onSubmit={guardarMotivo}>
            <div className="field">
              <label htmlFor="mot-nombre">Motivo</label>
              <input
                id="mot-nombre"
                value={motEdit.nombre ?? ''}
                onChange={(e) => setMotEdit({ ...motEdit, nombre: e.target.value })}
                placeholder="Ej. Congestión de Tránsito"
                required
                minLength={3}
              />
            </div>
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

      <Modal
        open={Boolean(userForm)}
        onClose={() => setUserForm(null)}
        title={userForm?.id ? 'Modificar usuario' : 'Incorporar usuario'}
        description={
          userForm?.id
            ? 'La contraseña se guarda cifrada; el admin no la ve. Para una nueva, Resetear.'
            : 'Al guardar se genera una temporal (se muestra una vez) y se guarda cifrada.'
        }
        size="md"
        footer={
          <>
            <button type="button" className="btn secondary" onClick={() => setUserForm(null)}>
              Cancelar
            </button>
            <button type="submit" form="user-form" className="btn primary" disabled={busy}>
              Guardar
            </button>
          </>
        }
      >
        {userForm ? (
          <form id="user-form" className="form-grid" onSubmit={(e) => void guardarUsuario(e)}>
            <div className="field">
              <label htmlFor="usr-leg">Legajo</label>
              <input
                id="usr-leg"
                value={userForm.legajo}
                onChange={(e) => setUserForm({ ...userForm, legajo: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="usr-nombre">Apellido y nombre</label>
              <input
                id="usr-nombre"
                value={userForm.nombre}
                onChange={(e) => setUserForm({ ...userForm, nombre: e.target.value })}
                placeholder="Acosta, Juan"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="usr-mail">Email</label>
              <input
                id="usr-mail"
                type="email"
                autoComplete="off"
                value={userForm.email}
                onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                required
              />
            </div>
            {userForm.id ? (
              <div className="field">
                <label htmlFor="usr-est">Estado</label>
                <select
                  id="usr-est"
                  value={userForm.estado}
                  onChange={(e) =>
                    setUserForm({
                      ...userForm,
                      estado: e.target.value === 'INACTIVO' ? 'INACTIVO' : 'ACTIVO',
                    })
                  }
                >
                  <option value="ACTIVO">Activo</option>
                  <option value="INACTIVO">Inactivo</option>
                </select>
              </div>
            ) : null}
            <div className="field">
              <span>Tipo de permiso</span>
              <div className="seq-choices" role="listbox" aria-label="Tipo de permiso">
                {(rolesCat.filter((r) => r.codigo !== ROLE_CODES.ADMIN_SV).length
                  ? rolesCat.filter((r) => r.codigo !== ROLE_CODES.ADMIN_SV)
                  : ROLE_TIPO_ORDEN.map((codigo) => ({
                      codigo,
                      nombre: ROLE_META[codigo].nombre,
                      descripcion: ROLE_META[codigo].descripcion,
                      permisos: defaultsDeTipo(codigo),
                    }))
                ).map((r) => {
                  const meta = ROLE_META[r.codigo as RoleCode];
                  const on = userForm.tipo === r.codigo;
                  return (
                    <button
                      key={r.codigo}
                      type="button"
                      role="option"
                      aria-selected={on}
                      className={`seq-choice${on ? ' is-on' : ''}`}
                      onClick={() => {
                        const tipo = r.codigo as RoleCode;
                        setUserForm({
                          ...userForm,
                          tipo,
                          permisos: defaultsRol(rolesCat, tipo),
                          secciones_todas:
                            tipo === ROLE_CODES.ADMIN_SYS ? true : userForm.secciones_todas,
                        });
                      }}
                    >
                      {meta?.nombre ?? r.nombre}
                    </button>
                  );
                })}
              </div>
              <p className="tipo-desc">
                {ROLE_META[userForm.tipo]?.descripcion ??
                  rolesCat.find((r) => r.codigo === userForm.tipo)?.descripcion ??
                  ''}
              </p>
            </div>
            <div className="field">
              <span>Permisos</span>
              <div className="perm-groups">
                {PERMISSION_GROUPS.map((g) => (
                  <div key={g.id} className="perm-group">
                    <h4>{g.label}</h4>
                    <div className="perm-list">
                      {g.items.map((item) => {
                        const on = userForm.permisos.includes(item.codigo);
                        return (
                          <label
                            key={item.codigo}
                            className="perm-item"
                            title={item.descripcion}
                          >
                            <input
                              type="checkbox"
                              checked={on}
                              onChange={() =>
                                setUserForm({
                                  ...userForm,
                                  permisos: on
                                    ? userForm.permisos.filter((x) => x !== item.codigo)
                                    : [...userForm.permisos, item.codigo],
                                })
                              }
                            />
                            <span className="perm-item-text">
                              <span>{item.label}</span>
                              <span className="perm-item-hint">{item.descripcion}</span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <span>Secciones</span>
              <div className="seq-choices">
                <button
                  type="button"
                  className={`seq-choice${userForm.secciones_todas ? ' is-on' : ''}`}
                  onClick={() =>
                    setUserForm({
                      ...userForm,
                      secciones_todas: !userForm.secciones_todas,
                      secciones: userForm.secciones_todas ? userForm.secciones : [],
                    })
                  }
                >
                  Todas
                </button>
                {SECCIONES_SV_SORTED.map((s) => {
                  const on = userForm.secciones.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      className={`seq-choice${on ? ' is-on' : ''}`}
                      disabled={userForm.secciones_todas}
                      onClick={() =>
                        setUserForm({
                          ...userForm,
                          secciones: on
                            ? userForm.secciones.filter((x) => x !== s.id)
                            : [...userForm.secciones, s.id],
                        })
                      }
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </form>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(claveUnaVez)}
        onClose={() => setClaveUnaVez(null)}
        title="Contraseña temporal"
        description={`Copiala ahora y dásela a ${claveUnaVez?.quien ?? 'la persona'}. No se vuelve a mostrar.`}
        size="sm"
        dismissOnBackdrop={false}
        footer={
          <>
            <button
              type="button"
              className="btn secondary"
              onClick={() => {
                if (claveUnaVez) void navigator.clipboard.writeText(claveUnaVez.clave);
              }}
            >
              Copiar
            </button>
            <button type="button" className="btn primary" onClick={() => setClaveUnaVez(null)}>
              Listo
            </button>
          </>
        }
      >
        {claveUnaVez ? (
          <div className="field">
            <label htmlFor="usr-clave-tmp">Contraseña</label>
            <input id="usr-clave-tmp" readOnly value={claveUnaVez.clave} />
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
