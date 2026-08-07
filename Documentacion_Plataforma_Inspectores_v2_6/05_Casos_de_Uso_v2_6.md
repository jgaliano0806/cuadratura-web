# Casos de Uso

**Versión:** 2.6

## CU-01 — Consultar planificado y real

**Actor:** Supervisor, operador, consulta.  
**Precondición:** Existe planificación publicada.  
**Flujo principal:**
1. El usuario selecciona período e inspector/móvil.
2. El sistema muestra el valor planificado.
3. El sistema superpone o muestra el valor real.
4. El sistema identifica diferencias y motivos.
**Alternativa:** No existen novedades; ambos valores coinciden.  
**Postcondición:** No se modifica información.  
**RN:** RN-001, RN-024.

## CU-02 — Generar planificación

**Actor:** Supervisor.  
**Precondición:** Existen inspectores, estado inicial y configuraciones vigentes.  
**Flujo principal:**
1. Seleccionar fecha desde/hasta.
2. Validar horizonte máximo.
3. Ejecutar el algoritmo 5×3.
4. Aplicar turnos y móviles.
5. Validar capacidad y superposiciones.
6. Guardar versión en borrador.
**Alternativas:** Falta estado inicial; se rechaza.  
**RN:** RN-002, RN-004 a RN-010.

## CU-03 — Validar codificación

**Actor:** Administrador/importador.  
**Flujo:** validar M/T/N + móvil, F, V y EF antes de persistir.  
**RN:** RN-003.

## CU-04 — Generar bloques continuos

**Actor:** Motor de reglas.  
**Flujo:** crear 5 días de trabajo, 3 francos y siguiente turno sin reinicio mensual.  
**RN:** RN-004 a RN-010.

## CU-05 — Configurar rotación particular

**Actor:** Administrador.  
**Flujo principal:**
1. Crear configuración.
2. Definir secuencia de móviles/turnos.
3. Definir grupo de francos.
4. Asignar inspector y vigencia.
5. Validar que no haya superposición de vigencias.
**RN:** RN-011, RN-012.

## CU-06 — Administrar móviles y horarios

**Actor:** Administrador.  
**Flujo:** configurar base, estado, capacidad y horarios por turno.  
**RN:** RN-013, RN-014.

## CU-07 — Validar cobertura e integridad

**Actor:** Administración de Seguridad Vial.  
**Flujo:**
1. Calcular asignaciones por móvil y turno.
2. Marcar cero como hueco con alerta.
3. Marcar uno como cobertura normal.
4. Marcar dos como cobertura reforzada.
5. Rechazar una tercera asignación.
6. Registrar motivo y responsable para cada hueco conservado.
7. Impedir aprobación/publicación si existe un hueco sin justificar.
**RN:** RN-015, RN-016, RN-027.

## CU-08 — Registrar ausencia corta

**Actor:** Operador.  
**Flujo principal:**
1. Seleccionar inspector y fecha/rango.
2. Registrar tipo y motivo.
3. Mantener planificación original.
4. Crear alerta de cobertura.
5. Registrar reemplazo o hueco justificado.
**RN:** RN-017.

## CU-09 — Registrar licencia

**Actor:** Administración de Seguridad Vial.  
**Flujo:** registrar inspector, fecha inicial, fecha final opcional, motivo y capa de aplicación; aprobar la novedad; materializar su impacto; mostrar la alerta de cobertura. No se crea un flujo de vacante ni búsqueda.  
**RN:** RN-018.

## CU-10 — Registrar reemplazo opcional

**Actor:** Administración de Seguridad Vial; Jefe del sector.  
**Flujo:** seleccionar una licencia, posición, titular, reemplazante y vigencia; validar disponibilidad; registrar motivo y aprobación. Si no existe reemplazo, se mantiene el hueco.  
**RN:** RN-019, RN-020.

## CU-11 — Gestionar vacaciones

**Actor:** Supervisor.  
**Precondiciones:**
- El inspector posee una cuadratura planificada.
- La duración solicitada es 7, 14, 21, 28 o 35 días.
- Existen tres francos normales inmediatamente antes del inicio.

**Flujo principal:**
1. Registrar la duración y fecha de inicio.
2. Calcular los días de vacaciones como días corridos.
3. Mantener intacta la cuadratura base.
4. Aplicar sobre la planificada el protocolo correspondiente:
   - 7 días: `3F + 7V + 1F`;
   - 14 días: `3F + 14V + 1 trabajo a demanda + 1F`;
   - 21 días: `3F + 21V + 2 trabajos a demanda + 1F`;
   - 28 días: `3F + 28V + 1 trabajo a demanda + 1F`;
   - 35 días: `3F + 35V + 2 trabajos a demanda + 1F`.
5. Para cada trabajo a demanda, buscar necesidad operativa.
6. Priorizar turno tarde o noche.
7. Permitir cualquier móvil que tenga necesidad y capacidad disponible.
8. Generar el franco adicional.
9. Reincorporar al inspector a su cuadratura planificada vigente.

**Flujos alternativos:**
- Si no existe capacidad en tarde o noche, se permite otro turno con justificación.
- Si no existe necesidad disponible, el supervisor debe resolver manualmente y dejar motivo auditado.
- Si no existen tres francos previos, la solicitud no puede aprobarse sin una excepción autorizada.

**RN:** RN-021 a RN-023.

## CU-12 — Comparar y reportar

