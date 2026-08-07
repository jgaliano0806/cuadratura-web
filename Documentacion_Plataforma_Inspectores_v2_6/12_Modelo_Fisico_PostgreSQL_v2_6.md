# Modelo Físico PostgreSQL

**Versión:** 2.6

## 1. Decisión de materialización

La implementación utiliza un modelo híbrido:

| Capa | Fuente de verdad | Proyección diaria |
|---|---|---|
| Base | Bloques 5×3 persistidos e inmutables | `dia_cronograma`, regenerable desde bloques |
| Planificada | Base publicada + ajustes versionados | Snapshot diario persistido por versión |
| Real | Plan publicada + eventos reales append-only | Snapshot diario persistido por versión |

Los días materializados permiten aplicar restricciones de unicidad, capacidad y rendimiento sin convertirlos en la fuente primaria de las reglas.

## 2. Entidades físicas principales

- `cronograma` y `cronograma_version`: identifican capa, período, derivación y estado.
- `bloque_cuadratura`: fuente canónica de BASE.
- `dia_cronograma`: proyección común de las tres capas.
- `ajuste_planificacion`: diferencias humanas sobre la base.
- `evento_real`: hechos y correcciones append-only.
- `novedad_operativa`: vacaciones, licencias y enfermedad.
- `cobertura_dia`: objetivo uno, máximo dos y huecos justificados.
- `posicion_cuadratura`: continuidad independiente de la persona.
- `asignacion_inspector_posicion`: ocupación con vigencia.
- `evento_auditoria`: antes/después, usuario, motivo y transacción.

## 3. Inmutabilidad y versiones

- BASE publicada: inmutable.
- PLANIFICADA publicada: inmutable.
- REAL cerrada: inmutable.
- Las tablas hijas solo admiten cambios cuando la versión está en `BORRADOR` u `OBSERVADA`.
- La aprobación y publicación de PLANIFICADA es atómica mediante `sp_aprobar_publicar_version`.
- Una publicación nueva transforma la anterior en `REEMPLAZADA`.

## 4. Restricciones implementadas

- Una posición no puede tener dos ocupantes con vigencias superpuestas.
- Un inspector no puede ocupar dos posiciones base simultáneas.
- Un inspector no puede trabajar dos asignaciones el mismo día en la misma versión.
- Un móvil/turno/día no puede superar dos personas.
- Un inspector con novedad aprobada no puede ser asignado a trabajo durante ese rango.
- Un móvil inactivo o fuera de vigencia no recibe asignaciones.
- Los bloques no se superponen por posición y versión.
- Trabajo exige turno, móvil e inspector asignado.
- Franco, vacaciones, licencia y enfermedad no llevan turno ni móvil.
- Un hueco conserva turno/móvil, pero no inspector asignado.
- Un plan con huecos sin motivo y responsable no puede aprobarse/publicarse.

## 5. Materialización

### Base

`sp_materializar_base(version, usuario)` expande los bloques con `generate_series`, genera códigos y recalcula cobertura.

### Planificada

`sp_materializar_planificada(version, usuario)` copia la BASE origen y aplica ajustes por prioridad:

1. novedades;
2. trabajos a demanda;
3. franco adicional;
4. reemplazos;
5. cambios manuales;
6. huecos aceptados.

El titular permanece en `inspector_titular_id`; un reemplazo modifica únicamente `inspector_asignado_id`.

### Real

`sp_materializar_real(version, usuario)` copia la PLANIFICADA publicada y aplica eventos en orden temporal. Los eventos no se editan ni eliminan; una corrección agrega otro evento.

## 6. Cobertura

`sp_refrescar_cobertura` crea las quince combinaciones diarias de cinco móviles por tres turnos:

- 0: `HUECO`, alerta activa;
- 1: `CUBIERTA`;
- 2: `REFORZADA`;
- 3 o más: bloqueado por trigger.

## 7. Migraciones

Las migraciones están en `database/migrations` y son forward-only. El runner registra versión y SHA-256, evitando que una migración ya aplicada sea modificada silenciosamente.

## 8. Pendiente funcional que no bloquea el esquema

El esquema admite horarios configurables. Falta confirmar:

- duración formal de cada turno;
- regla de fecha operativa del turno nocturno.

Hasta esa definición, las horas iniciales se cargan y `duracion_minutos` permanece nulo.


## 9. Versionado incremental

- `version_anterior_id` enlaza revisiones de la misma capa.
- PLANIFICADA materializa la cadena de ajustes desde la versión más antigua hasta la actual.
- REAL materializa la cadena de eventos desde la revisión más antigua hasta la actual.
- `ajuste_reemplazado_id` y `evento_reemplazado_id` permiten corregir sin borrar historia.
- Una revisión REAL permanece abierta mientras se registran hechos y el Jefe del sector puede cerrarla; una corrección posterior abre otra versión que hereda los eventos anteriores.
