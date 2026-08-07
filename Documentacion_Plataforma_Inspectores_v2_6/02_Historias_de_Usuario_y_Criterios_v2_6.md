# Historias de Usuario y Criterios de Aceptación

**Versión:** 2.6

Cada historia se vincula de forma única con una regla de negocio.

## HU-001 — Separación entre planificación y operación real

**Regla asociada:** RN-001  
**Historia:** Como **supervisor**, quiero **mantener separados lo planificado y lo ocurrido**, para **poder explicar cualquier diferencia operativa**.

### Criterios de aceptación

- **CA-001-01:** Una novedad real no altera el valor planificado.
- **CA-001-02:** La consulta muestra ambos valores y el motivo de diferencia.

## HU-002 — Horizonte de planificación

**Regla asociada:** RN-002  
**Historia:** Como **supervisor**, quiero **generar la planificación de hasta doce meses**, para **organizar recursos con anticipación**.

### Criterios de aceptación

- **CA-002-01:** Se puede seleccionar un período máximo de doce meses.
- **CA-002-02:** El sistema rechaza un período superior sin autorización/configuración.

## HU-003 — Codificación operativa

**Regla asociada:** RN-003  
**Historia:** Como **administrador**, quiero **usar una codificación única y validada**, para **evitar interpretaciones ambiguas**.

### Criterios de aceptación

- **CA-003-01:** Solo se aceptan códigos configurados.
- **CA-003-02:** Un código inválido produce error identificable antes de guardar o importar.

## HU-004 — Ciclo laboral continuo 5×3

**Regla asociada:** RN-004  
**Historia:** Como **supervisor**, quiero **generar automáticamente el ciclo continuo 5×3**, para **conservar la cuadratura histórica**.

### Criterios de aceptación

- **CA-004-01:** Cada bloque contiene cinco días de trabajo y tres francos.
- **CA-004-02:** El ciclo continúa después del último día del mes.

## HU-005 — Secuencia circular de turnos

**Regla asociada:** RN-005  
**Historia:** Como **supervisor**, quiero **rotar los turnos en la secuencia M → N → T**, para **mantener la continuidad operativa**.

### Criterios de aceptación

- **CA-005-01:** Después de M corresponde N; después de N corresponde T; después de T corresponde M.
- **CA-005-02:** La secuencia no cambia por inspector salvo configuración explícita aprobada.

## HU-006 — Continuidad entre meses

**Regla asociada:** RN-006  
**Historia:** Como **supervisor**, quiero **continuar la cuadratura al cambiar el mes**, para **evitar reinicios artificiales**.

### Criterios de aceptación

- **CA-006-01:** Un bloque iniciado en un mes termina en el mes siguiente sin reinicio.
- **CA-006-02:** Los francos también continúan a través del cambio de mes.

## HU-007 — Integridad del bloque laboral

**Regla asociada:** RN-007  
**Historia:** Como **supervisor**, quiero **conservar turno y móvil durante cada bloque**, para **impedir cortes inválidos**.

### Criterios de aceptación

- **CA-007-01:** Los cinco días mantienen móvil y turno.
- **CA-007-02:** Una modificación excepcional exige motivo y auditoría.

## HU-008 — Rotación general de móviles

**Regla asociada:** RN-008  
**Historia:** Como **supervisor**, quiero **aplicar la secuencia general de móviles 1 → 5 → 3 → 2**, para **automatizar la rotación**.

### Criterios de aceptación

- **CA-008-01:** La secuencia general repite 1, 5, 3, 2.
- **CA-008-02:** Se admite una posición inicial diferente mediante configuración.

## HU-009 — Cambio de móvil al inicio del bloque

**Regla asociada:** RN-009  
**Historia:** Como **supervisor**, quiero **cambiar de móvil solamente al iniciar un bloque**, para **no alterar asignaciones en curso**.

### Criterios de aceptación

