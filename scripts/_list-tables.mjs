import pg from 'pg';
const c = new pg.Client({
  connectionString:
    process.env.DATABASE_URL ??
    'postgresql://seguridad_vial:seguridad_vial_local@localhost:55433/seguridad_vial',
});
await c.connect();
const r = await c.query(
  `SELECT tablename FROM pg_tables WHERE schemaname='seguridad_vial' ORDER BY tablename`,
);
console.log(r.rows.map((x) => x.tablename).join('\n'));
await c.end();
