# Checklist de Decisiones y Faltantes

**Versión:** 2.6

Estados:

- `[x] LISTO`
- `[~] PARCIAL / EN DEBATE`
- `[ ] PENDIENTE`
- `[-] POSTERGADO`

## F-001 — Catálogo maestro y trazabilidad

**Estado:** `[x] LISTO`

- Identificadores RN únicos.
- Una HU por RN.
- Criterios de aceptación.
- Casos de uso.
- Casos de prueba.
- Matriz RN → HU → CU → CA → CP.

## F-002 — Modelo de cuadraturas

**Estado:** `[x] LISTO FUNCIONAL Y TÉCNICAMENTE`

- BASE: bloques persistidos e inmutables; días materializados y regenerables.
- PLANIFICADA: deriva de BASE mediante ajustes versionados; snapshot diario persistido por versión.
- REAL: deriva de PLANIFICADA mediante eventos append-only; snapshot diario persistido por versión.
- Nunca se sobrescribe una capa anterior.
- Las vacaciones aprobadas afectan PLANIFICADA, nunca BASE.

## F-003 — Regla general de rotación

**Estado:** `[x] LISTO`

- 5 días de trabajo.
- 3 francos.
- Turnos M → N → T.
- Continuidad mensual.
- Móviles 1 → 5 → 3 → 2.
- Cambio de móvil únicamente al comenzar un nuevo bloque.
- Bloques que cruzan meses mantienen turno y móvil.

## F-004 — Estado inicial/ancla

**Estado:** `[x] LISTO FUNCIONALMENTE`

- La hoja `Móviles Cba 26-27` es la fuente oficial.
- Se reconstruye el último estado histórico válido.
- Se obtienen ciclo, turno, móvil, grupo de francos y posiciones de rotación.
- El motor continúa sin reiniciar.
- Las inconsistencias se corrigen antes de confirmar.

## F-005 — Horarios y fecha operativa

**Estado:** `[x] LISTO FUNCIONAL Y TÉCNICAMENTE`

- Todos los turnos duran 8 horas (`480` minutos).
- La fecha operativa es la fecha de inicio del turno.
- Móviles 1, 2 y 4: M 05:00–13:00, T 13:00–21:00, N 21:00–05:00.
- Móviles 3 y 5: M 07:00–15:00, T 15:00–23:00, N 23:00–07:00.
- La migración V011 obliga `duracion_minutos = 480` y `fecha_operativa_por_inicio = true`.

## F-006 — Configuraciones del móvil 4

**Estado:** `[x] LISTO FUNCIONAL Y TÉCNICAMENTE`

- Posiciones `M4-P01` a `M4-P05` cargadas con sus anclas.
- Posición externa vinculada `M4-P03-EXT` y grupo `GRV-M4-P03` implementados.
- Las personas se asignan mediante vigencias; la continuidad pertenece a la posición.
- `sp_asignar_ocupante_posicion` cierra la vigencia anterior e inicia la sustitución.
- `sp_intercambiar_ocupantes_grupo_vinculado` intercambia los dos ocupantes sin cortar ni reiniciar las posiciones.
- `v_movil4_posiciones_vigentes` expone ocupantes y vigencias actuales.

## F-007 — Cobertura requerida

**Estado:** `[x] LISTO FUNCIONAL Y TÉCNICAMENTE`

- Objetivo 1 y máximo 2 por móvil/turno.
- Cero genera hueco con alerta; tres o más se bloquean.
- Aprobar/publicar exige motivo y responsable para cada hueco.
- `v_tablero_huecos` y `fn_tablero_huecos` implementan el tablero y sus filtros.
- La implementación web incluye `/dashboard/gaps` y el endpoint `/reports/gaps`.

## F-008 — Vacaciones

**Estado:** `[x] LISTO FUNCIONAL Y TÉCNICAMENTE`

- Protocolos de 7, 14, 21, 28 y 35 días corridos implementados.
- Los trabajos a demanda se ubican inmediatamente después de las vacaciones.
- `fn_proponer_trabajos_demanda_vacacion` busca huecos, priorizando T, luego N y luego M.
- `sp_asignar_trabajos_demanda_vacacion` crea los ajustes y el franco posterior.
- Si no existe necesidad suficiente, no inventa una asignación y devuelve error para resolución manual.