- **CA-009-01:** El cambio se aplica al primer día del nuevo bloque.
- **CA-009-02:** No se cambia el móvil en medio de los cinco días ni durante F.

## HU-010 — Estado inicial derivado del histórico

**Regla asociada:** RN-010  
**Historia:** Como **Administración de Seguridad Vial**, quiero **que el estado inicial se reconstruya desde el Excel histórico**, para **continuar el ciclo sin anclas manuales ni reinicios**.

### Criterios de aceptación

- **CA-010-01:** La fuente es la hoja `Móviles Cba 26-27`.
- **CA-010-02:** Se reconstruyen fecha, ciclo, turno, móvil, grupo de francos y posiciones de rotación.
- **CA-010-03:** El motor continúa desde el último estado válido.
- **CA-010-04:** Una inconsistencia bloquea la confirmación y se muestra para corrección.
- **CA-010-05:** El mismo Excel y las mismas reglas producen el mismo estado inicial.

## HU-011 — Configuraciones particulares

**Regla asociada:** RN-011  
**Historia:** Como **administrador**, quiero **asignar configuraciones operativas particulares**, para **resolver excepciones sin modificar código**.

### Criterios de aceptación

- **CA-011-01:** La configuración tiene vigencia desde/hasta.
- **CA-011-02:** El motor no contiene condiciones por apellido o nombre.

## HU-012 — Grupos de franco

**Regla asociada:** RN-012  
**Historia:** Como **administrador**, quiero **agrupar inspectores por patrón de francos**, para **mantener sincronizaciones reales**.

### Criterios de aceptación

- **CA-012-01:** Dos inspectores pueden compartir el mismo calendario de francos.
- **CA-012-02:** La rotación de móviles puede diferir sin alterar el grupo de francos.

## HU-013 — Bases operativas de los móviles

**Regla asociada:** RN-013  
**Historia:** Como **administrador**, quiero **configurar la base de salida de cada móvil**, para **respetar la operación territorial**.

### Criterios de aceptación

- **CA-013-01:** Cada móvil tiene una base operativa vigente.
- **CA-013-02:** El móvil 4 queda asociado a Ruta 53.

## HU-014 — Horarios por móvil

**Regla asociada:** RN-014  
**Historia:** Como **administrador**, quiero **configurar horarios por móvil y turno**, para **calcular correctamente las asignaciones**.

### Criterios de aceptación

- **CA-014-01:** Los horarios se obtienen por móvil y turno.
- **CA-014-02:** Una asignación nocturna conserva el horario configurado.

## HU-015 — Capacidad física

**Regla asociada:** RN-015  
**Historia:** Como **supervisor**, quiero **impedir más de dos inspectores por móvil y turno**, para **respetar la capacidad física**.

### Criterios de aceptación

- **CA-015-01:** La tercera asignación simultánea es rechazada.
- **CA-015-02:** Una o dos asignaciones son válidas si cumplen el resto de las reglas.

## HU-016 — Cobertura y huecos justificados

**Regla asociada:** RN-016  
**Historia:** Como **Administración de Seguridad Vial**, quiero **detectar huecos y documentar su aceptación**, para **publicar una cuadratura transparente aunque no sea posible cubrir todos los servicios**.

### Criterios de aceptación

- **CA-016-01:** El objetivo es una persona por móvil y turno.
- **CA-016-02:** Cero genera una alerta.
- **CA-016-03:** Una persona indica cobertura normal.
- **CA-016-04:** Dos personas indican cobertura reforzada.
- **CA-016-05:** Una tercera asignación se bloquea.
- **CA-016-06:** Aprobar/publicar un hueco exige motivo y responsable.
- **CA-016-07:** El sistema no crea reemplazos automáticos.

## HU-017 — Ausencias cortas

**Regla asociada:** RN-017  
**Historia:** Como **operador**, quiero **registrar ausencias cortas como novedades reales**, para **preservar la planificación original**.

### Criterios de aceptación