**Actor:** Supervisor, auditor.  
**Flujo:** consultar desvíos, cobertura, ausencias y reemplazos.  
**RN:** RN-024.

## CU-13 — Consultar auditoría

**Actor:** Auditor.  
**Flujo:** buscar por usuario, entidad, fecha y acción.  
**RN:** RN-025.

## CU-14 — Inicializar la cuadratura base desde Excel

**Actor:** Administrador autorizado.  
**Precondiciones:**
- El sistema no posee una inicialización activa.
- El archivo contiene la hoja `Móviles CBA 26-27`.
- Todavía no comenzó la operación efectiva del sistema.

**Flujo principal:**
1. Cargar el archivo Excel aprobado.
2. Verificar la existencia exacta de la hoja `Móviles CBA 26-27`.
3. Interpretar inspectores, fechas y códigos operativos.
4. Reconstruir bloques, francos, posiciones, grupos y estados iniciales desde el último dato histórico válido, sin anclas manuales.
5. Validar reglas generales, móvil 4, duplas vinculadas, continuidad, capacidad y duplicados.
6. Mostrar la vista previa y el reporte de validación.
7. Solicitar confirmación administrativa.
8. Ejecutar la inicialización en una única transacción.
9. Crear la cuadratura base y el Golden Master.
10. Registrar archivo, hash, usuario, fecha y resultado.
11. Bloquear nuevas importaciones ordinarias.

**Flujos alternativos:**
- Si falta la hoja esperada, se rechaza el archivo.
- Si existe un error crítico, no se persiste ningún dato.
- Si ya existe una inicialización activa, se bloquea una nueva confirmación.
- Una reversión solo se admite antes de la operación efectiva, con permiso extraordinario y auditoría.

**Postcondición:** El motor de reglas queda como único responsable de generar la planificación futura.  
**RN:** RN-026.

## CU-15 — Revisar, aprobar y publicar

**Actores:** Administración de Seguridad Vial; Jefe del sector.  
**Flujo principal:**
1. Administración de Seguridad Vial crea o modifica el borrador.
2. Valida y justifica los huecos que permanecerán.
3. Envía la versión a revisión.
4. El Jefe del sector revisa.
5. Puede observar y devolver con comentarios.
6. Administración de Seguridad Vial corrige y vuelve a enviar.
7. El Jefe del sector aprueba.
8. El sistema publica automáticamente en la misma transacción.
9. La versión queda inmutable.

**Cambio posterior:** se crea una nueva versión, se registra el motivo y vuelve a revisión.  
**Cierre:** lo realiza el Jefe del sector.  
**RN:** RN-028, RN-029.

## CU-16 — Administrar permisos

**Actor:** Administrador.  
**Flujo:** asignar roles y permisos.  
**RN:** RN-029.

## CU-17 — Ejecutar regresión histórica

**Actor:** QA funcional/equipo técnico.  
**Flujo:** generar un período conocido y compararlo con el Excel aprobado.  
**RN:** RN-030.

## CU-18 — Administrar cuadratura propia del móvil 4

**Actor:** Administrador, supervisor.  
**Precondición:** Existen el móvil 4, sus horarios y su base operativa.  
**Flujo principal:**
1. Crear o consultar `M4-P01` a `M4-P05` con las anclas definidas en RN-031.
2. Configurar fecha ancla, desfase y grupo de francos.
3. Asignar una persona a cada posición con vigencia.
4. Generar los bloques 5×3 manteniendo siempre el móvil 4.
5. Validar cobertura diaria y solapamientos.
6. Reemplazar temporalmente a una persona sin alterar la continuidad de la posición.
**Alternativas:** Una posición queda sin persona; se genera una necesidad de cobertura.  
**RN:** RN-031.

## CU-19 — Administrar dupla operativa vinculada

**Actor:** Administrador, supervisor.  
**Precondición:** Existen dos posiciones compatibles y la secuencia de móvil externo.  
**Flujo principal:**
1. Crear el grupo de rotación vinculada.
2. Incorporar dos posiciones.
3. Cargar como configuración inicial la dupla Haro–Ramos G. y el rol vigente del móvil 4.
4. Definir la secuencia externa `5 → 3 → 2 → 1`.
5. Generar bloques compartiendo turnos y francos.
6. Alternar posiciones al comienzo del período correspondiente, sin cortar bloques.
7. Registrar vacaciones o ausencias sin reiniciar la dupla.
**Alternativas:** Una persona es reemplazada; la posición y la dupla continúan.  
**RN:** RN-032.

## CU-20 — Sustituir ocupante de una posición

**Actor:** Administración de Seguridad Vial o Jefe del sector.  
**Flujo:** seleccionar posición, inspector, fecha de inicio, fecha final opcional y motivo. El sistema cierra la vigencia anterior el día previo y crea la nueva.  
**Resultado:** historial completo sin superposición.

## CU-21 — Consultar tablero de huecos

**Actor:** Administración de Seguridad Vial, Jefe del sector.  
**Flujo:** filtrar por fechas, móvil, turno, versión y estado pendiente/justificado.  
**Resultado:** huecos ordenados, con motivo y responsable cuando fueron aceptados.

## CU-22 — Asignar trabajos a demanda de vacaciones

**Actor:** Administración de Seguridad Vial.  
**Flujo:** el sistema calcula las fechas posteriores a la vacación, busca huecos y prioriza tarde, noche y mañana.  
**Alternativo:** si no existen suficientes huecos, no crea asignaciones y requiere resolución manual.
