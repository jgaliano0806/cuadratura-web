# Casos de Prueba y Matriz de Trazabilidad

**Versión:** 2.6

## Casos de prueba

### CP-001 — Novedad no pisa planificación

**Preparación/Pasos:** Crear T2 planificado y registrar EF.  
**Resultado esperado:** La planificación conserva T2; la real muestra EF y la diferencia.

### CP-002 — Horizonte máximo

**Preparación/Pasos:** Solicitar 12 meses y luego 13.  
**Resultado esperado:** 12 se acepta; 13 se rechaza o requiere configuración.

### CP-003 — Código inválido

**Preparación/Pasos:** Importar X7.  
**Resultado esperado:** El lote no se confirma y muestra fila/columna.

### CP-004 — Ciclo 5×3

**Preparación/Pasos:** Generar desde una fecha ancla.  
**Resultado esperado:** Se observan 5 trabajos + 3 F repetidos.

### CP-005 — Secuencia M-N-T

**Preparación/Pasos:** Generar tres bloques consecutivos.  
**Resultado esperado:** Bloques M, N y T en ese orden.

### CP-006 — Cruce de mes

**Preparación/Pasos:** Iniciar bloque el día 29.  
**Resultado esperado:** El bloque continúa 5 días sin reinicio.

### CP-007 — Integridad del bloque

**Preparación/Pasos:** Intentar cambiar móvil en día 3.  
**Resultado esperado:** Se rechaza o exige cambio excepcional auditado.

### CP-008 — Rotación 1-5-3-2

**Preparación/Pasos:** Generar cuatro períodos mensuales configurados.  
**Resultado esperado:** Se obtiene 1,5,3,2 y reinicia en 1.

### CP-009 — Cambio al nuevo bloque

**Preparación/Pasos:** Bloque cruza de mes y termina luego.  
**Resultado esperado:** El móvil cambia recién en el siguiente bloque.

### CP-010 — Estado inicial desde el histórico

**Preparación/Pasos:** Inicializar desde `Móviles Cba 26-27` y repetir con una inconsistencia intencional.  
**Resultado esperado:** Se reconstruyen ciclo, turno, móvil y grupo de francos sin carga manual; la inconsistencia bloquea la confirmación.

### CP-011 — Configuración especial

**Preparación/Pasos:** Asignar rotación que incluye móvil 4.  
**Resultado esperado:** El motor usa datos configurados sin reglas por nombre.

### CP-012 — Francos compartidos

**Preparación/Pasos:** Dos inspectores en mismo grupo con móviles distintos.  
**Resultado esperado:** Los F coinciden y los móviles pueden diferir.

### CP-013 — Base por móvil

**Preparación/Pasos:** Consultar móviles 1 y 4.  
**Resultado esperado:** M1=Obrador; M4=Ruta 53.

### CP-014 — Horarios

**Preparación/Pasos:** Consultar M3 y N1.  
**Resultado esperado:** M3=07:00; N1=21:00.

### CP-015 — Capacidad máxima

**Preparación/Pasos:** Asignar tres inspectores al mismo móvil/turno.  
**Resultado esperado:** La tercera asignación se rechaza.

### CP-016 — Cobertura, hueco y justificación

**Preparación/Pasos:** Probar cero, una, dos y tres asignaciones; intentar aprobar un hueco sin motivo y luego con motivo y responsable.  
**Resultado esperado:** Cero alerta; uno cubierto; dos reforzado; tres bloqueado; sin justificación no aprueba/publica; con justificación puede aprobarse.

### CP-017 — Ausencia corta

**Preparación/Pasos:** Registrar EF de dos días.  
**Resultado esperado:** No cambia el plan; se crea necesidad de cobertura.

### CP-018 — Registro de licencia abierta

**Preparación/Pasos:** Registrar una licencia con fecha inicial, sin fecha final y sin reemplazo.  
**Resultado esperado:** La novedad queda auditada, la base no cambia y la proyección aplicable genera el faltante de cobertura sin crear una vacante o persona ficticia.

### CP-019 — Reemplazo opcional aprobado

**Preparación/Pasos:** Asociar a una licencia una persona aprobada, posición y vigencia.  
**Resultado esperado:** Se preserva el titular, se registra la persona asignada y se rechazan superposiciones del reemplazante.

### CP-020 — Titular preservado

**Preparación/Pasos:** Consultar una asignación diaria cubierta por un reemplazante y luego finalizar su vigencia.  
**Resultado esperado:** La asignación muestra titular y asignado por separado; al finalizar, la cuadratura base continúa sin reinicio.

