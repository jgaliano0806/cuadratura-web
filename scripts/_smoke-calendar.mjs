const API = 'http://localhost:3000';

const login = await fetch(`${API}/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ username: 'admin_sv', password: 'AdminSV123!' }),
});
const { accessToken } = await login.json();

async function j(path) {
  const res = await fetch(`${API}${path}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

const versions = await j('/planning/versions');
console.log('versions:', versions.length);
for (const v of versions) {
  console.log(`  ${v.capa} ${v.codigo} v${v.numero_version} ${v.estado} (${v.periodo_desde?.slice(0,10)} → ${v.periodo_hasta?.slice(0,10)})`);
}

const plan = versions.find((v) => v.capa === 'PLANIFICADA');
if (!plan) {
  console.log('no PLANIFICADA yet');
  process.exit(0);
}

const board = await j(
  `/planning/${plan.id}/calendar?date_from=2026-06-01&date_to=2026-06-10`,
);
console.log('\nboard days sample size:', board.days.length);
console.log('summary:', board.summary);
console.log('coverage sample:', board.coverage.slice(0, 6));
