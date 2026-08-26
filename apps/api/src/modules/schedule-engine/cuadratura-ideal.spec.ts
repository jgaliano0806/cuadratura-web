/**
 * Regresión del motor contra la cuadratura ideal jun–ago 2026.
 *
 * Este fixture existe porque la cadencia del móvil se infirió mal dos veces,
 * las dos por validar sobre ventanas de ~3 meses: 4 bloques son 32 días y un
 * mes son ~30,4, así que ambas reglas coinciden al principio y divergen recién
 * cuando se acumula la deriva.
 *
 * La ideal contiene los tramos que rompen la hipótesis equivocada: Carletto G.
 * y Sandoval tienen móviles que duran 3 bloques, no 4, y el cambio cae en el
 * primer bloque del mes. Si alguien vuelve a poner una cadencia por conteo de
 * bloques, estos casos fallan.
 */
import { describe, expect, it } from 'vitest';
import { projectRange, type ProjectionInput, type ShiftCode } from './projection';
import fixture from './__fixtures__/cuadratura-ideal-2026.json';

type FixtureInspector = {
  anchor: { date: string; shift: ShiftCode; mobile: number };
  days: Record<string, string>;
};

const { from: RANGE_FROM, to: RANGE_TO } = fixture.range;

/**
 * El fixture ya es la ideal depurada: se corrigieron las 12 celdas donde la
 * planilla original se apartaba de la cuadratura base — ver `corrections` en el
 * JSON. Ninguna resolvía una superposición de 3 inspectores y seis además le
 * cambiaban la franja horaria de entrada al inspector.
 *
 * Por eso la lista está vacía: el motor debe reproducir el fixture celda por
 * celda. Si aparece una diferencia, es un problema real y el test la muestra.
 */
const ANOMALIAS_PLANILLA = new Set<string>();

function inputFor(
  name: string,
  data: FixtureInspector,
  mobiles: number[],
): ProjectionInput {
  return {
    positionCode: name,
    positionId: name,
    inspectorId: name,
    inspectorName: name,
    referenceDate: data.anchor.date,
    cyclePosition: 0, // el ancla del fixture es siempre inicio de bloque
    shift: data.anchor.shift,
    mobile: data.anchor.mobile,
    shiftIndex: ['M', 'N', 'T'].indexOf(data.anchor.shift),
    mobileIndex: mobiles.indexOf(data.anchor.mobile),
    shifts: ['M', 'N', 'T'],
    mobiles,
    completedBlocksOnMobile: 0,
  };
}

/** Compara solo días de TRABAJO: los francos ya los cubre el ciclo 5×3. */
function compare(name: string, data: FixtureInspector, mobiles: number[]) {
  const projected = projectRange(
    inputFor(name, data, mobiles),
    data.anchor.date,
    RANGE_TO,
  );
  const byDate = new Map(projected.map((d) => [d.date, d.code]));

  const mismatches: string[] = [];
  const anomaliasVistas: string[] = [];
  let comparable = 0;

  for (const [date, expected] of Object.entries(data.days)) {
    if (!/^[MTN][1-7]$/.test(expected)) continue; // ausencias y francos fuera
    if (date < data.anchor.date) continue;
    comparable += 1;
    const actual = byDate.get(date);
    if (actual === expected) continue;

    if (ANOMALIAS_PLANILLA.has(`${name}|${date}`)) {
      anomaliasVistas.push(`${date}: planilla ${expected}, motor ${actual}`);
    } else {
      mismatches.push(`${date}: esperado ${expected}, obtenido ${actual}`);
    }
  }
  return { comparable, mismatches, anomaliasVistas };
}

