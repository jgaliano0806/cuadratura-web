/**
 * Verifica que las anclas cargadas produzcan el cronograma esperado los primeros 16 días.
 */
import pg from 'pg';
import { advanceOneDay, createState, dayFromState } from '../apps/api/src/modules/schedule-engine/projection.ts';

const client = new pg.Client({
  connectionString:
    process.env.DATABASE_URL ??
    'postgresql://seguridad_vial:seguridad_vial_local@localhost:55433/seguridad_vial',
});
await client.connect();

const r = await client.query(`
  SELECT p.codigo, i.nombre_completo,
         e.posicion_ciclo, e.turno::text AS turno, m.numero AS movil,
         e.indice_turno, e.indice_movil,
         e.bloques_completados_movil,
         (SELECT array_agg(pt.turno::text ORDER BY pt.orden)
          FROM seguridad_vial.perfil_rotacion_turno pt WHERE pt.perfil_id = p.perfil_rotacion_id) AS turnos,
         (SELECT array_agg(mm.numero ORDER BY pm.orden)
          FROM seguridad_vial.perfil_rotacion_movil pm
          JOIN seguridad_vial.movil mm ON mm.id = pm.movil_id
          WHERE pm.perfil_id = p.perfil_rotacion_id) AS moviles
  FROM seguridad_vial.posicion_cuadratura p
  JOIN seguridad_vial.estado_inicial_posicion e ON e.posicion_id = p.id
  LEFT JOIN seguridad_vial.movil m ON m.id = e.movil_id
  LEFT JOIN LATERAL (
    SELECT a1.inspector_id
    FROM seguridad_vial.asignacion_inspector_posicion a1
    WHERE a1.posicion_id = p.id AND current_date <@ a1.vigencia
    ORDER BY a1.fecha_desde DESC LIMIT 1
  ) a ON true
  LEFT JOIN seguridad_vial.inspector i ON i.id = a.inspector_id
  ORDER BY p.codigo
`);

const expected = new Map([
  ['López J.',     'M6 M6 M6 M6 M6 F F F N6 N6 N6 N6 N6 F F F'],
  ['Fanloo',       'F F T6 T6 T6 T6 T6 F F F M6 M6 M6 M6 M6 F'],
  ['Falco',        'F F F T7 T7 T7 T7 T7 F F F M7 M7 M7 M7 M7'],
  ['Coronel R36',  'F M7 M7 M7 M7 M7 F F F N7 N7 N7 N7 N7 F F'],
  ['Del Bel',      'F N4 N4 N4 N4 N4 F F F T4 T4 T4 T4 T4 F F'],
  ['Carranza G.',  'M4 M4 F F F N4 N4 N4 N4 N4 F F F T4 T4 T4'],
  ['Haro',         'N4 F F F T4 T4 T4 T4 T4 F F F M4 M4 M4 M4'],
  ['Garate',       'T1 T1 F F F M5 M5 M5 M5 M5 F F F N5 N5 N5'],
  ['Grandi',       'M5 M5 M5 M5 M5 F F F N5 N5 N5 N5 N5 F F F'],
  ['Ramos G.',     'N5 F F F T3 T3 T3 T3 T3 F F F M3 M3 M3 M3'],
]);

let bad = 0;
for (const row of r.rows) {
  const name = row.nombre_completo;
  if (!expected.has(name)) continue;

  const shifts = (row.turnos || []).filter(Boolean);
  const mobiles = (row.moviles || []).map(Number);

  let st = createState({
    positionCode: row.codigo,
    positionId: row.codigo,
    inspectorId: name,
    inspectorName: name,
    referenceDate: '2026-06-01',
    cyclePosition: row.posicion_ciclo,
    shift: row.turno,
    mobile: row.movil,
    shiftIndex: row.indice_turno,
    mobileIndex: row.indice_movil,
    shifts,
    mobiles,
    completedBlocksOnMobile: Number(row.bloques_completados_movil ?? 0),
  });

  const codes = [];
  for (let i = 0; i < 16; i++) {
    codes.push(dayFromState(st, { positionCode: row.codigo, positionId: row.codigo, inspectorId: name, inspectorName: name }).code);
    st = advanceOneDay(st);
  }
  const got = codes.join(' ');
  const exp = expected.get(name);
  const ok = got === exp;
  if (!ok) bad++;
  console.log(`${ok ? '✓' : '✗'} ${name.padEnd(14)}  exp=${exp}\n${' '.repeat(19)}got=${got}`);
}

console.log(`\nErrores: ${bad}/${expected.size}`);
await client.end();
process.exit(bad === 0 ? 0 : 1);
