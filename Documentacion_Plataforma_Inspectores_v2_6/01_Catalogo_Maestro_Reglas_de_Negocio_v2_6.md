# Catálogo Maestro de Reglas de Negocio

**Versión:** 2.6  
**Regla de control:** los identificadores de este documento son únicos y no deben redefinirse en otros archivos.

## Estados

- **Aprobada:** acordada durante el análisis.
- **Aprobada con detalle pendiente:** la obligación está definida, pero falta cerrar parámetros o responsables.

## Catálogo

### RN-001 — Separación entre planificación y operación real

**Estado:** Aprobada  
**Prioridad:** Alta  
**Descripción:** La cuadratura planificada no debe ser sobrescrita por novedades del día a día. La operación real se registra de forma separada o como una capa de novedades trazables.  
**Trazabilidad:** `RN-001 → HU-001 → CU-01 → CP-001`

### RN-002 — Horizonte de planificación

**Estado:** Aprobada  
**Prioridad:** Alta  
**Descripción:** El sistema debe permitir generar y consultar planificación de hasta 12 meses hacia adelante.  
**Trazabilidad:** `RN-002 → HU-002 → CU-02 → CP-002`

### RN-003 — Codificación operativa

**Estado:** Aprobada  
**Prioridad:** Alta  
**Descripción:** Los códigos válidos son M1..M5, T1..T5, N1..N5, F, V y EF. EF pertenece a la operación real y representa enfermedad o ausencia corta según la clasificación configurada.  
**Trazabilidad:** `RN-003 → HU-003 → CU-03 → CP-003`

### RN-004 — Ciclo laboral continuo 5×3

**Estado:** Aprobada  
**Prioridad:** Crítica  
**Descripción:** Cada inspector trabaja cinco días consecutivos y cumple tres días de franco. El ciclo continúa de manera ininterrumpida a través de meses y años.  
**Trazabilidad:** `RN-004 → HU-004 → CU-04 → CP-004`

### RN-005 — Secuencia circular de turnos

**Estado:** Aprobada  
**Prioridad:** Crítica  
**Descripción:** Al finalizar los tres francos, el siguiente bloque usa la secuencia Mañana → Noche → Tarde → Mañana.  
**Trazabilidad:** `RN-005 → HU-005 → CU-04 → CP-005`

### RN-006 — Continuidad entre meses

**Estado:** Aprobada  
**Prioridad:** Crítica  
**Descripción:** El cambio de mes no reinicia el ciclo, no corta francos y no modifica un bloque ya iniciado.  
**Trazabilidad:** `RN-006 → HU-006 → CU-04 → CP-006`

### RN-007 — Integridad del bloque laboral

**Estado:** Aprobada  
**Prioridad:** Crítica  
**Descripción:** Los cinco días de un bloque mantienen el mismo turno y el mismo móvil, salvo una modificación real autorizada y auditada.  
**Trazabilidad:** `RN-007 → HU-007 → CU-04 → CP-007`

### RN-008 — Rotación general de móviles

**Estado:** Aprobada  
**Prioridad:** Crítica  
**Descripción:** La configuración general utiliza la secuencia circular 1 → 5 → 3 → 2 → 1.  
**Trazabilidad:** `RN-008 → HU-008 → CU-04 → CP-008`

### RN-009 — Cambio de móvil al inicio del bloque

**Estado:** Aprobada  
**Prioridad:** Crítica  
**Descripción:** El móvil solo puede cambiar al comenzar un nuevo bloque de cinco días. Nunca cambia durante el bloque, durante los francos ni por el mero cambio de mes.  
**Trazabilidad:** `RN-009 → HU-009 → CU-04 → CP-009`

### RN-010 — Estado inicial derivado del histórico

**Estado:** Aprobada  
**Prioridad:** Crítica  
**Descripción:** La hoja `Móviles Cba 26-27` constituye la fuente oficial del estado inicial. Para cada inspector o posición, el inicializador obtiene la última fecha histórica válida, la posición del ciclo 5×3, el turno, el móvil, el grupo de francos y las posiciones de rotación. El motor continúa desde ese estado sin reiniciar ciclos ni inventar valores manuales. Una inconsistencia debe corregirse antes de confirmar la inicialización.  
**Trazabilidad:** `RN-010 → HU-010 → CU-04/CU-14 → CP-010`

