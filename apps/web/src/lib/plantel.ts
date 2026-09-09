export const AMBITOS = [
  { id: 'sv', label: 'Seguridad vial' },
  { id: 'peajes', label: 'Peajes' },
] as const;

export type AmbitoId = (typeof AMBITOS)[number]['id'];

const PEAJES = [
  { id: 'ruta-20', label: 'R. 20', title: 'Ruta 20' },
  { id: 'ruta-e53', label: 'R. E53', title: 'Ruta E53' },
  { id: 'ruta-e55', label: 'R. E55', title: 'Ruta E55' },
  { id: 'ruta-5', label: 'R. 5', title: 'Ruta 5' },
  { id: 'apc', label: 'APC', title: 'APC' },
  { id: 'ruta-9-norte', label: 'R. 9 Norte', title: 'Ruta 9 Norte' },
  { id: 'ruta-36', label: 'R. 36', title: 'Ruta 36' },
  { id: 'ruta-19', label: 'R. 19', title: 'Ruta 19' },
  { id: 'autovia-punilla', label: 'Autovía Punilla', title: 'Autovía Punilla' },
  { id: 'ruta-36-arroyo-tegua', label: 'R. 36 Arroyo Tegua', title: 'Ruta 36 Arroyo Tegua' },
  { id: 'ruta-36-piedras-moras', label: 'R. 36 Piedras Moras', title: 'Ruta 36 Piedras Moras' },
  { id: 'autovia-calamuchita', label: 'Autovía Calamuchita', title: 'Autovía Calamuchita' },
  { id: 'ruta-2jc', label: 'R. 2JC', title: 'Ruta 2JC' },
  { id: 'ruta-9-sur', label: 'R. 9 Sur', title: 'Ruta 9 Sur' },
] as const;

export const PLANTELES = [
  { id: 'epi', label: 'E.P.I.', title: 'E.P.I.', ready: false, ambito: 'sv' },
  { id: 'inspectores', label: 'Inspectores', title: 'Inspectores', ready: true, ambito: 'sv' },
  { id: 'bo', label: 'Operador B.O.', title: 'Operador B.O.', ready: false, ambito: 'sv' },
  ...PEAJES.map((p) => ({ ...p, ready: false as const, ambito: 'peajes' as const })),
] as const;

export type PlantelId = (typeof PLANTELES)[number]['id'];

export const PLANTEL_AMBITO: Record<PlantelId, 'SEGURIDAD_VIAL' | 'BASE_OPERACIONES' | null> = {
  epi: 'SEGURIDAD_VIAL',
  inspectores: 'SEGURIDAD_VIAL',
  bo: 'BASE_OPERACIONES',
  'ruta-20': null,
  'ruta-e53': null,
  'ruta-e55': null,
  'ruta-5': null,
  apc: null,
  'ruta-9-norte': null,
  'ruta-36': null,
  'ruta-19': null,
  'autovia-punilla': null,
  'ruta-36-arroyo-tegua': null,
  'ruta-36-piedras-moras': null,
  'autovia-calamuchita': null,
  'ruta-2jc': null,
  'ruta-9-sur': null,
};

export function etiquetaPersonas(id: PlantelId): string {
  const p = PLANTELES.find((x) => x.id === id);
  if (!p) return 'Inspectores';
  if (p.ambito === 'peajes') return 'Peajistas';
  if (p.id === 'bo') return 'Operarios';
  return 'Inspectores';
}

const SECCIONES_BASE = [
  { id: 'APC', label: 'APC', plantel: 'apc', grupo: 'Peajes' },
  { id: 'AUTOVIA_CALAMUCHITA', label: 'Autovía Calamuchita', plantel: 'autovia-calamuchita', grupo: 'Peajes' },
  { id: 'AUTOVIA_PUNILLA', label: 'Autovía Punilla', plantel: 'autovia-punilla', grupo: 'Peajes' },
  { id: 'BO', label: 'Base de Operaciones', plantel: 'bo', grupo: 'Seguridad Vial' },
  { id: 'EPI', label: 'E.P.I.', plantel: 'epi', grupo: 'Seguridad Vial' },
  { id: 'MOVILES', label: 'Móviles (SV)', plantel: 'inspectores', grupo: 'Seguridad Vial' },
  { id: 'RUTA_19', label: 'Ruta 19', plantel: 'ruta-19', grupo: 'Peajes' },
  { id: 'RUTA_20', label: 'Ruta 20', plantel: 'ruta-20', grupo: 'Peajes' },
  { id: 'RUTA_2JC', label: 'Ruta 2JC', plantel: 'ruta-2jc', grupo: 'Peajes' },
  { id: 'RUTA_36', label: 'Ruta 36', plantel: 'ruta-36', grupo: 'Peajes' },
  { id: 'RUTA_36_ARROYO_TEGUA', label: 'Ruta 36 Arroyo Tegua', plantel: 'ruta-36-arroyo-tegua', grupo: 'Peajes' },
  { id: 'RUTA_36_PIEDRAS_MORAS', label: 'Ruta 36 Piedras Moras', plantel: 'ruta-36-piedras-moras', grupo: 'Peajes' },
  { id: 'RUTA_5', label: 'Ruta 5', plantel: 'ruta-5', grupo: 'Peajes' },
  { id: 'RUTA_9_NORTE', label: 'Ruta 9 Norte', plantel: 'ruta-9-norte', grupo: 'Peajes' },
  { id: 'RUTA_9_SUR', label: 'Ruta 9 Sur', plantel: 'ruta-9-sur', grupo: 'Peajes' },
  { id: 'RUTA_E53', label: 'Ruta E53', plantel: 'ruta-e53', grupo: 'Peajes' },
  { id: 'RUTA_E55', label: 'Ruta E55', plantel: 'ruta-e55', grupo: 'Peajes' },
] as const;

