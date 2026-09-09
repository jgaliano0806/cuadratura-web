export type PersonaLabel = {
  nombres?: string | null;
  apellido?: string | null;
  nombre_completo?: string | null;
  inspector?: string | null;
  legajo?: string | null;
  posicion_codigo?: string | null;
};

function nombreVisible(p: PersonaLabel): string {
  const ape = p.apellido?.trim();
  const nom = p.nombres?.trim();
  if (ape && nom) return `${ape}, ${nom}`;
  if (ape) return ape;
  if (nom) return nom;
  return (p.inspector || p.nombre_completo || p.posicion_codigo || '').trim();
}

function legajoVisible(legajo?: string | null): string | null {
  if (!legajo) return null;
  if (/^SV-GEN-/i.test(legajo)) return null;
  return legajo.trim() || null;
}

/** Apellido, Nombre (sin legajo). */
export function apellidoYNombre(p: PersonaLabel): string {
  return nombreVisible(p);
}

/** Legajo visible, o "—" si no hay / es sintético. */
export function legajoMostrar(legajo?: string | null): string {
  return legajoVisible(legajo) ?? '—';
}

/** Legajo - Apellido, Nombre. Omite códigos sintéticos SV-GEN. */
export function etiquetaPersona(p: PersonaLabel): string {
  const nom = apellidoYNombre(p);
  const leg = legajoVisible(p.legajo);
  return leg ? `${leg} - ${nom}` : nom;
}
