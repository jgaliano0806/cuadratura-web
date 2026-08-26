import { describe, expect, it } from 'vitest';
import {
  calcularOcupacion,
  estadoDe,
  resumenPorDia,
  resumenPorMovil,
  slotsConProblema,
  MOVILES_OPERATIVOS,
} from './ocupacion';
import { resolverSuperposiciones } from './desdoble';
import type { ProjectedDay, ShiftCode } from './projection';

function dia(
  date: string,
  inspector: string,
  code: string | null,
): ProjectedDay {
  const trabaja = code !== null;
  const shift = trabaja ? (code[0] as ShiftCode) : null;
  const mobile = trabaja ? Number(code[1]) : null;
  return {
    date,
    positionCode: inspector,
    positionId: inspector,
    inspectorId: inspector,
    inspectorName: inspector,
    dayType: trabaja ? 'TRABAJO' : 'FRANCO',
    shift,
    mobile,
    code: code ?? 'F',
    cyclePosition: trabaja ? 0 : 5,
  };
}

describe('estadoDe', () => {
  it('clasifica según cuánta gente hay en el móvil', () => {
    expect(estadoDe(0)).toBe('HUECO');
    expect(estadoDe(1)).toBe('CUBIERTA');
    expect(estadoDe(2)).toBe('DOBLE');
    expect(estadoDe(3)).toBe('SUPERPUESTA');
    expect(estadoDe(4)).toBe('SUPERPUESTA');
  });
});

describe('calcularOcupacion', () => {
  it('cuenta los inspectores de cada móvil, turno y día', () => {
    const days = [
      dia('2026-06-01', 'Acosta', 'M1'),
      dia('2026-06-01', 'Grandi', 'M1'),
      dia('2026-06-01', 'Tejada', 'T3'),
      dia('2026-06-01', 'Lungrin', null),
    ];
    const slots = calcularOcupacion(days);

    const m1 = slots.find((s) => s.movil === 1 && s.turno === 'M')!;
    expect(m1.cantidad).toBe(2);
    expect(m1.inspectores).toEqual(['Acosta', 'Grandi']);
    expect(m1.estado).toBe('DOBLE');

    const t3 = slots.find((s) => s.movil === 3 && s.turno === 'T')!;
    expect(t3.inspectores).toEqual(['Tejada']);
    expect(t3.estado).toBe('CUBIERTA');
  });

  it('devuelve también los slots vacíos: un hueco es información', () => {
    const slots = calcularOcupacion([dia('2026-06-01', 'Acosta', 'M1')]);
    // 5 móviles × 3 turnos, aunque solo uno tenga gente.
    expect(slots).toHaveLength(MOVILES_OPERATIVOS.length * 3);
    expect(slots.filter((s) => s.estado === 'HUECO')).toHaveLength(14);
  });

  it('no cuenta francos como ocupación', () => {
    const slots = calcularOcupacion([
      dia('2026-06-01', 'Acosta', null),
      dia('2026-06-01', 'Grandi', null),
    ]);
    expect(slots.every((s) => s.cantidad === 0)).toBe(true);
  });

  it('marca la franja horaria de cada móvil', () => {
    const slots = calcularOcupacion([dia('2026-06-01', 'Acosta', 'M1')]);
    const franjas = new Map(slots.map((s) => [s.movil, s.franja]));
    expect(franjas.get(1)).toBe('TEMPRANA');
    expect(franjas.get(2)).toBe('TEMPRANA');
    expect(franjas.get(4)).toBe('TEMPRANA');
    expect(franjas.get(3)).toBe('TARDIA');
    expect(franjas.get(5)).toBe('TARDIA');
  });

  it('detecta la superposición de tres', () => {
    const days = [
      dia('2026-06-01', 'Acosta', 'T3'),
      dia('2026-06-01', 'Grandi', 'T3'),
      dia('2026-06-01', 'Tejada', 'T3'),
    ];
    const slot = calcularOcupacion(days).find(
      (s) => s.movil === 3 && s.turno === 'T',
    )!;
    expect(slot.estado).toBe('SUPERPUESTA');
    expect(slot.cantidad).toBe(3);
  });
});

