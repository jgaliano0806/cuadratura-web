import pg from 'pg';
const c = new pg.Client({
  connectionString:
    process.env.DATABASE_URL ??
    'postgresql://seguridad_vial:seguridad_vial_local@localhost:55433/seguridad_vial',
});
await c.connect();
for (const t of ['cronograma', 'cronograma_version']) {
  const r = await c.query(
    `SELECT column_name, data_type, is_nullable
     FROM information_schema.columns
     WHERE table_schema='seguridad_vial' AND table_name=$1
     ORDER BY ordinal_position`,
    [t],
  );
  console.log(`\n=== ${t} ===`);
  for (const c of r.rows) console.log(`  ${c.column_name} (${c.data_type}, nullable=${c.is_nullable})`);
}
await c.end();