### CP-021 — Vacaciones de 7 días corridos

**Preparación/Pasos:** Crear una solicitud de siete días inmediatamente después de tres francos normales.  
**Resultado esperado:** Se obtiene `3F + 7V + 1F`; no se genera trabajo a demanda; luego se retoma la cuadratura planificada vigente.

### CP-022 — Vacaciones de 14 y 28 días corridos

**Preparación/Pasos:** Ejecutar un caso de catorce días y otro de veintiocho, ambos después de tres francos.  
**Resultado esperado:** En cada caso se generan los días corridos de `V`, un único trabajo a demanda, un franco adicional y retorno a la cuadratura. El trabajo prioriza T/N, puede usar cualquier móvil y no supera capacidad.

### CP-023 — Vacaciones de 21 y 35 días corridos

**Preparación/Pasos:** Ejecutar un caso de veintiún días y otro de treinta y cinco, ambos después de tres francos.  
**Resultado esperado:** En cada caso se generan los días corridos de `V`, dos trabajos a demanda, un franco adicional y retorno a la cuadratura. Los trabajos priorizan T/N, pueden usar cualquier móvil y no superan capacidad.

### CP-024 — Plan vs real

**Preparación/Pasos:** Generar reporte con ausencias.  
**Resultado esperado:** Se visualiza valor original, real y motivo.

### CP-025 — Auditoría

**Preparación/Pasos:** Modificar asignación.  
**Resultado esperado:** Se guarda antes/después, usuario y motivo.

### CP-026 — Inicialización única, atómica y bloqueada

**Preparación/Pasos:**
1. Cargar un Excel válido con la hoja `Móviles CBA 26-27`.
2. Revisar la vista previa y confirmar.
3. Intentar confirmar el mismo u otro archivo por segunda vez.
4. Repetir el escenario con un archivo que contenga un error crítico.

**Resultado esperado:**
- La primera confirmación válida crea la cuadratura base, los estados iniciales y el Golden Master.
- El archivo, hash, usuario, fecha y resultado quedan auditados.
- Una segunda inicialización ordinaria es rechazada.
- El archivo con error crítico no deja datos parciales.
- No se crean novedades ni registros de la cuadratura real.

### CP-027 — Doble asignación

**Preparación/Pasos:** Asignar mismo inspector a dos móviles simultáneos.  
**Resultado esperado:** Se rechaza.

### CP-028 — Aprobación y publicación automática

**Preparación/Pasos:** Administración de Seguridad Vial envía; el Jefe observa, se corrige y luego aprueba; intentar editar la versión publicada.  
**Resultado esperado:** Observar devuelve sin publicar; aprobar publica en la misma transacción; la versión queda inmutable; una modificación crea nueva versión.

### CP-029 — Separación de roles

**Preparación/Pasos:** Intentar aprobar con Administración de Seguridad Vial y luego con Jefe del sector.  
**Resultado esperado:** El primer rol no puede aprobar; el Jefe puede aprobar/publicar y cerrar.

### CP-030 — Golden master

**Preparación/Pasos:** Generar período histórico aprobado.  
**Resultado esperado:** La comparación coincide o informa diferencias exactas.

### CP-033 — Caso Acosta septiembre-octubre

**Preparación/Pasos:** Configurar secuencia desde 17/09.  
**Resultado esperado:** 17-21 T2; 22-24 F; 25-29 M2; 30/09-02/10 F; 03-07 N1; 08-10 F; 11-15 T1; 16-18 F; 19-23 M1; 24-26 F; 27-31 N1.

### CP-031 — Anclas y desfases del móvil 4

**Preparación/Pasos:** Cargar `M4-P01` a `M4-P05` con anclas 01/05, 02/05, 04/05, 05/05 y 07/05/2026.  
**Resultado esperado:** Se reproducen los desfases 0, 1, 3, 4 y 6, la cobertura diaria y los solapamientos máximos de dos.

### CP-032 — Dupla vinculada Haro–Ramos G.

**Preparación/Pasos:** Comparar Haro y Ramos G. del 01/05/2026 al 30/09/2026 y buscar otras combinaciones entre usuarios del móvil 4.  
**Resultado esperado:** Haro y Ramos G. comparten turnos/francos y solo uno ocupa el móvil 4 en cada jornada; no aparece otra dupla con ambas condiciones.

## Matriz de trazabilidad