describe('resumenPorDia', () => {
  it('separa trabajando de franco y cuenta huecos', () => {
    const days = [
      dia('2026-06-01', 'Acosta', 'M1'),
      dia('2026-06-01', 'Grandi', 'T3'),
      dia('2026-06-01', 'Tejada', null),
    ];
    const [fila] = resumenPorDia(days);
    expect(fila.date).toBe('2026-06-01');
    expect(fila.trabajando).toBe(2);
    expect(fila.franco).toBe(1);
    expect(fila.huecos).toBe(13); // 15 slots menos los 2 cubiertos
    expect(fila.superpuestos).toBe(0);
  });

  it('devuelve una fila por día, ordenadas', () => {
    const days = [
      dia('2026-06-02', 'Acosta', 'M1'),
      dia('2026-06-01', 'Acosta', 'M1'),
    ];
    expect(resumenPorDia(days).map((f) => f.date)).toEqual([
      '2026-06-01',
      '2026-06-02',
    ]);
  });
});

describe('resumenPorMovil', () => {
  it('totaliza los estados de cada móvil en el rango', () => {
    const days = [
      dia('2026-06-01', 'Acosta', 'M1'),
      dia('2026-06-02', 'Acosta', 'M1'),
      dia('2026-06-02', 'Grandi', 'M1'),
    ];
    const filas = resumenPorMovil(calcularOcupacion(days));
    const m1 = filas.find((f) => f.movil === 1)!;
    expect(m1.cubiertas).toBe(1); // 01/06 turno M
    expect(m1.dobles).toBe(1); // 02/06 turno M
    expect(filas.map((f) => f.movil)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('slotsConProblema', () => {
  it('deja pasar huecos y superposiciones, no los repartos normales', () => {
    const days = [
      dia('2026-06-01', 'Acosta', 'T3'),
      dia('2026-06-01', 'Grandi', 'T3'),
      dia('2026-06-01', 'Tejada', 'T3'),
      dia('2026-06-01', 'Lungrin', 'M1'),
      dia('2026-06-01', 'Garate', 'M1'),
    ];
    const problemas = slotsConProblema(calcularOcupacion(days));
    // El M1 con dos no es problema; el T3 con tres sí.
    expect(problemas.some((s) => s.movil === 1 && s.turno === 'M')).toBe(false);
    expect(problemas.some((s) => s.movil === 3 && s.turno === 'T')).toBe(true);
  });
});

describe('ocupación después del desdoble', () => {
  it('el desdoble convierte la superposición en dos repartos normales', () => {
    const days = [
      dia('2026-06-01', 'Acosta', 'T3'),
      dia('2026-06-01', 'Grandi', 'T3'),
      dia('2026-06-01', 'Tejada', 'T3'),
    ];

    const antes = calcularOcupacion(days);
    expect(
      antes.find((s) => s.movil === 3 && s.turno === 'T')!.estado,
    ).toBe('SUPERPUESTA');
    expect(antes.find((s) => s.movil === 5 && s.turno === 'T')!.estado).toBe(
      'HUECO',
    );

    const { days: resueltos, desdobles } = resolverSuperposiciones(days);
    const despues = calcularOcupacion(resueltos);

    expect(desdobles).toHaveLength(1);
    expect(desdobles[0].movilDestino).toBe(5);
    expect(despues.find((s) => s.movil === 3 && s.turno === 'T')!.estado).toBe(
      'DOBLE',
    );
    expect(despues.find((s) => s.movil === 5 && s.turno === 'T')!.estado).toBe(
      'CUBIERTA',
    );
    expect(slotsConProblema(despues)).toHaveLength(
      slotsConProblema(antes).length - 2, // se fue la superposición y el hueco
    );
  });
});