- **CA-017-01:** La ausencia se registra en la real.
- **CA-017-02:** Se crea una necesidad de cobertura y se conserva el plan original.

## HU-018 — Registrar licencia

**Regla asociada:** RN-018  
**Historia:** Como **Administración de Seguridad Vial**, quiero **registrar una licencia sin reglas adicionales**, para **reflejar la novedad y su impacto de cobertura de forma auditada**.

### Criterios de aceptación

- **CA-018-01:** La fecha inicial es obligatoria y la final puede quedar abierta.
- **CA-018-02:** Se registran motivo, estado, usuario y fechas de auditoría.
- **CA-018-03:** La cuadratura base no se modifica.
- **CA-018-04:** La licencia conocida se aplica a la planificada; la no prevista puede registrarse en la real.
- **CA-018-05:** La ausencia de reemplazo genera hueco y alerta, no un nombre ficticio.

## HU-019 — Registrar reemplazo opcional

**Regla asociada:** RN-019  
**Historia:** Como **Administración de Seguridad Vial**, quiero **registrar un reemplazo solamente cuando esté identificado y aprobado**, para **cubrir una licencia sin inventar personas ni alterar al titular**.

### Criterios de aceptación

- **CA-019-01:** La licencia puede existir sin reemplazo.
- **CA-019-02:** El reemplazo registra persona, posición, vigencia, motivo y aprobador.
- **CA-019-03:** No se permiten vigencias superpuestas para el reemplazante.
- **CA-019-04:** Si no existe reemplazo, el hueco continúa visible.

## HU-020 — Distinguir titular y persona asignada

**Regla asociada:** RN-020  
**Historia:** Como **usuario del cronograma**, quiero **ver por separado al titular y a quien efectivamente cubre la posición**, para **preservar la responsabilidad original y entender los reemplazos**.

### Criterios de aceptación

- **CA-020-01:** El titular permanece vinculado a la posición.
- **CA-020-02:** La asignación diaria diferencia titular y asignado.
- **CA-020-03:** Finalizado el reemplazo, no se requiere reconstruir ni reiniciar la cuadratura base.

## HU-021 — Vacaciones de 7 días corridos

**Regla asociada:** RN-021  
**Historia:** Como **supervisor**, quiero **aplicar el protocolo de vacaciones de siete días corridos**, para **reintegrar al inspector sin romper la cuadratura**.

### Criterios de aceptación

- **CA-021-01:** Las vacaciones comienzan después de tres francos normales.
- **CA-021-02:** Se generan exactamente siete días corridos de `V`.
- **CA-021-03:** Después de las vacaciones se genera un franco adicional.
- **CA-021-04:** No se genera trabajo a demanda.
- **CA-021-05:** Después del franco adicional, el inspector vuelve a la cuadratura planificada vigente para esa fecha.

## HU-022 — Vacaciones de 14 o 28 días corridos

**Regla asociada:** RN-022  
**Historia:** Como **supervisor**, quiero **aplicar el protocolo de vacaciones de catorce o veintiocho días corridos**, para **resolver correctamente el reingreso**.

### Criterios de aceptación

- **CA-022-01:** Las vacaciones comienzan después de tres francos normales.
- **CA-022-02:** Se generan exactamente catorce o veintiocho días corridos de `V`, según corresponda.
- **CA-022-03:** Después de las vacaciones se genera un único día de trabajo a demanda.
- **CA-022-04:** El trabajo a demanda puede asignarse en cualquier móvil donde exista necesidad.
- **CA-022-05:** Se prioriza turno tarde o noche.
- **CA-022-06:** La asignación respeta el máximo de dos inspectores por móvil y turno.
- **CA-022-07:** Después del trabajo a demanda se genera un franco adicional.
- **CA-022-08:** Después del franco adicional, el inspector vuelve a la cuadratura planificada vigente para esa fecha.

## HU-023 — Vacaciones de 21 o 35 días corridos

