import pg from 'pg';
const c = new pg.Client({
  connectionString:
    process.env.DATABASE_URL ??
    'postgresql://seguridad_vial:seguridad_vial_local@localhost:55433/seguridad_vial',
});
await c.connect();
const r = await c.query(
  'DELETE FROM public.schema_migration WHERE version = $1',
  ['V023__base_seed_2_7.sql'],
);
console.log('deleted rows:', r.rowCount);
await c.end();
