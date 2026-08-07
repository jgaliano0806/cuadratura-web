import { describe, expect, it } from 'vitest';
import {
  applyOperationalExceptions,
  advanceOneDay,
  createState,
  dayFromState,
  projectRange,
  type ProjectionInput,
  type ShiftCode,
} from './projection';

function baseInput(over: Partial<ProjectionInput> = {}): ProjectionInput {
  return {
    positionCode: 'GEN-012',
    positionId: 'pos-acosta',
    inspectorId: 'insp-acosta',
    inspectorName: 'Acosta',
    referenceDate: '2026-05-04',
    cyclePosition: 0,
    shift: 'M',
    mobile: 2,
    shiftIndex: 0,
    mobileIndex: 3, // 1→5→3→2
    shifts: ['M', 'N', 'T'],
    mobiles: [1, 5, 3, 2],
    completedBlocksOnMobile: 0,
    ...over,
  };
}

describe('motor de proyección', () => {
  it('reproduce el patrón Acosta: M2 N2 T2 M2 N1 T1…', () => {
    let state = createState(baseInput());
    const meta = {
      positionCode: 'GEN-012',
      positionId: 'pos-acosta',
      inspectorId: 'insp-acosta',
      inspectorName: 'Acosta',
    };

    const workCodes: string[] = [];
    // Simular varios bloques
    for (let i = 0; i < 96; i++) {
      const day = dayFromState(state, meta);
      if (day.dayType === 'TRABAJO' && day.cyclePosition === 0) {
        workCodes.push(day.code);
      }
      state = advanceOneDay(state);
    }

    expect(workCodes.slice(0, 8)).toEqual([
      'M2',
      'N2',
      'T2',
      'M2',
      'N1',
      'T1',
      'M1',
      'N1',
    ]);
    expect(workCodes.slice(8, 12)).toEqual(['T5', 'M5', 'N5', 'T5']);
  });

  it('CP-033: tramo documentado desde T2 (17/09) con móvil estable y cambio en N1', () => {
    // Estado al 17/09 = inicio bloque T2 (4.º bloque en móvil 2)
    const input = baseInput({
      referenceDate: '2026-09-17',
      cyclePosition: 0,
      shift: 'T',
      mobile: 2,
      shiftIndex: 2,
      mobileIndex: 3,
      completedBlocksOnMobile: 3, // M2 N2 T2 ya cerrados; este T/M es el 4.º en curso
    });
    // Ajuste: al 17/09 el ejemplo dice T2. Los 3 previos en móvil 2 fueron M N T;
    // el bloque T2 es el 3.º? Revisar ejemplo:
    // 17-21 T2, 25-29 M2, 3-7 N1 → tras T2 sigue M2 (mismo móvil), luego N1.
    // Entonces al iniciar T2 completedBlocksOnMobile debe ser 2 (M2,N2) no 3.
    const days = projectRange(
      {
        ...input,
        completedBlocksOnMobile: 2,
        shift: 'T',
        shiftIndex: 2,
      },
      '2026-09-17',
      '2026-10-07',
    );

    const byDate = Object.fromEntries(days.map((d) => [d.date, d.code]));
    expect(byDate['2026-09-17']).toBe('T2');
    expect(byDate['2026-09-21']).toBe('T2');
    expect(byDate['2026-09-22']).toBe('F');
    expect(byDate['2026-09-24']).toBe('F');
    expect(byDate['2026-09-25']).toBe('M2');
    expect(byDate['2026-09-29']).toBe('M2');
    expect(byDate['2026-09-30']).toBe('F');
    expect(byDate['2026-10-02']).toBe('F');
    expect(byDate['2026-10-03']).toBe('N1');
    expect(byDate['2026-10-07']).toBe('N1');
  });

  it('móvil 4 fijo no cambia de móvil al avanzar bloques', () => {
    let state = createState(
      baseInput({
        positionCode: 'M4-P01',
        shifts: ['M', 'N', 'T'],
        mobiles: [4],
        mobile: 4,
        mobileIndex: 0,
        shift: 'M',
        shiftIndex: 0,
        completedBlocksOnMobile: 0,
      }),
    );
    const codes: string[] = [];
    for (let i = 0; i < 64; i++) {
      if (state.cyclePosition === 0) {
        codes.push(`${state.shift}${state.mobile}`);
      }
      state = advanceOneDay(state);
    }
    expect(codes.every((c) => c.endsWith('4'))).toBe(true);
    expect(codes.slice(0, 4)).toEqual(['M4', 'N4', 'T4', 'M4']);
  });

  it('projectRange avanza desde el estado hasta el rango pedido', () => {
    const days = projectRange(
      baseInput({
        referenceDate: '2026-07-31',
        cyclePosition: 0,
        shift: 'T',
        mobile: 5,
        shiftIndex: 2,
        mobileIndex: 1,
        completedBlocksOnMobile: 3,
      }),
      '2026-08-01',
      '2026-08-10',
    );
    expect(days[0]?.date).toBe('2026-08-01');
    // 31/07 ciclo 0 T5 → 01-04 ciclo 1-4 T5, 05-07 F, 08 inicia nuevo bloque
    expect(days.find((d) => d.date === '2026-08-01')?.code).toBe('T5');
    expect(days.find((d) => d.date === '2026-08-04')?.code).toBe('T5');
    expect(days.find((d) => d.date === '2026-08-05')?.code).toBe('F');
    expect(days.find((d) => d.date === '2026-08-08')?.code).toBe('M3');
  });

  it.each([
    ['cambio temporal de móvil', { mobile: 4 }],
    ['cambio temporal de turno', { shift: 'T' as const }],
    ['licencia', { dayType: 'FRANCO' as const }],
  ])('%s no altera la secuencia base futura', (_name, override) => {
    const base = projectRange(baseInput(), '2026-05-04', '2026-05-20');
    const operational = applyOperationalExceptions(base, [
      { id: 'exception-1', inspectorId: 'insp-acosta', dateFrom: '2026-05-07', dateTo: '2026-05-08', ...override },
    ]);

    expect(operational.find((d) => d.date === '2026-05-07')?.operationalExceptionId).toBe('exception-1');
    expect(operational.find((d) => d.date === '2026-05-09')).toEqual(base.find((d) => d.date === '2026-05-09'));
    expect(operational.map((d) => [d.baseShift ?? d.shift, d.baseMobile ?? d.mobile])).toEqual(
      base.map((d) => [d.shift, d.mobile]),
    );
  });

  it('Haro–Ramos intercambian destino operativo sin intercambiar su cuadratura base', () => {
    const haro = projectRange(baseInput({ inspectorId: 'haro', mobile: 4, mobiles: [4], mobileIndex: 0 }), '2026-05-04', '2026-05-12');
    const ramos = projectRange(baseInput({ inspectorId: 'ramos', mobile: 5, mobiles: [5], mobileIndex: 0 }), '2026-05-04', '2026-05-12');
    const result = applyOperationalExceptions([...haro, ...ramos], [
      { id: 'haro-month', inspectorId: 'haro', dateFrom: '2026-05-09', dateTo: null, mobile: 5 },
      { id: 'ramos-month', inspectorId: 'ramos', dateFrom: '2026-05-09', dateTo: null, mobile: 4 },
    ]);

    expect(result.find((d) => d.inspectorId === 'haro' && d.date === '2026-05-12')?.baseMobile).toBe(4);
    expect(result.find((d) => d.inspectorId === 'ramos' && d.date === '2026-05-12')?.baseMobile).toBe(5);
  });
});

// silence unused import in case tree-shaking
void (null as unknown as ShiftCode);
