# Documentación Plataforma de Inspectores — Versión 2.6

Comenzar por:

1. `00_Documentacion_Funcional_Maestra_v2_6.md`
2. `01_Catalogo_Maestro_Reglas_de_Negocio_v2_6.md`
3. `10_Checklist_Decisiones_Pendientes_v2_6.md`

La regla de control es simple: una sola numeración de reglas y trazabilidad completa hacia historias, casos de uso, criterios y pruebas.

## Cambios 2.1

- Cuadratura propia del móvil 4 mediante cinco posiciones continuas.
- Solapamiento periódico controlado.
- Dupla operativa vinculada Haro–Ramos.
- Nuevas RN-031 y RN-032 con HU, CU, CA y CP asociados.


## Cambios 2.2

- El importador se redefine como inicializador extraordinario de única ejecución.
- Fuente exclusiva: hoja `Móviles CBA 26-27`.
- La carga crea la cuadratura base, posiciones, grupos, estados iniciales y Golden Master.
- Luego de la confirmación, se bloquean nuevas importaciones ordinarias.
- La planificación futura se genera exclusivamente con el motor de reglas.


## Cambios 2.3

- Vacaciones confirmadas como días corridos.
- Todas comienzan después de tres francos normales.
- Protocolos cerrados para 7, 14, 21, 28 y 35 días.
- Trabajo a demanda definido por duración.
- Trabajo a demanda en cualquier móvil, priorizando tarde o noche.
- Retorno a la cuadratura planificada después de un franco adicional.


## Cambios 2.4

- Estado inicial derivado del Excel histórico.
- Cobertura objetivo 1, máximo 2 y huecos justificados.
- Administración de Seguridad Vial prepara; Jefe del sector aprueba/publica.
- Versiones publicadas inmutables.
- Anclas del móvil 4 verificadas: 01/05, 02/05, 04/05, 05/05 y 07/05/2026.
- Desfases: 0, 1, 3, 4 y 6.
- Única dupla vinculada detectada: Haro–Ramos G.
- Informe nuevo: `11_Analisis_Movil_4_desde_Excel_v2_6.md`.


## Cambios 2.5

- Modelo físico PostgreSQL cerrado.
- Migraciones SQL forward-only.
- BASE por bloques inmutables.
- PLANIFICADA por ajustes versionados y snapshot diario.
- REAL por eventos append-only y snapshot diario.
- Restricciones de capacidad, vigencia, unicidad y huecos.
- Procedimientos de materialización y aprobación/publicación.
- ERD físico y scripts de ejecución local.

- Diccionario físico: `14_Diccionario_de_Datos_Fisico_v2_6.md`.
- SQL consolidado: `database/schema_full.sql`.

## Cambios 2.6

- Turnos de 8 horas y fecha operativa por inicio.
- Parser exacto y normalizador del Excel oficial.
- Staging, confirmación y reversión controlada.
- Posición `M4-P03-EXT`, vigencias, sustituciones e intercambio de dupla.
- Tablero de huecos con SQL, API y página web.
- Propuestas y asignación de trabajos a demanda por huecos, prioridad T → N → M.
- Migración V011 y paquete ejecutable en `implementation/`.
