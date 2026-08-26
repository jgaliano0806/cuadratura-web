import { describe, expect, it } from 'vitest';
import {
  CUPO_POR_MOVIL,
  FRANJA,
  MOVIL_MANUAL,
  MOVIL_PAREJA,
  resolverSuperposiciones,
} from './desdoble';
import type { ProjectedDay, ShiftCode } from './projection';

function dia(
  inspector: string,
  date: string,
  shift: ShiftCode,
  mobile: number,
): ProjectedDay {
  return {
    date,
    positionCode: inspector,
    positionId: inspector,
    inspectorId: inspector,
    inspectorName: inspector,
    dayType: 'TRABAJO',
    shift,
    mobile,
    code: `${shift}${mobile}`,
    cyclePosition: 0,
  };
}

const nombresEn = (
  days: ProjectedDay[],
  date: string,
  mobile: number,
  shift: ShiftCode,
) =>
  days
    .filter(
      (d) => d.date === date && d.mobile === mobile && d.shift === shift,
    )
    .map((d) => d.inspectorName)
    .sort();

describe('desdoble por superposición', () => {
  it('no toca un móvil con dos inspectores: es reparto normal', () => {
    const days = [
      dia('Giuliani', '2026-06-01', 'N', 3),
      dia('Martinez F.', '2026-06-01', 'N', 3),
    ];
    const { desdobles, days: out } = resolverSuperposiciones(days);
    expect(desdobles).toEqual([]);
    expect(out.every((d) => d.mobile === 3)).toBe(true);
  });

  it('con tres mueve a uno al móvil de la misma franja', () => {
    const days = [
      dia('Lungrin', '2026-10-04', 'N', 3),
      dia('Zambrano M.', '2026-10-04', 'N', 3),
      dia('Bendayán', '2026-10-04', 'N', 3),
      dia('Gimenez P.', '2026-10-04', 'N', 5),
    ];
    const { days: out, desdobles } = resolverSuperposiciones(days);

    expect(desdobles).toHaveLength(1);
    expect(desdobles[0].estado).toBe('RESUELTO');
    expect(desdobles[0].movilOrigen).toBe(3);
    expect(desdobles[0].movilDestino).toBe(5);
    // Queda 2 y 2.
    expect(nombresEn(out, '2026-10-04', 3, 'N')).toHaveLength(2);
    expect(nombresEn(out, '2026-10-04', 5, 'N')).toHaveLength(2);
  });

  it('el turno no cambia nunca', () => {
    const days = [
      dia('A', '2026-10-04', 'T', 3),
      dia('B', '2026-10-04', 'T', 3),
      dia('C', '2026-10-04', 'T', 3),
    ];
    const { days: out } = resolverSuperposiciones(days);
    expect(out.every((d) => d.shift === 'T')).toBe(true);
  });

  it('conserva la cuadratura base del día movido', () => {
    const days = [
      dia('A', '2026-10-04', 'N', 3),
      dia('B', '2026-10-04', 'N', 3),
      dia('C', '2026-10-04', 'N', 3),
    ];
    const { days: out, desdobles } = resolverSuperposiciones(days);
    const movido = out.find((d) => d.inspectorName === desdobles[0].movido)!;
    // El overlay no borra de dónde venía: la secuencia sigue intacta.
    expect(movido.baseMobile).toBe(3);
    expect(movido.mobile).toBe(5);
  });

  it('reparte: al segundo triple le toca a otro', () => {
    const days = [
      // Primer triple — le toca a alguien.
      dia('Bendayán', '2026-10-04', 'N', 3),
      dia('Lungrin', '2026-10-04', 'N', 3),
      dia('Zambrano M.', '2026-10-04', 'N', 3),
      // Segundo triple, un mes después, con el mismo candidato disponible.
      dia('Bendayán', '2026-11-04', 'T', 3),
      dia('Almada', '2026-11-04', 'T', 3),
      dia('Gimenez P.', '2026-11-04', 'T', 3),
    ];
    const { desdobles } = resolverSuperposiciones(days);
    expect(desdobles).toHaveLength(2);
    // Quien ya fue movido en octubre no vuelve a caer en noviembre.
    expect(desdobles[1].movido).not.toBe(desdobles[0].movido);
  });

  it('sin destino disponible deja el triple y lo justifica', () => {
    const days = [
      dia('Gimenez P.', '2026-09-01', 'M', 1),
      dia('Martinez F.', '2026-09-01', 'M', 1),
      dia('Bendayán', '2026-09-01', 'M', 1),
      // La pareja (móvil 2) ya está llena.
      dia('Almada', '2026-09-01', 'M', 2),
      dia('Acosta', '2026-09-01', 'M', 2),
      // El móvil 4 tiene lugar, pero es manual.
      dia('Del Bel', '2026-09-01', 'M', 4),
    ];
    const { days: out, desdobles } = resolverSuperposiciones(days);

    expect(desdobles).toHaveLength(1);
    expect(desdobles[0].estado).toBe('SIN_DESTINO');
    expect(desdobles[0].movido).toBeNull();
    expect(desdobles[0].motivo).toContain('manualmente');
    // Nadie se movió: el triple sigue ahí para que lo resuelva una persona.
    expect(nombresEn(out, '2026-09-01', 1, 'M')).toHaveLength(3);
  });

  it('con cualquierMovilDelTurno usa otro móvil del mismo turno si la pareja está llena', () => {
    const days = [
      dia('Gimenez P.', '2026-09-01', 'M', 1),
      dia('Martinez F.', '2026-09-01', 'M', 1),
      dia('Bendayán', '2026-09-01', 'M', 1),
      dia('Almada', '2026-09-01', 'M', 2),
      dia('Acosta', '2026-09-01', 'M', 2),
      dia('Del Bel', '2026-09-01', 'M', 4),
    ];
    const { days: out, desdobles } = resolverSuperposiciones(days, {
      cualquierMovilDelTurno: true,
    });
    expect(desdobles[0].estado).toBe('RESUELTO');
    expect(desdobles[0].movilDestino).toBe(MOVIL_MANUAL);
    expect(nombresEn(out, '2026-09-01', 1, 'M')).toHaveLength(2);
    expect(nombresEn(out, '2026-09-01', 4, 'M')).toHaveLength(2);
  });

  it('con permitirMovil4 usa el móvil 4 como destino', () => {
    const days = [
      dia('Gimenez P.', '2026-09-01', 'M', 1),
      dia('Martinez F.', '2026-09-01', 'M', 1),
      dia('Bendayán', '2026-09-01', 'M', 1),
      dia('Almada', '2026-09-01', 'M', 2),
      dia('Acosta', '2026-09-01', 'M', 2),
      dia('Del Bel', '2026-09-01', 'M', 4),
    ];
    const { days: out, desdobles } = resolverSuperposiciones(days, {
      permitirMovil4: true,
    });
    expect(desdobles[0].estado).toBe('RESUELTO');
    expect(desdobles[0].movilDestino).toBe(MOVIL_MANUAL);
    expect(nombresEn(out, '2026-09-01', 1, 'M')).toHaveLength(2);
    expect(nombresEn(out, '2026-09-01', 4, 'M')).toHaveLength(2);
  });

  it('nunca cambia la hora de entrada, ni con cualquierMovilDelTurno', () => {
    // Móvil 1 con tres, y los demás de su franja (2 y 4) llenos. Los móviles 3
    // y 5 tienen lugar, pero entran a otra hora: no son destino válido.
    const days = [
      dia('A', '2026-09-01', 'M', 1),
      dia('B', '2026-09-01', 'M', 1),
      dia('C', '2026-09-01', 'M', 1),
      dia('D', '2026-09-01', 'M', 2),
      dia('E', '2026-09-01', 'M', 2),
      dia('F', '2026-09-01', 'M', 4),
      dia('G', '2026-09-01', 'M', 4),
      dia('H', '2026-09-01', 'M', 3), // franja tardía, con lugar
      dia('I', '2026-09-01', 'M', 5), // franja tardía, con lugar
    ];
    const { days: out, desdobles } = resolverSuperposiciones(days, {
      cualquierMovilDelTurno: true,
    });

    expect(desdobles).toHaveLength(1);
    expect(desdobles[0].estado).toBe('SIN_DESTINO');
    // Los tres siguen en el móvil 1: nadie fue mandado a otra franja.
    expect(nombresEn(out, '2026-09-01', 1, 'M')).toHaveLength(3);
    expect(nombresEn(out, '2026-09-01', 3, 'M')).toHaveLength(1);
    expect(nombresEn(out, '2026-09-01', 5, 'M')).toHaveLength(1);
  });

  it('ningún desdoble resuelto cruza de franja horaria', () => {
    const days = [
      dia('A', '2026-09-01', 'T', 3),
      dia('B', '2026-09-01', 'T', 3),
      dia('C', '2026-09-01', 'T', 3),
      dia('D', '2026-09-01', 'T', 1),
    ];
    const { desdobles } = resolverSuperposiciones(days, {
      cualquierMovilDelTurno: true,
      permitirMovil4: true,
    });
    for (const d of desdobles) {
      if (d.estado !== 'RESUELTO' || d.movilDestino === null) continue;
      expect(FRANJA[d.movilDestino]).toBe(FRANJA[d.movilOrigen]);
    }
  });

  it('cada motivo explica el movimiento y por qué esa persona', () => {
    const days = [
      dia('A', '2026-10-04', 'N', 3),
      dia('B', '2026-10-04', 'N', 3),
      dia('C', '2026-10-04', 'N', 3),
    ];
    const { desdobles } = resolverSuperposiciones(days);
    const motivo = desdobles[0].motivo;
    expect(motivo).toContain('Tres inspectores');
    expect(motivo).toContain('mismo horario');
    expect(motivo).toContain(desdobles[0].movido!);
    expect(motivo).toContain('no se altera');
  });

  it('el resultado es determinístico', () => {
    const build = () => [
      dia('Lungrin', '2026-10-04', 'N', 3),
      dia('Zambrano M.', '2026-10-04', 'N', 3),
      dia('Bendayán', '2026-10-04', 'N', 3),
    ];
    const a = resolverSuperposiciones(build()).desdobles[0].movido;
    const b = resolverSuperposiciones(build()).desdobles[0].movido;
    expect(a).toBe(b);
  });

  it('los destinos comparten franja horaria y el cupo es 2', () => {
    for (const [origen, destino] of Object.entries(MOVIL_PAREJA)) {
      expect(FRANJA[Number(origen)]).toBe(FRANJA[destino]);
    }
    expect(FRANJA[MOVIL_MANUAL]).toBe(FRANJA[1]);
    expect(CUPO_POR_MOVIL).toBe(2);
  });
});
