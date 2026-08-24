/**
 * Seed completo post-wipe: bases, móviles, horarios, perfiles, inspectores,
 * posiciones, asignaciones y estados iniciales al 2026-06-01.
 *
 * Ejecutar tras V021 (wipe). No re-corre si detecta datos existentes.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://seguridad_vial:seguridad_vial_local@localhost:55433/seguridad_vial';

/* ---------- Definición explícita de personas / posiciones ------------- */

const REF_DATE = '2026-06-01';

const M4 = [
  { code: 'M4-P01', name: 'Del Bel',     order: 1 },
  { code: 'M4-P02', name: 'Carranza M.', order: 2 },
  { code: 'M4-P03', name: 'Haro',        order: 3 },
  { code: 'M4-P04', name: 'Carranza G.', order: 4 },
  { code: 'M4-P05', name: 'Mainardi',    order: 5 },
];

const M6 = [
  { code: 'M6-P01', name: 'López J.',   order: 1 },
  { code: 'M6-P02', name: 'Scagnetti',  order: 2 },
  { code: 'M6-P03', name: 'Cingolani',  order: 3 },
  { code: 'M6-P04', name: 'Fanloo',     order: 4 },
  { code: 'M6-P05', name: 'Torres',     order: 5 },
];

const M7 = [
  { code: 'M7-P01', name: 'Falco',        order: 1 },
  { code: 'M7-P02', name: 'Fernández L.', order: 2 },
  { code: 'M7-P03', name: 'Zeballe',      order: 3 },
  { code: 'M7-P04', name: 'Coria',        order: 4 },
  { code: 'M7-P05', name: 'Coronel R36',  order: 5 },
];

// Inspectores generales en orden de fila del cronograma (Garate=fila 6, …, Bendayán=fila 27)
const GEN = [
  'Garate',
  'Gimenez P.',
  'Coronel',
  'Almada',
  'Grandi',
  'Tejada',
  'Acosta',
  'Martinez J.',
  'Peralta M.',
  'Zambrano N.',
  'Capdevila',
  'Sandoval',
  'Lungrin',
  'Giuliani',
  'Tissera',
  'Martinez F.',
  'Zambrano M.',
  'Barrera P.',
  'Carletto G.',
  'Ramos G.',
  'Flores J.',
  'Bendayán',
].map((name, i) => ({
  code: `GEN-${String(i + 1).padStart(2, '0')}`,
  name,
  order: i + 1,
}));

/* ---------- Estados iniciales calculados (scripts/ruta36-seed-anchors.json) --- */

async function loadAnchors() {
  const raw = await readFile(
    path.join(root, 'scripts', 'ruta36-seed-anchors.json'),
    'utf8',
  );
  const data = JSON.parse(raw);
  const map = new Map();
  for (const entry of data.results) {
    const st = entry.state;
    // Los perfiles M4/M6/M7 tienen un solo móvil: no rota.
    // completedBlocksOnMobile del generador quedó en -8 (irrelevante); normalizamos a 0.
    if (['M4', 'M6', 'M7'].includes(entry.kind)) {
      st.completedBlocksOnMobile = 0;
    }
    map.set(entry.name, st);
  }
  return map;
}

/* ---------- SQL helpers -------------------------------------------------- */

async function q(client, sql, params = []) {
  return client.query(sql, params);
}

async function ensureBases(client) {
  await q(client, `
    INSERT INTO seguridad_vial.base_operativa(codigo, nombre, ubicacion_descriptiva) VALUES
      ('OBRADOR', 'Obrador', 'Base de los móviles 1, 2, 3 y 5'),
      ('RUTA53',  'Ruta 53', 'Base del móvil 4'),
      ('RUTA36',  'Ruta 36', 'Base de los móviles 6 (Piedras Moras) y 7 (Arroyo Tegua)')
    ON CONFLICT (codigo) DO UPDATE SET nombre = EXCLUDED.nombre;
  `);
}

