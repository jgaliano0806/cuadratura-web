import bcrypt from 'bcryptjs';
import pg from 'pg';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://seguridad_vial:seguridad_vial_local@localhost:5432/seguridad_vial';

const users = [
  {
    username: 'admin_sv',
    displayName: 'Administración Seguridad Vial',
    password: 'AdminSV123!',
    roles: ['ADMINISTRACION_SEGURIDAD_VIAL', 'ADMINISTRADOR_SISTEMA'],
  },
  {
    username: 'jefe',
    displayName: 'Jefe del Sector',
    password: 'JefeSV123!',
    roles: ['JEFE_SECTOR'],
  },
  {
    username: 'consulta',
    displayName: 'Usuario Consulta',
    password: 'Consulta123!',
    roles: ['CONSULTA'],
  },
];

async function main() {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query('SET search_path TO seguridad_vial, public');
    for (const user of users) {
      const hash = await bcrypt.hash(user.password, 10);
      const result = await client.query(
        `INSERT INTO usuario(nombre_usuario, nombre_mostrar, email, hash_clave)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (nombre_usuario) DO UPDATE
           SET hash_clave = EXCLUDED.hash_clave,
               nombre_mostrar = EXCLUDED.nombre_mostrar,
               actualizado_en = now()
         RETURNING id`,
        [user.username, user.displayName, `${user.username}@casisa.local`, hash],
      );
      const userId = result.rows[0].id;
      for (const roleCode of user.roles) {
        await client.query(
          `INSERT INTO usuario_rol(usuario_id, rol_id, fecha_desde)
           SELECT $1, r.id, current_date
           FROM rol r
           WHERE r.codigo = $2
           ON CONFLICT DO NOTHING`,
          [userId, roleCode],
        );
      }
      console.log(`Seeded ${user.username}`);
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
