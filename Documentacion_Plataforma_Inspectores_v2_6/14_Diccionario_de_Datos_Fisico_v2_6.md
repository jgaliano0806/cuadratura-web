# Diccionario de Datos Físico

**Versión:** 2.6

## Seguridad y auditoría

| Tabla | Propósito | Claves y restricciones principales |
|---|---|---|
| `usuario` | Identidad de acceso | `nombre_usuario` único; hash no reversible |
| `rol` | Rol funcional | Códigos iniciales de Seguridad Vial, Jefe, administrador, consulta y auditor |
| `permiso` | Acción autorizable | Código único |
| `usuario_rol` | Vigencia de roles | PK compuesta por usuario, rol y fecha |
| `rol_permiso` | Matriz RBAC | PK rol–permiso |
| `evento_auditoria` | Antes/después de cambios | Append-only; índice por entidad, usuario y fecha |

## Catálogos operativos

| Tabla | Propósito | Claves y restricciones principales |
|---|---|---|
| `base_operativa` | Obrador y Ruta 53 | Código único |
| `movil` | Móviles 1 a 5 | Número único; capacidad entre 1 y 2 |
| `horario_turno_movil` | Hora y vigencia por móvil/turno | Exclusión GiST de vigencias superpuestas |
| `inspector` | Plantel | Legajo único; alta/baja coherentes |
| `grupo_franco` | Fase del ciclo 5×3 | Ancla y posición 0–7 |
| `perfil_rotacion` | Perfil general o especial | Código único y vigencia |
| `perfil_rotacion_turno` | Secuencia M→N→T | Orden único por perfil |
| `perfil_rotacion_movil` | Secuencia de móviles | Orden único por perfil |
| `posicion_cuadratura` | Línea continua independiente de la persona | Código único; ancla, perfil y grupo de franco |
| `asignacion_inspector_posicion` | Ocupación de una posición | Exclusión de solapamientos por posición e inspector |
| `grupo_rotacion_vinculada` | Duplas vinculadas | Perfil externo y regla de alternancia |
| `miembro_grupo_rotacion_vinculada` | Miembros de la dupla | Un rol móvil 4 y un rol externo por grupo |

## Inicialización

| Tabla | Propósito | Claves y restricciones principales |
|---|---|---|
| `inicializacion_sistema` | Carga única del Excel | Un solo registro activo; SHA-256 único |
| `error_inicializacion` | Errores de validación | Vinculado al lote de inicialización |
| `registro_golden_master` | Resultado histórico esperado | Único por posición y fecha dentro del lote |

## Cronogramas y versiones

| Tabla | Propósito | Claves y restricciones principales |
|---|---|---|
| `cronograma` | Contenedor BASE, PLANIFICADA o REAL | Período válido y versión actual |
| `cronograma_version` | Snapshot lógico versionado | Una versión de trabajo y una publicada por cronograma |
| `version_estado_historial` | Transiciones de workflow | Append histórico por versión |
| `bloque_cuadratura` | Fuente canónica de BASE | Exclusión de bloques superpuestos; 5 trabajo o 3 franco, salvo bordes parciales |
| `dia_cronograma` | Proyección diaria común | Único por versión, posición y fecha; un trabajo por inspector/día |
| `cobertura_dia` | Cobertura por móvil, turno y fecha | Objetivo 1, máximo 2, hueco con justificación |
| `materializacion_ejecucion` | Trazabilidad de generación | Estado, filas y error de cada ejecución |

## Novedades, plan y real

| Tabla | Propósito | Claves y restricciones principales |
|---|---|---|
| `novedad_operativa` | Vacación, licencia o enfermedad | Exclusión de novedades aprobadas superpuestas |
| `vacacion_detalle` | Parámetros cerrados de vacaciones | 7/14/21/28/35 y cantidad correcta de trabajos a demanda |
| `reemplazo_novedad` | Reemplazo opcional | Titular distinto del reemplazante; vigencia no superpuesta |
| `ajuste_planificacion` | Delta de una versión PLANIFICADA | Prioridad, rango y objetivo; puede reemplazar un ajuste anterior |
| `evento_real` | Hecho/corrección de una versión REAL | Append-only; puede reemplazar un evento anterior |

## Índices esenciales

- B-tree por versiones, fechas, inspectores, posiciones y auditoría.
- GiST para rangos de vigencia, bloques, novedades y reemplazos.
- GIN para metadata JSON de auditoría.
- Índices parciales para una sola versión de trabajo, una sola publicada y consultas de huecos.

## Procedimientos principales

| Procedimiento | Función |
|---|---|
| `sp_materializar_base` | Expande bloques a días y recalcula cobertura |
| `sp_materializar_planificada` | Aplica la cadena efectiva de ajustes sobre BASE |
| `sp_materializar_real` | Aplica la cadena efectiva de eventos sobre PLANIFICADA |
| `sp_refrescar_cobertura` | Genera 5 móviles × 3 turnos por día |
| `sp_justificar_hueco` | Registra motivo y responsable |
| `sp_enviar_revision` | Envía el borrador de Seguridad Vial al Jefe |
| `sp_observar_version` | Devuelve con observaciones |
| `sp_aprobar_publicar_version` | Aprueba y publica de forma atómica |
| `sp_cerrar_version` | Cierra una planificación publicada o una revisión REAL abierta |

## Vistas principales

- `v_version_actual`
- `v_base_actual`
- `v_planificada_actual`
- `v_real_actual`
- `v_huecos_actuales`
- `v_comparacion_plan_real`
- `v_resumen_version`
