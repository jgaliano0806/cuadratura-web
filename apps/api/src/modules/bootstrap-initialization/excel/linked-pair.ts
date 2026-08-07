import type { Issue, LinkedPair, ParsedInspector } from './models';

/**
 * RN-032 / CA-032-07: única dupla vinculada de la configuración inicial.
 * No se inventan otras duplas por coincidencias parciales (CA-032-08).
 */
export const OFFICIAL_LINKED_PAIR = {
  keys: ['haro', 'ramos g'] as const,
  groupCode: 'GRV-M4-P03',
  mobile4Position: 'M4-P03',
  externalPosition: 'M4-P03-EXT',
  restGroup: 'GF-M4-P03',
  cycleOffset: 3,
  externalMobileSequence: [5, 3, 2, 1] as const,
} as const;

function findOfficialMembers(inspectors: ParsedInspector[]) {
  const byKey = new Map(inspectors.map((i) => [i.nameKey, i]));
  return OFFICIAL_LINKED_PAIR.keys.map((key) => byKey.get(key));
}

/**
 * RN-032: resuelve únicamente Haro–Ramos G.
 * Valida igualdad de turnos/francos y alternancia móvil 4 / externo.
 */
export function detectLinkedPairs(inspectors: ParsedInspector[]): {
  pairs: LinkedPair[];
  issues: Issue[];
} {
  const issues: Issue[] = [];
  const members = findOfficialMembers(inspectors);

  if (members.some((m) => !m)) {
    const byKey = new Map(inspectors.map((i) => [i.nameKey, i]));
    const missing = OFFICIAL_LINKED_PAIR.keys.filter((key) => !byKey.has(key));
    issues.push({
      severity: 'ERROR',
      code: 'DUPLA_OFICIAL_AUSENTE',
      detail: `RN-032 exige la dupla Haro–Ramos G.; no se encontraron: ${missing.join(', ')}`,
    });
    return { pairs: [], issues };
  }

  const [first, second] = members as [ParsedInspector, ParsedInspector];
  const secondMap = new Map(first.days.map((d) => [d.date, d]));
  let comparable = 0;
  let valid = 0;
  let violations = 0;

  for (const day of second.days) {
    const other = secondMap.get(day.date);
    if (!other || day.isNovelty || other.isNovelty) continue;
    comparable += 1;
    if (day.dayType === 'FRANCO' && other.dayType === 'FRANCO') {
      valid += 1;
      continue;
    }
    if (
      day.dayType === 'TRABAJO' &&
      other.dayType === 'TRABAJO' &&
      day.shift === other.shift &&
      (day.mobile === 4) !== (other.mobile === 4)
    ) {
      valid += 1;
      continue;
    }
    violations += 1;
  }

  if (comparable === 0) {
    issues.push({
      severity: 'ERROR',
      code: 'DUPLA_SIN_DIAS_COMPARABLES',
      detail:
        'Haro y Ramos G. no tienen días comparables (sin novedad) en el tramo de inicialización',
    });
    return { pairs: [], issues };
  }

  if (violations > 0) {
    issues.push({
      severity: 'ERROR',
      code: 'DUPLA_REGLA_INCUMPLIDA',
      detail: `RN-032: Haro–Ramos G. deben compartir turnos/francos y alternar móvil 4/externo. Violaciones: ${violations} de ${comparable} días comparables.`,
    });
    return { pairs: [], issues };
  }

  issues.push({
    severity: 'ADVERTENCIA',
    code: 'DUPLA_OFICIAL_CONFIRMADA',
    detail: `RN-032: dupla única Haro–Ramos G. validada (${valid} días; ${OFFICIAL_LINKED_PAIR.groupCode}; externo ${OFFICIAL_LINKED_PAIR.externalMobileSequence.join('→')}).`,
  });

  return {
    pairs: [
      {
        first: first.name,
        second: second.name,
        comparable_days: comparable,
      },
    ],
    issues,
  };
}

/** Asigna M4-P03 / M4-P03-EXT según quién ocupa el móvil 4 en el último día comparable. */
export function applyOfficialLinkedPairRoles(
  inspectors: ParsedInspector[],
  pair: LinkedPair,
  originIsoAnchor: string,
): boolean {
  const members = inspectors.filter((i) =>
    [pair.first, pair.second].includes(i.name),
  );
  if (members.length !== 2) return false;

  for (const member of members) {
    member.cycleOffset = OFFICIAL_LINKED_PAIR.cycleOffset;
    member.anchorDate = originIsoAnchor;
    member.restGroupCode = OFFICIAL_LINKED_PAIR.restGroup;
    member.linkedGroupCode = OFFICIAL_LINKED_PAIR.groupCode;
  }

  const commonDates = [
    ...new Set(
      members[0].days
        .map((d) => d.date)
        .filter((d) => members[1].days.some((x) => x.date === d)),
    ),
  ]
    .sort()
    .reverse();

  let currentM4: ParsedInspector | null = null;
  for (const currentDate of commonDates) {
    const d1 = members[0].days.find((d) => d.date === currentDate)!;
    const d2 = members[1].days.find((d) => d.date === currentDate)!;
    if (
      d1.dayType === 'TRABAJO' &&
      d2.dayType === 'TRABAJO' &&
      (d1.mobile === 4) !== (d2.mobile === 4)
    ) {
      currentM4 = d1.mobile === 4 ? members[0] : members[1];
      break;
    }
  }
  if (!currentM4) return false;

  const external = currentM4 === members[0] ? members[1] : members[0];

  currentM4.positionCode = OFFICIAL_LINKED_PAIR.mobile4Position;
  currentM4.positionType = 'MOVIL4';
  currentM4.profileCode = 'MOVIL4_FIJO';
  currentM4.linkedRole = 'MOVIL4';

  external.positionCode = OFFICIAL_LINKED_PAIR.externalPosition;
  external.positionType = 'VINCULADA';
  external.profileCode = 'VINCULADA_EXTERNA';
  external.linkedRole = 'MOVIL_EXTERNO';
  return true;
}

export function isOfficialLinkedMember(inspector: ParsedInspector): boolean {
  return (OFFICIAL_LINKED_PAIR.keys as readonly string[]).includes(
    inspector.nameKey,
  );
}