describe(`cuadratura ideal ${RANGE_FROM} → ${RANGE_TO}`, () => {
  describe('Córdoba — móvil rotativo con cadencia mensual', () => {
    const group = fixture.groups.cordoba_rotativos;
    const mobiles = group.mobiles as number[];
    const inspectors = Object.entries(
      group.inspectors as Record<string, FixtureInspector>,
    );

    it('cubre los 21 rotativos', () => {
      expect(inspectors.length).toBe(21);
    });

    it.each(inspectors)('%s reproduce la ideal exactamente', (name, data) => {
      const { comparable, mismatches } = compare(name, data, mobiles);
      expect(comparable).toBeGreaterThan(0);
      // Sin tolerancia: fuera de las anomalías documentadas, el motor clava la
      // cuadratura base celda por celda.
      expect(mismatches, mismatches.join('\n')).toEqual([]);
    });

    it('el conjunto reproduce la cuadratura base al 100%', () => {
      let total = 0;
      let wrong = 0;
      let anomalias = 0;
      const rows: Array<{
        Inspector: string;
        Accuracy: string;
        Difieren: number;
        'Anomalías planilla': number;
      }> = [];

      for (const [name, data] of inspectors) {
        const { comparable, mismatches, anomaliasVistas } = compare(
          name,
          data,
          mobiles,
        );
        total += comparable;
        wrong += mismatches.length;
        anomalias += anomaliasVistas.length;
        rows.push({
          Inspector: name,
          Accuracy:
            (((comparable - mismatches.length) / comparable) * 100).toFixed(1) +
            '%',
          Difieren: mismatches.length,
          'Anomalías planilla': anomaliasVistas.length,
        });
      }

      const accuracy = ((total - wrong) / total) * 100;

      // Reporte visible: `npx vitest run cuadratura-ideal` muestra el número,
      // no solo el pass/fail. Sirve para comparar motores tras un cambio.
      rows.sort((a, b) => a.Inspector.localeCompare(b.Inspector));
      console.table(rows);
      console.log(
        `Córdoba rotativos — accuracy ${accuracy.toFixed(1)}% ` +
          `(${total - wrong}/${total} celdas de trabajo). ` +
          `Anomalías conocidas de la planilla: ${anomalias}.`,
      );

      expect(accuracy).toBe(100);
      expect(anomalias).toBe(ANOMALIAS_PLANILLA.size);
    });

    it('Carletto G. cambia de móvil en el primer bloque del mes, no cada 4 bloques', () => {
      const data = (
        group.inspectors as Record<string, FixtureInspector>
      )['Carletto G.'];
      const { mismatches } = compare('Carletto G.', data, mobiles);
      // Su móvil 3 dura 3 bloques: una cadencia por conteo de bloques falla acá.
      expect(mismatches).toEqual([]);
    });
  });

  describe('franja horaria — la rotación y el desdoble deben respetarla', () => {
    /**
     * Dentro de cada turno hay dos franjas (RPASV002):
     *   móviles 1, 2 y 4 → entrada temprana   (M 05–13, T 13–21, N 21–05)
     *   móviles 3 y 5    → entrada tardía     (M 07–15, T 15–23, N 23–07)
     * Un inspector no puede cambiar de franja de un día para el otro: el
     * desdoble solo puede mandarlo al móvil que comparte su horario.
     */
    const FRANJA: Record<number, 'TEMPRANA' | 'TARDIA'> = {
      1: 'TEMPRANA',
      2: 'TEMPRANA',
      4: 'TEMPRANA',
      3: 'TARDIA',
      5: 'TARDIA',
    };
    /** Único destino válido para un desdoble, por franja compartida. */
    const PAREJA: Record<number, number> = { 1: 2, 2: 1, 3: 5, 5: 3 };

    it('cada pareja de desdoble comparte la franja horaria', () => {
      for (const [origen, destino] of Object.entries(PAREJA)) {
        expect(FRANJA[Number(origen)]).toBe(FRANJA[destino]);
      }
    });

    it('el ciclo 5→3→2→1 reparte las franjas en partes iguales', () => {
      const ciclo = fixture.groups.cordoba_rotativos.mobiles as number[];
      const franjas = ciclo.map((m) => FRANJA[m]);
      expect(franjas.filter((f) => f === 'TARDIA')).toHaveLength(2);
      expect(franjas.filter((f) => f === 'TEMPRANA')).toHaveLength(2);
    });

    it('ninguna celda del fixture depurado cruza de franja', () => {
      // Seis de las correcciones se aplicaron justamente porque la planilla
      // mandaba al inspector a un móvil con otro horario de entrada. Depurado
      // el fixture, la franja de cada bloque tiene que ser estable.
      const inspectors = Object.entries(
        fixture.groups.cordoba_rotativos.inspectors as Record<
          string,
          FixtureInspector
        >,
      );

      const saltos: string[] = [];
      for (const [name, data] of inspectors) {
        const fechas = Object.keys(data.days).sort();
        let anterior: { franja: string; turno: string } | null = null;
        for (const fecha of fechas) {
          const code = data.days[fecha];
          if (!/^[MTN][1-5]$/.test(code)) {
            anterior = null; // franco o ausencia: corta el bloque
            continue;
          }
          const actual = { franja: FRANJA[Number(code[1])], turno: code[0] };
          if (
            anterior &&
            anterior.turno === actual.turno &&
            anterior.franja !== actual.franja
          ) {
            saltos.push(`${name} ${fecha}: ${code}`);
          }
          anterior = actual;
        }
      }
      expect(saltos, saltos.join('\n')).toEqual([]);
    });

    it('el fixture documenta las 12 correcciones aplicadas', () => {
      const aplicadas = (fixture as { corrections?: { aplicadas: unknown[] } })
        .corrections?.aplicadas;
      expect(aplicadas).toHaveLength(12);
    });
  });

  describe('R36 — móvil fijo, solo rota el turno', () => {
    const group = fixture.groups.r36;
    const inspectors = Object.entries(
      group.inspectors as Record<string, FixtureInspector>,
    );

    it('cubre los 10 inspectores', () => {
      expect(inspectors.length).toBe(10);
    });

    it.each(inspectors)('%s reproduce la ideal exactamente', (name, data) => {
      // Móvil fijo: `mobiles` de un solo elemento deja el módulo constante.
      const { comparable, mismatches } = compare(name, data, [
        data.anchor.mobile,
      ]);
      expect(comparable).toBeGreaterThan(0);
      expect(mismatches).toEqual([]);
    });
  });
});