## F-009 — Licencias y reemplazos

**Estado:** `[x] LISTO FUNCIONAL Y TÉCNICAMENTE`

- La licencia es una novedad auditada, sin ciclo especial de negocio.
- Fecha inicial obligatoria; fecha final opcional.
- Puede aplicarse a PLANIFICADA o REAL.
- No modifica BASE.
- No crea vacantes, búsquedas ni nombres ficticios.
- El reemplazo es opcional y solo se registra cuando existe una persona aprobada.
- Titular y persona asignada se conservan por separado.
- Sin reemplazo, queda un hueco con alerta y la justificación exigida para publicar.

## F-010 — Restricciones de integridad

**Estado:** `[x] LISTO FUNCIONALMENTE`

- No doble móvil.
- No turnos superpuestos.
- No asignar inspector con licencia.
- No superar capacidad.
- Cambio manual con motivo y auditoría.

Pendiente técnico:

- Definir descanso mínimo en horas si se requiere una validación adicional.

## F-011 — Modelo de datos

**Estado:** `[x] LISTO FÍSICAMENTE`

Definido e incluido:

- Esquema PostgreSQL.
- Claves primarias y foráneas.
- Índices B-tree, GIN y GiST.
- Restricciones de vigencia y exclusión.
- Triggers de capacidad, disponibilidad e inmutabilidad.
- Materialización de BASE, PLANIFICADA y REAL.
- Flujo atómico de aprobación/publicación.
- Auditoría y roles.
- Migraciones forward-only y validador del esquema.

Pendiente de ejecución:

- Aplicar las migraciones en Local.
- Ejecutar pruebas de integración contra PostgreSQL 16.

## F-012 — Versionado y aprobación

**Estado:** `[x] LISTO FUNCIONALMENTE`

`Borrador → En revisión → Observada → Borrador`

o:

`Borrador → En revisión → Aprobada y publicada → Cerrada`

- Administración de Seguridad Vial prepara, valida, justifica y envía.
- El Jefe del sector observa/devuelve o aprueba.
- Aprobar publica automáticamente.
- La versión publicada es inmutable.
- Todo cambio posterior crea una nueva versión.
- El Jefe del sector cierra el período.

## F-013 — Inicialización única desde Excel

**Estado:** `[x] LISTO FUNCIONAL Y TÉCNICAMENTE`

Implementado:

- Parser exacto de la hoja `Móviles Cba 26-27`; rechaza la hoja `VIEJO` y cualquier duplicado ambiguo.
- Detección de fila de fechas, 27 inspectores y corte automático en la última fecha histórica completa; las columnas futuras incompletas se advierten y se ignoran.
- Normalización Unicode, espacios, iniciales, claves sin acentos y códigos operativos.
- Celdas combinadas: *forward-fill* solo para encabezados mensuales; nunca para datos operativos.
- Validación de códigos, fechas, ordinales, vacíos, posiciones y duplas.
- Staging separado de inspectores, días y bloques.
- Preview sin impacto operativo, confirmación transaccional y Golden Master.
- Estado inicial, posiciones, asignaciones y BASE creados desde el staging.
- Bloqueo de reimportación ordinaria.
- Reversión controlada antes de existir capas derivadas u operación real.
- CLI, API y pruebas de integración incluidas en `implementation/`.

## F-014 — Historias, criterios y pruebas

**Estado:** `[x] LISTO COMO LÍNEA BASE`

Pendiente:

- Revisión y aprobación formal del negocio.
- Ampliar casos límite durante el desarrollo.
- Adjuntar evidencias de ejecución.

## F-015 — Requisitos no funcionales

**Estado:** `[ ] PENDIENTE`

- Usuarios concurrentes.
- Rendimiento.
- Disponibilidad.
- RPO/RTO.
- Retenciones.
- Tamaños máximos.
- Navegadores y dispositivos.
- Accesibilidad.
- Política de sesión.

## F-016 — Infraestructura

**Estado:** `[~] PARCIAL`

Listo:

- Local y Producción.
- Monolito modular.
- PostgreSQL.
- Backups, monitoreo y HTTPS como requisitos.

Pendiente:

- Servidor/proveedor de Producción.
- Dimensionamiento.
- Dominio y certificados.
- Procedimiento operativo definitivo.
