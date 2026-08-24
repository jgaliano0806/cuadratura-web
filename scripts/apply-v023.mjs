import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const url =
  process.env.DATABASE_URL ??
  'postgresql://seguridad_vial:seguridad_vial_local@localhost:55433/seguridad_vial';

const file = 'V023__base_seed_2_7.sql';
const full = path.join(root, 'database', 'migrations', file);
const sql = await readFile(full, 'utf8');
const checksum = createHash('sha256').update(sql).digest('hex');

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  const applied = await client.query(
    'SELECT checksum_sha256 FROM public.schema_migration WHERE version = $1',
    [file],
  );
  if (applied.rowCount) {
    console.log('SKIP', file);
  } else {
    console.log('APPLY', file);
    await client.query(sql);
    await client.query(
      'INSERT INTO public.schema_migration(version, checksum_sha256) VALUES ($1, $2)',
      [file, checksum],
    );
    console.log('OK', file);
  }
} finally {
  await client.end();
}
