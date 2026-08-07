import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const migrationsDir = path.join(root, 'database', 'migrations');

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://seguridad_vial:seguridad_vial_local@localhost:5432/seguridad_vial';

async function main() {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.schema_migration (
        version varchar(255) PRIMARY KEY,
        aplicado_en timestamptz NOT NULL DEFAULT now(),
        checksum_sha256 char(64) NOT NULL
      );
    `);

    const files = (await readdir(migrationsDir))
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const full = path.join(migrationsDir, file);
      const sql = await readFile(full, 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const applied = await client.query(
        'SELECT checksum_sha256 FROM public.schema_migration WHERE version = $1',
        [file],
      );

      if (applied.rowCount) {
        if (applied.rows[0].checksum_sha256 !== checksum) {
          throw new Error(`La migración aplicada ${file} cambió de contenido`);
        }
        console.log(`SKIP ${file}`);
        continue;
      }

      console.log(`APPLY ${file}`);
      await client.query(sql);
      await client.query(
        'INSERT INTO public.schema_migration(version, checksum_sha256) VALUES ($1, $2)',
        [file, checksum],
      );
    }
    console.log('Migraciones completadas.');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