### RN-011 — Configuraciones particulares

**Estado:** Aprobada  
**Prioridad:** Alta  
**Descripción:** Las excepciones de rotación se representan mediante configuraciones operativas con vigencia. No deben codificarse nombres de inspectores dentro del motor.  
**Trazabilidad:** `RN-011 → HU-011 → CU-05 → CP-011`

### RN-012 — Grupos de franco

**Estado:** Aprobada  
**Prioridad:** Alta  
**Descripción:** Dos o más inspectores pueden compartir el mismo patrón de francos aunque tengan secuencias de móviles diferentes.  
**Trazabilidad:** `RN-012 → HU-012 → CU-05 → CP-012`

### RN-013 — Bases operativas de los móviles

**Estado:** Aprobada  
**Prioridad:** Alta  
**Descripción:** Los móviles 1, 2, 3 y 5 parten del Obrador. El móvil 4 parte de Ruta 53.  
**Trazabilidad:** `RN-013 → HU-013 → CU-06 → CP-013`

### RN-014 — Horarios por móvil

**Estado:** Aprobada  
**Prioridad:** Crítica  
**Descripción:** Móviles 1, 2 y 4: M 05:00, T 13:00, N 21:00. Móviles 3 y 5: M 07:00, T 15:00, N 23:00.  
**Implementación 2.6:** duración obligatoria de 480 minutos y fecha operativa igual a la fecha de inicio.  
**Trazabilidad:** `RN-014 → HU-014 → CU-06 → CP-014`

### RN-015 — Capacidad física

**Estado:** Aprobada  
**Prioridad:** Crítica  
**Descripción:** Un móvil puede tener como máximo dos inspectores asignados simultáneamente en el mismo turno.  
**Trazabilidad:** `RN-015 → HU-015 → CU-07 → CP-015`

### RN-016 — Cobertura objetivo y huecos justificados

**Estado:** Aprobada  
**Prioridad:** Crítica  
**Descripción:** Cada móvil y turno tiene una cobertura objetivo de una persona y una capacidad máxima de dos. Cero personas genera un hueco con alerta; una persona representa cobertura normal; dos personas representan cobertura reforzada o solapamiento válido; tres o más se bloquean. El hueco puede conservarse, pero para aprobar y publicar la cuadratura debe registrarse motivo y responsable. El sistema no inventa reemplazos.  
**Implementación 2.6:** `v_tablero_huecos`, `fn_tablero_huecos`, endpoint `/reports/gaps` y tablero web.  
**Trazabilidad:** `RN-016 → HU-016 → CU-07 → CP-016`

### RN-017 — Ausencias cortas

**Estado:** Aprobada  
**Prioridad:** Alta  
**Descripción:** Una enfermedad de uno o pocos días, falta o novedad puntual no modifica la planificación; genera una novedad real y una necesidad de cobertura.  
**Trazabilidad:** `RN-017 → HU-017 → CU-08 → CP-017`

### RN-018 — Registro de licencia

**Estado:** Aprobada  
**Prioridad:** Alta  
**Descripción:** Las licencias no poseen un ciclo de negocio especial. Se registran como una novedad con inspector, fecha de inicio, fecha final opcional, motivo, estado y auditoría. La cuadratura base permanece intacta. La licencia puede afectar la planificación o la ejecución real según el momento en que se conozca y genera la alerta de cobertura correspondiente.  
**Trazabilidad:** `RN-018 → HU-018 → CU-09 → CP-018`

### RN-019 — Reemplazo opcional de una licencia

**Estado:** Aprobada  
**Prioridad:** Alta  
**Descripción:** Una licencia no exige asignar automáticamente un reemplazo. Cuando exista una persona identificada y aprobada, se registra su asignación con posición, vigencia, motivo y aprobador. Si no existe reemplazo, permanece el hueco con alerta y justificación al publicar.  
**Trazabilidad:** `RN-019 → HU-019 → CU-10 → CP-019`

