# Esquema físico PostgreSQL — Plataforma de Inspectores

## Requisitos

- PostgreSQL 16 o superior.
- Extensiones `pgcrypto` y `btree_gist`.
- Cliente `psql` para ejecutar las migraciones.

## Ejecución local

```bash
docker compose -f docker-compose.postgres.yml up -d
export DATABASE_URL='postgresql://seguridad_vial:seguridad_vial_local@localhost:5432/seguridad_vial'
./scripts/migrate.sh
psql "$DATABASE_URL" -f scripts/validate_schema.sql
```

## Orden de migraciones

1. Esquema, extensiones y tipos.
2. Seguridad y auditoría.
3. Catálogos, posiciones e inicialización.
4. Cronogramas, versiones, bloques, días y cobertura.
5. Novedades, ajustes planificados y eventos reales.
6. Restricciones, inmutabilidad y auditoría.
7. Materialización de BASE, PLANIFICADA y REAL.
8. Validación y flujo de aprobación/publicación.
9. Roles, bases, móviles, perfiles y posiciones del móvil 4.
10. Vistas de consulta y comparación.

## Estrategia de persistencia

- **BASE:** los bloques 5×3 son la fuente canónica e inmutable. `dia_cronograma` es una proyección materializada regenerable.
- **PLANIFICADA:** deriva de una versión BASE publicada. Las decisiones humanas se guardan como `ajuste_planificacion`; `dia_cronograma` conserva el snapshot materializado por versión.
- **REAL:** deriva de una versión PLANIFICADA publicada. Los hechos/correcciones se guardan como eventos append-only; el snapshot diario se materializa por versión.
- Las versiones publicadas no se modifican. Una corrección genera una versión nueva.

## Contexto de auditoría

Antes de ejecutar una operación desde la aplicación, la conexión debe configurar:

```sql
SET LOCAL app.user_id = '<uuid-del-usuario>';
SET LOCAL app.change_reason = 'Motivo del cambio';
SET LOCAL app.client_ip = '127.0.0.1';
```

## Horarios pendientes

Las horas de inicio conocidas están sembradas. `duracion_minutos` queda en `NULL` hasta que el negocio confirme la duración formal y la fecha operativa del turno nocturno.

## Migración V011

Cierra horarios de 8 horas, agrega staging y confirmación/reversión del Excel, posición externa vinculada, vigencias/sustituciones del móvil 4, tablero de huecos y trabajos a demanda de vacaciones.