async function ensureMobiles(client) {
  // Aseguramos catálogo (V009+V020 podría haber quedado incompleto tras el wipe si estaba en tabla operativa; en este esquema movil NO se trunca en el wipe).
  await q(client, `
    INSERT INTO seguridad_vial.movil(numero, base_operativa_id, capacidad_maxima, vigencia_desde)
    SELECT n.numero, b.id, 2, DATE '2026-04-01'
    FROM (VALUES (1,'OBRADOR'),(2,'OBRADOR'),(3,'OBRADOR'),(4,'RUTA53'),(5,'OBRADOR'),(6,'RUTA36'),(7,'RUTA36')) n(numero, base_codigo)
    JOIN seguridad_vial.base_operativa b ON b.codigo = n.base_codigo
    ON CONFLICT (numero) DO UPDATE
      SET base_operativa_id = EXCLUDED.base_operativa_id,
          capacidad_maxima = EXCLUDED.capacidad_maxima,
          vigencia_desde = LEAST(seguridad_vial.movil.vigencia_desde, EXCLUDED.vigencia_desde);
  `);
}

async function ensureSchedules(client) {
  await q(client, `
    INSERT INTO seguridad_vial.horario_turno_movil(movil_id, turno, hora_inicio, duracion_minutos, vigencia_desde)
    SELECT m.id, x.turno::seguridad_vial.turno_codigo, x.hora_inicio, 480, DATE '2026-04-01'
    FROM seguridad_vial.movil m
    JOIN (VALUES
      (1, 'M', TIME '05:00'), (1, 'T', TIME '13:00'), (1, 'N', TIME '21:00'),
      (2, 'M', TIME '05:00'), (2, 'T', TIME '13:00'), (2, 'N', TIME '21:00'),
      (3, 'M', TIME '07:00'), (3, 'T', TIME '15:00'), (3, 'N', TIME '23:00'),
      (4, 'M', TIME '05:00'), (4, 'T', TIME '13:00'), (4, 'N', TIME '21:00'),
      (5, 'M', TIME '07:00'), (5, 'T', TIME '15:00'), (5, 'N', TIME '23:00'),
      (6, 'M', TIME '06:00'), (6, 'T', TIME '14:00'), (6, 'N', TIME '22:00'),
      (7, 'M', TIME '07:00'), (7, 'T', TIME '15:00'), (7, 'N', TIME '23:00')
    ) x(numero, turno, hora_inicio) ON x.numero = m.numero
    ON CONFLICT DO NOTHING;
  `);
}

async function ensureProfiles(client) {
  await q(client, `
    INSERT INTO seguridad_vial.perfil_rotacion(codigo, nombre, tipo, vigencia_desde) VALUES
      ('ROTACION_GENERAL', 'Rotación general 1-5-3-2', 'GENERAL', DATE '2026-04-01'),
      ('MOVIL4_FIJO', 'Móvil 4 con turnos M-N-T', 'FIJO_MOVIL', DATE '2026-04-01'),
      ('MOVIL6_FIJO', 'Móvil 6 Piedras Moras (Ruta 36) M-N-T', 'FIJO_MOVIL', DATE '2026-06-01'),
      ('MOVIL7_FIJO', 'Móvil 7 Arroyo Tegua (Ruta 36) M-N-T', 'FIJO_MOVIL', DATE '2026-06-01')
    ON CONFLICT (codigo) DO NOTHING;
  `);

  await q(client, `
    INSERT INTO seguridad_vial.perfil_rotacion_turno(perfil_id, orden, turno)
    SELECT p.id, x.orden, x.turno::seguridad_vial.turno_codigo
    FROM seguridad_vial.perfil_rotacion p
    JOIN (VALUES
      ('ROTACION_GENERAL', 1, 'M'), ('ROTACION_GENERAL', 2, 'N'), ('ROTACION_GENERAL', 3, 'T'),
      ('MOVIL4_FIJO', 1, 'M'), ('MOVIL4_FIJO', 2, 'N'), ('MOVIL4_FIJO', 3, 'T'),
      ('MOVIL6_FIJO', 1, 'M'), ('MOVIL6_FIJO', 2, 'N'), ('MOVIL6_FIJO', 3, 'T'),
      ('MOVIL7_FIJO', 1, 'M'), ('MOVIL7_FIJO', 2, 'N'), ('MOVIL7_FIJO', 3, 'T')
    ) x(codigo, orden, turno) ON x.codigo = p.codigo
    ON CONFLICT DO NOTHING;
  `);

  await q(client, `
    INSERT INTO seguridad_vial.perfil_rotacion_movil(perfil_id, orden, movil_id)
    SELECT p.id, x.orden, m.id
    FROM seguridad_vial.perfil_rotacion p
    JOIN (VALUES
      ('ROTACION_GENERAL', 1, 1),
      ('ROTACION_GENERAL', 2, 5),
      ('ROTACION_GENERAL', 3, 3),
      ('ROTACION_GENERAL', 4, 2),
      ('MOVIL4_FIJO', 1, 4),
      ('MOVIL6_FIJO', 1, 6),
      ('MOVIL7_FIJO', 1, 7)
    ) x(codigo, orden, numero) ON x.codigo = p.codigo
    JOIN seguridad_vial.movil m ON m.numero = x.numero
    ON CONFLICT DO NOTHING;
  `);
}