### RN-020 — Conservación del titular

**Estado:** Aprobada  
**Prioridad:** Alta  
**Descripción:** La asignación temporal de otra persona nunca reemplaza la identidad del titular de la posición. La proyección diaria conserva `inspector_titular_id` y registra por separado `inspector_asignado_id`.  
**Trazabilidad:** `RN-020 → HU-020 → CU-10 → CP-020`

### RN-021 — Vacaciones de 7 días corridos

**Estado:** Aprobada  
**Prioridad:** Crítica  
**Descripción:** Las vacaciones comienzan después de tres francos normales. Para siete días corridos se aplica la secuencia `3F + 7V + 1F + regreso a la cuadratura planificada vigente`. No existe trabajo a demanda.  
**Trazabilidad:** `RN-021 → HU-021 → CU-11 → CP-021`

### RN-022 — Vacaciones de 14 o 28 días corridos

**Estado:** Aprobada  
**Prioridad:** Crítica  
**Descripción:** Las vacaciones comienzan después de tres francos normales. Para catorce o veintiocho días corridos se aplica `3F + V + 1 trabajo a demanda + 1F + regreso a la cuadratura planificada vigente`. El trabajo a demanda se asigna donde exista necesidad, puede ser en cualquier móvil, prioriza tarde o noche y debe respetar la capacidad máxima.  
**Trazabilidad:** `RN-022 → HU-022 → CU-11 → CP-022`

### RN-023 — Vacaciones de 21 o 35 días corridos

**Estado:** Aprobada  
**Prioridad:** Crítica  
**Descripción:** Las vacaciones comienzan después de tres francos normales. Para veintiuno o treinta y cinco días corridos se aplica `3F + V + 2 trabajos a demanda + 1F + regreso a la cuadratura planificada vigente`. Los trabajos a demanda se asignan donde exista necesidad, pueden ser en cualquier móvil, priorizan tarde o noche y deben respetar la capacidad máxima.  
**Trazabilidad:** `RN-023 → HU-023 → CU-11 → CP-023`

### RN-024 — Preservación y comparación

**Estado:** Aprobada  
**Prioridad:** Alta  
**Descripción:** El sistema debe conservar el valor planificado, el valor real y la causa de la diferencia para permitir comparación y reportes.  
**Trazabilidad:** `RN-024 → HU-024 → CU-12 → CP-024`

### RN-025 — Auditoría obligatoria

**Estado:** Aprobada  
**Prioridad:** Crítica  
**Descripción:** Toda modificación debe registrar usuario, fecha y hora, motivo, valor anterior, valor nuevo y aprobación cuando corresponda.  
**Trazabilidad:** `RN-025 → HU-025 → CU-13 → CP-025`

### RN-026 — Inicialización única desde Excel

**Estado:** Aprobada  
**Prioridad:** Alta  
**Descripción:** El sistema utilizará una única vez el archivo Excel aprobado y exclusivamente la hoja `Móviles CBA 26-27` para crear la cuadratura base inicial, sus bloques históricos, los estados iniciales, grupos de francos, posiciones y asignaciones necesarias. La operación debe incluir validación, vista previa, confirmación administrativa, ejecución transaccional y auditoría del archivo de origen. Una vez confirmada exitosamente la inicialización, el sistema bloqueará las importaciones ordinarias y toda planificación futura será generada por el motor de reglas. Una reinicialización solo podrá realizarse como procedimiento administrativo extraordinario antes de comenzar la operación efectiva, eliminando de forma controlada la inicialización anterior.  
**Implementación 2.6:** parser, staging, confirmación/reversión SQL, CLI y API incluidos.  
**Trazabilidad:** `RN-026 → HU-026 → CU-14 → CP-026`

### RN-027 — Integridad de asignación

**Estado:** Aprobada  
**Prioridad:** Crítica  
**Descripción:** Un inspector no puede estar en dos móviles o turnos superpuestos. Un inspector inactivo o con licencia vigente no puede recibir una asignación ordinaria.  
**Trazabilidad:** `RN-027 → HU-027 → CU-07 → CP-027`