export const SECCIONES_SV = SECCIONES_BASE;
export const SECCIONES_SV_SORTED = [...SECCIONES_BASE].sort((a, b) =>
  a.grupo !== b.grupo
    ? a.grupo.localeCompare(b.grupo, 'es')
    : a.label.localeCompare(b.label, 'es'),
);

export type SeccionSv = (typeof SECCIONES_BASE)[number]['id'];

export function seccionDePlantel(id: PlantelId): SeccionSv | null {
  return SECCIONES_BASE.find((s) => s.plantel === id)?.id ?? null;
}

export function plantelDeSeccion(id: SeccionSv): PlantelId {
  return (SECCIONES_BASE.find((s) => s.id === id)?.plantel as PlantelId | undefined) ?? 'inspectores';
}

export function etiquetaSeccion(id: string | null | undefined): string {
  return SECCIONES_BASE.find((s) => s.id === id)?.label ?? id ?? 'Móviles';
}

export function esSeccionPeaje(id: string | null | undefined): boolean {
  return SECCIONES_BASE.find((s) => s.id === id)?.grupo === 'Peajes';
}

/** Una persona (consola, ficha). */
export function etiquetaPersonaRol(id: PlantelId): string {
  const p = PLANTELES.find((x) => x.id === id);
  if (!p) return 'Inspector';
  if (p.ambito === 'peajes') return 'Peajista';
  if (p.id === 'bo') return 'Operario';
  if (p.id === 'epi') return 'Persona E.P.I.';
  return 'Inspector';
}

export function etiquetaRolSeccion(seccion: string | null | undefined): string {
  if (esSeccionPeaje(seccion)) return 'peajista';
  if (seccion === 'BO') return 'operario';
  if (seccion === 'EPI') return 'persona E.P.I.';
  return 'inspector';
}

export function plantelListo(id: PlantelId): boolean {
  return PLANTELES.find((p) => p.id === id)?.ready === true;
}

export function plantelesDe(ambito: AmbitoId) {
  return PLANTELES.filter((p) => p.ambito === ambito);
}

export function plantelPorDefecto(
  ambito: AmbitoId,
  permitidos?: readonly PlantelId[],
): PlantelId {
  const lista = plantelesDe(ambito).filter(
    (p) => !permitidos || permitidos.includes(p.id),
  );
  return lista.find((p) => p.ready)?.id ?? lista[0]?.id ?? permitidos?.[0] ?? 'inspectores';
}

export function parseAmbito(
  value: string | null | undefined,
  plantel?: string | null,
): AmbitoId {
  if (value === 'sv' || value === 'peajes') return value;
  if (value === 'bo') return 'sv';
  const primero = (plantel ?? '').split(',')[0]?.trim();
  if (primero && PLANTELES.some((p) => p.id === primero && p.ambito === 'peajes')) {
    return 'peajes';
  }
  return 'sv';
}

export function parsePlantel(
  value: string | null | undefined,
  ambito?: AmbitoId,
  permitidos?: readonly PlantelId[],
): PlantelId {
  const primero = (value ?? '').split(',')[0]?.trim();
  const raw = PLANTELES.find((p) => p.id === primero)?.id ?? null;
  const zona = ambito ?? (raw ? PLANTELES.find((p) => p.id === raw)!.ambito : 'sv');
  const delAmbito = plantelesDe(zona).filter(
    (p) => !permitidos || permitidos.includes(p.id),
  );
  if (raw && delAmbito.some((p) => p.id === raw)) return raw;
  const listo = delAmbito.find((p) => p.ready);
  return listo?.id ?? delAmbito[0]?.id ?? permitidos?.[0] ?? 'inspectores';
}

export function parsePlanteles(
  value: string | null | undefined,
  ambito: AmbitoId,
  permitidos?: readonly PlantelId[],
): PlantelId[] {
  const validos = new Set(
    plantelesDe(ambito)
      .map((p) => p.id)
      .filter((id) => !permitidos || permitidos.includes(id)),
  );
  const ids: PlantelId[] = [];
  for (const raw of (value ?? '').split(',')) {
    const id = raw.trim() as PlantelId;
    if (!validos.has(id) || ids.includes(id)) continue;
    ids.push(id);
  }
  if (ids.length) return ids;
  const def = plantelPorDefecto(ambito, permitidos);
  return validos.has(def) ? [def] : permitidos?.length ? [permitidos[0]] : [];
}

export function seccionesDePlanteles(ids: PlantelId[]): SeccionSv[] {
  const out: SeccionSv[] = [];
  for (const id of ids) {
    const s = seccionDePlantel(id);
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}

export function plantelesDelAlcance(alcance: {
  seccionesTodas?: boolean;
  secciones?: string[];
}): PlantelId[] {
  if (alcance.seccionesTodas) return PLANTELES.map((p) => p.id);
  const set = new Set(alcance.secciones ?? []);
  return PLANTELES.filter((p) => {
    const s = seccionDePlantel(p.id);
    return s != null && set.has(s);
  }).map((p) => p.id);
}

export function ambitosDelAlcance(alcance: {
  seccionesTodas?: boolean;
  secciones?: string[];
}): AmbitoId[] {
  const ids = new Set(
    plantelesDelAlcance(alcance).map((id) => PLANTELES.find((p) => p.id === id)!.ambito),
  );
  return AMBITOS.map((a) => a.id).filter((id) => ids.has(id));
}