async function insertInspector(client, legajo, name) {
  const r = await q(
    client,
    `INSERT INTO seguridad_vial.inspector(legajo, nombre_completo, tipo_plantel, fecha_alta)
     VALUES ($1, $2, 'TITULAR', DATE '2026-06-01')
     ON CONFLICT (legajo) DO UPDATE SET nombre_completo = EXCLUDED.nombre_completo
     RETURNING id`,
    [legajo, name],
  );
  return r.rows[0].id;
}

async function upsertGrupoFranco(client, codigo, nombre) {
  const r = await q(
    client,
    `INSERT INTO seguridad_vial.grupo_franco(codigo, nombre, fecha_ancla, posicion_inicial_ciclo, origen_ancla)
     VALUES ($1, $2, DATE '2026-06-01', 0, 'CONFIGURACION')
     ON CONFLICT (codigo) DO UPDATE SET nombre = EXCLUDED.nombre
     RETURNING id`,
    [codigo, nombre],
  );
  return r.rows[0].id;
}

async function upsertPosicion(client, { code, name, tipo, grupoId, perfilCodigo, turnoInicial, mobileNumber, desfase }) {
  const r = await q(
    client,
    `INSERT INTO seguridad_vial.posicion_cuadratura(
        codigo, nombre, tipo, grupo_franco_id, perfil_rotacion_id,
        fecha_ancla, posicion_inicial_ciclo, turno_inicial, movil_inicial_id,
        desfase_dias_referencia, origen_ancla, vigencia_desde
     )
     SELECT $1, $2, $3::seguridad_vial.tipo_posicion, $4, pr.id,
            DATE '2026-06-01', 0, $5::seguridad_vial.turno_codigo,
            (SELECT id FROM seguridad_vial.movil WHERE numero = $6),
            $7, 'CONFIGURACION'::seguridad_vial.origen_ancla, DATE '2026-06-01'
     FROM seguridad_vial.perfil_rotacion pr
     WHERE pr.codigo = $8
     ON CONFLICT (codigo) DO UPDATE
        SET nombre = EXCLUDED.nombre,
            grupo_franco_id = EXCLUDED.grupo_franco_id,
            perfil_rotacion_id = EXCLUDED.perfil_rotacion_id
     RETURNING id`,
    [code, name, tipo, grupoId, turnoInicial, mobileNumber, desfase, perfilCodigo],
  );
  return r.rows[0].id;
}

async function assignInspector(client, posicionId, inspectorId) {
  await q(
    client,
    `INSERT INTO seguridad_vial.asignacion_inspector_posicion(posicion_id, inspector_id, fecha_desde, motivo)
     VALUES ($1, $2, DATE '2026-06-01', 'Alta inicial cuadratura 2026-06')`,
    [posicionId, inspectorId],
  );
}

async function insertEstadoInicial(client, posicionId, state) {
  await q(
    client,
    `INSERT INTO seguridad_vial.estado_inicial_posicion(
        posicion_id, inicializacion_id, fecha_referencia, posicion_ciclo,
        turno, movil_id, indice_turno, indice_movil,
        bloques_completados_movil, codigo_origen
     )
     VALUES ($1, NULL, DATE '2026-06-01', $2,
             $3::seguridad_vial.turno_codigo,
             (SELECT id FROM seguridad_vial.movil WHERE numero = $4),
             $5, $6, $7, $8)
     ON CONFLICT (posicion_id) DO UPDATE
        SET fecha_referencia = EXCLUDED.fecha_referencia,
            posicion_ciclo = EXCLUDED.posicion_ciclo,
            turno = EXCLUDED.turno,
            movil_id = EXCLUDED.movil_id,
            indice_turno = EXCLUDED.indice_turno,
            indice_movil = EXCLUDED.indice_movil,
            bloques_completados_movil = EXCLUDED.bloques_completados_movil,
            codigo_origen = EXCLUDED.codigo_origen`,
    [
      posicionId,
      state.cyclePosition,
      state.shift,
      state.mobile,
      state.shiftIndex,
      state.mobileIndex,
      Math.max(0, Math.min(4, state.completedBlocksOnMobile ?? 0)),
      state.codigoOrigen,
    ],
  );
}

