# Implementación del Inicializador y Funciones Operativas

**Versión:** 2.6

## Entregables

- `database/migrations/V011__excel_initializer_and_operational_functions.sql`.
- `implementation/src/seguridad_vial/excel_initializer.py`.
- `implementation/src/seguridad_vial/postgres_repository.py`.
- `implementation/src/seguridad_vial/api.py`.
- `implementation/dashboard/huecos.html`.
- pruebas unitarias e integración.

## Inicialización

El preview analiza el archivo sin modificar PostgreSQL. La carga posterior crea un registro de inicialización y llena staging. La confirmación solo admite estado `VALIDADA`, crea la base y activa el Golden Master en una transacción.

La reversión requiere motivo, usuario y una inicialización activa. Se bloquea si existe una planificación o real derivada, o si existen eventos de operación real.

## Normalización

- Unicode NFKC.
- Espacios repetidos eliminados.
- Clave de comparación sin acentos y sin puntuación.
- Códigos convertidos a mayúsculas sin espacios.
- Celdas combinadas expandidas solo en encabezados mensuales.
- Una celda operativa vacía es un error y jamás hereda el valor vecino.

## Móvil 4

Las posiciones son permanentes. Las personas tienen vigencias. `M4-P03` y `M4-P03-EXT` forman el grupo `GRV-M4-P03`; el intercambio crea dos nuevas vigencias cruzadas.

## Huecos

El tablero permite filtrar fechas, móvil, turno, versión y estado de aceptación. Un hueco pendiente no posee responsable; uno justificado conserva motivo, responsable y fecha.

## Trabajos a demanda

Las fechas son inmediatamente posteriores a la vacación. Solo se consideran coberturas con estado `HUECO`. La prioridad es T, N y M. Sin cantidad suficiente, el procedimiento falla sin insertar resultados parciales.