### RN-028 — Versionado, aprobación y publicación automática

**Estado:** Aprobada  
**Prioridad:** Crítica  
**Descripción:** El flujo es `Borrador → En revisión → Observada → Borrador` o `Borrador → En revisión → Aprobada y publicada → Cerrada`. Administración de Seguridad Vial prepara y envía. El Jefe del sector observa y devuelve, o aprueba; la aprobación publica automáticamente en la misma transacción. Una versión publicada es inmutable y toda corrección crea una nueva versión auditada. El Jefe del sector cierra el período.  
**Trazabilidad:** `RN-028 → HU-028 → CU-15 → CP-028`

### RN-029 — Roles y permisos operativos

**Estado:** Aprobada  
**Prioridad:** Alta  
**Descripción:** Administración de Seguridad Vial puede crear y modificar borradores, registrar novedades y huecos, justificar, validar y enviar a revisión, pero no aprobar su propia cuadratura. El Jefe del sector puede observar, devolver, aprobar/publicar, aceptar huecos justificados y cerrar períodos. El Administrador del sistema conserva funciones técnicas extraordinarias y auditadas.  
**Trazabilidad:** `RN-029 → HU-029 → CU-15/CU-16 → CP-029`

### RN-030 — Histórico y regresión

**Estado:** Aprobada  
**Prioridad:** Alta  
**Descripción:** La cuadratura histórica aprobada debe poder utilizarse como referencia de regresión para verificar que el generador reproduce patrones conocidos.  
**Trazabilidad:** `RN-030 → HU-030 → CU-17 → CP-030`


### RN-031 — Cuadratura operativa propia del móvil 4

**Estado:** Aprobada  
**Prioridad:** Crítica  
**Descripción:** El móvil 4 posee cinco posiciones continuas, independientes de la persona que las ocupa, con ciclo 5×3 y turnos `M → N → T`. Las anclas verificadas en la hoja histórica son:

| Posición | Referencia histórica | Ancla | Código | Desfase en días |
|---|---|---:|---|---:|
| M4-P01 | Del Bel | 01/05/2026 | `M4` | 0 |
| M4-P02 | Carranza M. | 02/05/2026 | `T4` | 1 |
| M4-P03 | Haro / Ramos G. | 04/05/2026 | `N4` | 3 |
| M4-P04 | Carranza G. | 05/05/2026 | `M4` | 4 |
| M4-P05 | Mainardi | 07/05/2026 | `T4` | 6 |

La sustitución de una persona no reinicia la posición. `M4-P03` es el rol del móvil 4 dentro de la dupla Haro–Ramos G. Las cinco posiciones permiten cobertura diaria de mañana, tarde y noche y solapamientos periódicos de hasta dos personas.  
**Implementación 2.6:** vigencias, sustitución de ocupantes, posición externa vinculada y vista vigente.  
**Trazabilidad:** `RN-031 → HU-031 → CU-18 → CP-031`

### RN-032 — Dupla operativa vinculada Haro–Ramos G.

**Estado:** Aprobada  
**Prioridad:** Crítica  
**Descripción:** Del 01/05/2026 al 30/09/2026, Haro y Ramos G. comparten exactamente ciclo, turnos, bloques y francos. En cada día de trabajo, una posición ocupa el móvil 4 y la otra el móvil externo vigente; intercambian roles sin cortar bloques. La secuencia externa observada es `5 → 3 → 2 → 1 → 5`. Las novedades no reinician ni adelantan la rotación. No se detectó otra dupla que cumpla simultáneamente igualdad completa de turnos/francos y alternancia complementaria del móvil 4.  
**Implementación 2.6:** `sp_intercambiar_ocupantes_grupo_vinculado` conserva posiciones y cambia ocupantes por vigencia.  
**Trazabilidad:** `RN-032 → HU-032 → CU-19 → CP-032`

## Reglas que requieren resolución complementaria

- Duración formal de los turnos y fecha operativa del turno nocturno.
- Modelo físico SQL, índices y restricciones.
- Implementación técnica del inicializador y su reversión.
- Requisitos no funcionales e infraestructura final.