function codigoOrigen(state) {
  if (state.shift && state.mobile !== null) return `${state.shift}${state.mobile}`;
  return 'F';
}

async function main() {
  const anchors = await loadAnchors();
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL session_replication_role = 'replica'`);

    // Idempotencia: limpia asignaciones/estados/posiciones/inspectores/grupos previos.
    await client.query(`
      TRUNCATE
        seguridad_vial.asignacion_inspector_posicion,
        seguridad_vial.estado_inicial_posicion,
        seguridad_vial.miembro_grupo_rotacion_vinculada,
        seguridad_vial.grupo_rotacion_vinculada,
        seguridad_vial.posicion_cuadratura,
        seguridad_vial.grupo_franco,
        seguridad_vial.inspector
      RESTART IDENTITY CASCADE;
    `);

    await ensureBases(client);
    await ensureMobiles(client);
    await ensureSchedules(client);
    await ensureProfiles(client);

    const seed = [];

    for (const p of M4) seed.push({ ...p, tipo: 'MOVIL4', perfil: 'MOVIL4_FIJO', mobile: 4, group: 'GF-M4' });
    for (const p of M6) seed.push({ ...p, tipo: 'MOVIL6', perfil: 'MOVIL6_FIJO', mobile: 6, group: 'GF-M6' });
    for (const p of M7) seed.push({ ...p, tipo: 'MOVIL7', perfil: 'MOVIL7_FIJO', mobile: 7, group: 'GF-M7' });
    for (const p of GEN) seed.push({ ...p, tipo: 'GENERAL', perfil: 'ROTACION_GENERAL', mobile: null, group: 'GF-GEN' });

    let genCounter = 0;
    let m4Counter = 0;
    let m6Counter = 0;
    let m7Counter = 0;

    for (const item of seed) {
      const anchor = anchors.get(item.name === 'Fernández L.' ? 'Fernandez L.' : item.name);
      if (!anchor) throw new Error(`Sin anchor para ${item.name}`);
      const cod = codigoOrigen(anchor);

      let legajoPrefix = 'GEN';
      let idx;
      if (item.tipo === 'MOVIL4') { legajoPrefix = 'M4'; idx = ++m4Counter; }
      else if (item.tipo === 'MOVIL6') { legajoPrefix = 'M6'; idx = ++m6Counter; }
      else if (item.tipo === 'MOVIL7') { legajoPrefix = 'M7'; idx = ++m7Counter; }
      else { legajoPrefix = 'GEN'; idx = ++genCounter; }
      const legajo = `SV-${legajoPrefix}-${String(idx).padStart(2, '0')}`;

      const inspectorId = await insertInspector(client, legajo, item.name);

      // Grupo de franco por posición.
      const grupoCodigo = `GF-${item.code}`;
      const grupoId = await upsertGrupoFranco(client, grupoCodigo, `Grupo ${item.code}`);

      // Turno inicial y móvil inicial para la posición (referencia informativa).
      const turnoInicial = anchor.shift ?? (anchor.shifts[(anchor.shiftIndex + 1) % 3]);
      const mobileInicial = anchor.mobile ?? (item.mobile ?? anchor.mobiles[(anchor.mobileIndex) % anchor.mobiles.length]);

      const posicionId = await upsertPosicion(client, {
        code: item.code,
        name: `${item.name} (${item.code})`,
        tipo: item.tipo,
        grupoId,
        perfilCodigo: item.perfil,
        turnoInicial,
        mobileNumber: mobileInicial,
        desfase: item.order - 1,
      });

      await assignInspector(client, posicionId, inspectorId);
      await insertEstadoInicial(client, posicionId, { ...anchor, codigoOrigen: cod });
    }

    await client.query('COMMIT');
    console.log('Seed completado.');

    const summary = await client.query(`
      SELECT p.tipo::text, count(*) AS n
      FROM seguridad_vial.posicion_cuadratura p
      GROUP BY p.tipo::text ORDER BY 1
    `);
    console.log('Posiciones por tipo:', summary.rows);

    const inspectors = await client.query(
      `SELECT count(*) AS n FROM seguridad_vial.inspector WHERE estado='ACTIVO'`,
    );
    console.log('Inspectores activos:', inspectors.rows[0].n);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
