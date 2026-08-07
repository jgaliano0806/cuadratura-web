# Plataforma Inspectores — MVP JS/TS (v2.6)

Monolito modular en **NestJS + React**, sobre el esquema PostgreSQL documentado. Sin Python.

## Regla de cuadratura base

La cuadratura base es inmutable: fija para cada inspector la secuencia futura de
turnos y móviles. Coberturas, cambios temporales, licencias y el intercambio
mensual Haro–Ramos del móvil 4 se registran como superposiciones operativas
auditables; nunca avanzan, reinician ni recalculan esa secuencia. El cambio
Haro–Ramos comienza solamente después de finalizar el servicio en curso.

## Requisitos

- Node.js 20+
- Docker (PostgreSQL 16)
- npm 10+

## Arranque local

```bash
# 1. Variables
cp .env.example .env

# 2. Base de datos (requiere Docker Desktop en ejecución)
docker compose up -d postgres
npm install
npm run db:migrate
npm run db:seed

# 3. API y Web (dos terminales)
npm run dev:api
npm run dev:web
```

Si Docker no está disponible, puede apuntar `DATABASE_URL` a cualquier PostgreSQL 16 local y ejecutar `npm run db:migrate` / `npm run db:seed`.

- Web: http://localhost:5173  
- API: http://localhost:3000/health  
- Postgres: `localhost:55433` (evita conflicto con otros PostgreSQL locales en 5432/5433)

### Usuarios demo

| Usuario    | Clave         | Roles                                      |
|------------|---------------|--------------------------------------------|
| `admin_sv` | `AdminSV123!` | Administración SV + Administrador sistema  |
| `jefe`     | `JefeSV123!`  | Jefe del sector                            |
| `consulta` | `Consulta123!`| Consulta                                   |

## Estructura

```text
apps/api          NestJS (auth, inicialización Excel, planning, huecos, vacaciones)
apps/web          React + Vite
packages/shared   Tipos y constantes compartidas
database/         Migraciones V001–V011 (copia operativa)
```

## API principal

- `POST /auth/login`
- `POST /initialization/excel/preview|stage`
- `POST /initialization/:id/confirm|revert`
- `GET /initialization/status`
- `GET /planning/versions`
- `GET /planning/:id/calendar`
- `POST /planning/:id/submit|observe|approve-and-publish|close`
- `GET /reports/gaps`
- `GET /operations/mobile4/positions`
- `POST /vacations`
- `GET /vacations/:id/demand-work/proposals`
- `POST /vacations/:id/demand-work/assign`

## Tests

```bash
npm test
```

Pruebas unitarias del parser Excel (normalización, bloques 5×3, códigos).

## Documentación de dominio

Ver `Documentacion_Plataforma_Inspectores_v2_6/`.
