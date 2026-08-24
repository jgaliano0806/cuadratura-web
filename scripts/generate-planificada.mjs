/**
 * Genera una PLANIFICADA inicial usando el endpoint del motor.
 * Uso: node scripts/generate-planificada.mjs [dateFrom] [dateTo]
 * Defaults: 2026-06-01 → 2027-12-31 (578 días).
 */
const API = process.env.API_URL ?? 'http://localhost:3000';
const USER = process.env.API_USER ?? 'admin_sv';
const PASS = process.env.API_PASS ?? 'AdminSV123!';
const dateFrom = process.argv[2] ?? '2026-06-01';
const dateTo = process.argv[3] ?? '2027-12-31';

const loginRes = await fetch(`${API}/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ username: USER, password: PASS }),
});
if (!loginRes.ok) {
  console.error('Login failed:', loginRes.status, await loginRes.text());
  process.exit(1);
}
const { accessToken } = await loginRes.json();
console.log('logged in as', USER);

async function post(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`${path} ${res.status}:`, text);
    process.exit(1);
  }
  return text ? JSON.parse(text) : {};
}

console.log(`preview ${dateFrom} → ${dateTo}`);
const preview = await post('/schedule-engine/preview', {
  date_from: dateFrom,
  date_to: dateTo,
});
console.log('  positions:', preview.positions, 'days:', preview.days_generated);

console.log('apply (creates PLANIFICADA)');
const applied = await post('/schedule-engine/apply', {
  date_from: dateFrom,
  date_to: dateTo,
});
console.log('  version:', applied.version_id, 'inserted:', applied.days_inserted);

console.log('done');