| RN | HU | CU | Criterios | CP |
|---|---|---|---|---|
| RN-001 | HU-001 | CU-01 | CA-001-01 / CA-001-02 | CP-001 |
| RN-002 | HU-002 | CU-02 | CA-002-01 / CA-002-02 | CP-002 |
| RN-003 | HU-003 | CU-03 | CA-003-01 / CA-003-02 | CP-003 |
| RN-004 | HU-004 | CU-04 | CA-004-01 / CA-004-02 | CP-004 |
| RN-005 | HU-005 | CU-04 | CA-005-01 / CA-005-02 | CP-005 |
| RN-006 | HU-006 | CU-04 | CA-006-01 / CA-006-02 | CP-006 |
| RN-007 | HU-007 | CU-04 | CA-007-01 / CA-007-02 | CP-007 |
| RN-008 | HU-008 | CU-04 | CA-008-01 / CA-008-02 | CP-008 |
| RN-009 | HU-009 | CU-04 | CA-009-01 / CA-009-02 | CP-009 |
| RN-010 | HU-010 | CU-04/CU-14 | CA-010-01 a CA-010-05 | CP-010 |
| RN-011 | HU-011 | CU-05 | CA-011-01 / CA-011-02 | CP-011 |
| RN-012 | HU-012 | CU-05 | CA-012-01 / CA-012-02 | CP-012 |
| RN-013 | HU-013 | CU-06 | CA-013-01 / CA-013-02 | CP-013 |
| RN-014 | HU-014 | CU-06 | CA-014-01 / CA-014-02 | CP-014 |
| RN-015 | HU-015 | CU-07 | CA-015-01 / CA-015-02 | CP-015 |
| RN-016 | HU-016 | CU-07 | CA-016-01 a CA-016-07 | CP-016 |
| RN-017 | HU-017 | CU-08 | CA-017-01 / CA-017-02 | CP-017 |
| RN-018 | HU-018 | CU-09 | CA-018-01 a CA-018-05 | CP-018 |
| RN-019 | HU-019 | CU-10 | CA-019-01 a CA-019-04 | CP-019 |
| RN-020 | HU-020 | CU-10 | CA-020-01 a CA-020-03 | CP-020 |
| RN-021 | HU-021 | CU-11 | CA-021-01 a CA-021-05 | CP-021 |
| RN-022 | HU-022 | CU-11 | CA-022-01 a CA-022-08 | CP-022 |
| RN-023 | HU-023 | CU-11 | CA-023-01 a CA-023-08 | CP-023 |
| RN-024 | HU-024 | CU-12 | CA-024-01 / CA-024-02 | CP-024 |
| RN-025 | HU-025 | CU-13 | CA-025-01 / CA-025-02 | CP-025 |
| RN-026 | HU-026 | CU-14 | CA-026-01 a CA-026-09 | CP-026 |
| RN-027 | HU-027 | CU-07 | CA-027-01 / CA-027-02 | CP-027 |
| RN-028 | HU-028 | CU-15 | CA-028-01 a CA-028-08 | CP-028 |
| RN-029 | HU-029 | CU-15/CU-16 | CA-029-01 a CA-029-04 | CP-029 |
| RN-030 | HU-030 | CU-17 | CA-030-01 / CA-030-02 | CP-030 |
| RN-004 a RN-010 | HU-004 a HU-010 | CU-04 | Criterios de continuidad | CP-033 |
| RN-031 | HU-031 | CU-18 | CA-031-01 a CA-031-07 | CP-031 |
| RN-032 | HU-032 | CU-19 | CA-032-01 a CA-032-08 | CP-032 |

## Casos técnicos agregados en 2.6

### CP-034 — Parser exacto del Excel

**Entrada:** archivo oficial y hoja `Móviles Cba 26-27`.  
**Esperado:** 27 inspectores y tramo histórico completo entre 01/05/2026 y 05/10/2026; las columnas posteriores incompletas se ignoran con advertencia, y la dupla vinculada se detecta.

### CP-035 — Hoja ambigua o VIEJO

**Esperado:** el parser no selecciona `Móviles Cba 26-27 VIEJO` ni acepta más de una hoja exacta.

### CP-036 — Reversión posterior al inicio

**Esperado:** se bloquea cuando existe una capa derivada o un evento REAL.

### CP-037 — Sustitución de posición

**Esperado:** la vigencia anterior termina el día previo y no existe superposición de inspector ni posición.

### CP-038 — Priorización de trabajo a demanda

**Esperado:** selecciona un hueco T; sin T selecciona N; sin T/N selecciona M. Si faltan huecos, no inserta ajustes.