**Regla asociada:** RN-023  
**Historia:** Como **supervisor**, quiero **aplicar el protocolo de vacaciones de veintiuno o treinta y cinco días corridos**, para **resolver correctamente el reingreso**.

### Criterios de aceptación

- **CA-023-01:** Las vacaciones comienzan después de tres francos normales.
- **CA-023-02:** Se generan exactamente veintiuno o treinta y cinco días corridos de `V`, según corresponda.
- **CA-023-03:** Después de las vacaciones se generan dos días de trabajo a demanda.
- **CA-023-04:** Los trabajos a demanda pueden asignarse en cualquier móvil donde exista necesidad.
- **CA-023-05:** Se priorizan turnos tarde o noche.
- **CA-023-06:** Cada asignación respeta el máximo de dos inspectores por móvil y turno.
- **CA-023-07:** Después de los dos trabajos a demanda se genera un franco adicional.
- **CA-023-08:** Después del franco adicional, el inspector vuelve a la cuadratura planificada vigente para esa fecha.

## HU-024 — Preservación y comparación

**Regla asociada:** RN-024  
**Historia:** Como **supervisor**, quiero **comparar planificación y operación real**, para **medir desvíos y causas**.

### Criterios de aceptación

- **CA-024-01:** Se puede consultar planificado, real y diferencia.
- **CA-024-02:** Los reportes identifican el tipo de novedad.

## HU-025 — Auditoría obligatoria

**Regla asociada:** RN-025  
**Historia:** Como **auditor**, quiero **consultar el historial completo de cambios**, para **garantizar trazabilidad**.

### Criterios de aceptación

- **CA-025-01:** Cada cambio guarda antes/después, usuario, fecha y motivo.
- **CA-025-02:** Los eventos de auditoría no pueden ser eliminados por usuarios comunes.

## HU-026 — Inicialización única de la cuadratura base

**Regla asociada:** RN-026  
**Historia:** Como **administrador**, quiero **inicializar una única vez la cuadratura base desde la hoja `Móviles CBA 26-27` del Excel aprobado**, para **comenzar la operación con el histórico, las posiciones y los estados iniciales correctos, y luego continuar exclusivamente con el motor de reglas**.

### Criterios de aceptación

- **CA-026-01:** El sistema procesa únicamente la hoja `Móviles CBA 26-27`.
- **CA-026-02:** Antes de confirmar, muestra una vista previa con inspectores, fechas, códigos, bloques, francos, posiciones y errores.
- **CA-026-03:** Valida códigos, fechas, duplicados, continuidad 5×3, capacidad, grupos de franco y configuraciones especiales.
- **CA-026-04:** La confirmación es transaccional: ante cualquier error no queda información parcialmente inicializada.
- **CA-026-05:** La inicialización crea exclusivamente la cuadratura base y los datos necesarios para su continuidad; no crea novedades de la cuadratura real.
- **CA-026-06:** Se registra archivo original, nombre de hoja, hash, usuario, fecha, resultado y reporte de validación.
- **CA-026-07:** Después de una inicialización exitosa se bloquean nuevas importaciones ordinarias.
- **CA-026-08:** La reinicialización solo está disponible mediante una acción administrativa extraordinaria antes del inicio operativo y exige eliminar controladamente la inicialización previa.
- **CA-026-09:** El histórico importado queda disponible como Golden Master para pruebas de regresión del motor.

## HU-027 — Integridad de asignación

**Regla asociada:** RN-027  
**Historia:** Como **supervisor**, quiero **bloquear asignaciones incompatibles**, para **evitar superposiciones y errores**.

### Criterios de aceptación

- **CA-027-01:** Se bloquean asignaciones simultáneas incompatibles.
- **CA-027-02:** Una licencia vigente impide la asignación ordinaria.

## HU-028 — Preparar, revisar, aprobar y publicar

**Regla asociada:** RN-028  
**Historia:** Como **Jefe del sector**, quiero **revisar la cuadratura preparada por Administración de Seguridad Vial**, para **aprobar y publicar una versión autorizada y trazable**.

