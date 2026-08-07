# Implementación operativa 2.6

Incluye un parser exacto de la hoja `Móviles Cba 26-27`, staging PostgreSQL, confirmación/reversión transaccional, administración de posiciones del móvil 4, tablero de huecos y asignación de trabajos a demanda de vacaciones.

## Inicializador

```bash
python -m venv .venv
. .venv/bin/activate
pip install -e '.[postgres,test]'
sv-inicializador preview "/ruta/1 - Cronograma 2026-2027.xlsx" --output preview.json
sv-inicializador stage "/ruta/1 - Cronograma 2026-2027.xlsx" --dsn "$DATABASE_URL" --user-id UUID
sv-inicializador confirm UUID_INICIALIZACION --dsn "$DATABASE_URL" --user-id UUID
```

La reversión solamente funciona antes de que existan capas PLANIFICADA/REAL derivadas:

```bash
sv-inicializador revert UUID_INICIALIZACION --dsn "$DATABASE_URL" --user-id UUID --reason "Corrección previa al inicio"
```

## API y tablero

```bash
export DATABASE_URL='postgresql://...'
uvicorn seguridad_vial.api:app --reload
```

- Preview: `POST /initialization/excel/preview`
- Staging: `POST /initialization/excel/stage`
- Confirmación: `POST /initialization/{id}/confirm`
- Reversión: `POST /initialization/{id}/revert`
- Posiciones móvil 4: `GET /operations/mobile4/positions`
- Huecos: `GET /reports/gaps`
- Tablero: `GET /dashboard/gaps`
- Propuestas de trabajo a demanda: `GET /vacations/{id}/demand-work/proposals?version_id=...`

## Celdas combinadas

El parser no interpreta una celda vacía operativa como continuación de una combinada. Solo expande por *forward-fill* los encabezados mensuales; las filas de inspectores se leen celda por celda. Así se evita convertir un vacío real en una asignación inventada.