### Criterios de aceptación

- **CA-028-01:** Administración de Seguridad Vial crea y modifica borradores.
- **CA-028-02:** Envía la versión a revisión.
- **CA-028-03:** El Jefe del sector puede observar y devolver con comentarios.
- **CA-028-04:** Aprobar publica automáticamente en la misma transacción.
- **CA-028-05:** La versión publicada es inmutable.
- **CA-028-06:** Todo cambio posterior crea una nueva versión.
- **CA-028-07:** El Jefe del sector puede cerrar el período.
- **CA-028-08:** Todas las transiciones quedan auditadas.

## HU-029 — Roles de Seguridad Vial

**Regla asociada:** RN-029  
**Historia:** Como **Administrador del sistema**, quiero **asignar los roles Administración de Seguridad Vial y Jefe del sector**, para **separar preparación y aprobación**.

### Criterios de aceptación

- **CA-029-01:** Administración de Seguridad Vial no puede aprobar su propia versión.
- **CA-029-02:** El Jefe del sector puede observar, aprobar/publicar y cerrar.
- **CA-029-03:** Los permisos se validan en backend.
- **CA-029-04:** Las acciones técnicas extraordinarias quedan separadas y auditadas.

## HU-030 — Histórico y regresión

**Regla asociada:** RN-030  
**Historia:** Como **equipo de QA funcional**, quiero **comparar la generación con la cuadratura aprobada**, para **detectar regresiones antes de producción**.

### Criterios de aceptación

- **CA-030-01:** Existe un conjunto de períodos históricos de referencia.
- **CA-030-02:** Una diferencia no esperada produce una prueba fallida con detalle.

## HU-031 — Cuadratura operativa propia del móvil 4

**Regla asociada:** RN-031  
**Historia:** Como **supervisor**, quiero **administrar la cuadratura propia del móvil 4 mediante posiciones continuas**, para **mantener cobertura diaria sin depender de nombres fijos**.

### Criterios de aceptación

- **CA-031-01:** El sistema permite configurar cinco posiciones desfasadas con ciclo 5×3.
- **CA-031-02:** Cada posición permanece en el móvil 4 y rota los turnos `M → N → T`.
- **CA-031-03:** La sustitución de una persona no reinicia la posición ni altera sus francos.
- **CA-031-04:** El sistema admite hasta dos personas en el mismo turno, pero nunca una tercera.
- **CA-031-05:** Un hueco en una posición genera una necesidad de cobertura sin modificar la cuadratura base.
- **CA-031-06:** Se crean las posiciones `M4-P01` a `M4-P05` con las anclas definidas en RN-031.
- **CA-031-07:** Los desfases desde el 01/05/2026 son 0, 1, 3, 4 y 6 días.

## HU-032 — Dupla operativa vinculada

**Regla asociada:** RN-032  
**Historia:** Como **supervisor**, quiero **vincular dos posiciones que compartan turnos y francos, alternando entre el móvil 4 y un móvil externo**, para **reproducir la operación aprobada sin programar excepciones por inspector**.

### Criterios de aceptación

- **CA-032-01:** Las dos posiciones comparten exactamente las fechas de trabajo y franco.
- **CA-032-02:** Las posiciones usan el mismo turno en cada bloque.
- **CA-032-03:** Una posición ocupa el móvil 4 y la otra el móvil externo vigente.
- **CA-032-04:** La alternancia no divide bloques de trabajo en curso.
- **CA-032-05:** Una vacación o ausencia no reinicia ni hace avanzar la rotación de la dupla.
- **CA-032-06:** Al finalizar la novedad, la persona vuelve a la posición vigente de la dupla según el protocolo correspondiente.
- **CA-032-07:** La configuración inicial contiene una única dupla vinculada: Haro–Ramos G.
- **CA-032-08:** No se crean otras duplas automáticamente por coincidencias parciales.
