# Algoritmo Oficial de Generación de Cronograma

**Versión:** 2.7  
**Estado:** Regla general confirmada, con `1 → 5 → 3 → 2 → 1` y 4 bloques por móvil. Anclas del móvil 4 verificadas al 01/05/2026 y anclas de Ruta 36 verificadas al 01/06/2026. La versión 2.7 opera sin capa BASE ni Excel: el motor recibe todo el estado necesario desde `estado_inicial_posicion`.

## 1. Entradas

- Fecha desde y fecha hasta.
- Inspector.
- Estado inicial (persistido en `estado_inicial_posicion`):
  - fecha de referencia;
  - posición dentro del bloque 5×3 (0..7);
  - turno vigente (M/N/T o nulo en franco);
  - móvil vigente (o nulo en franco);
  - índice de la rotación de turnos;
  - índice de la rotación de móviles;
  - **bloques completados en el móvil actual** (0..4, RN-034).
- Grupo de francos.
- Perfil de rotación vigente (`ROTACION_GENERAL`, `FIJO_MOVIL`, `MOVIL6_FIJO`, `MOVIL7_FIJO`).
- Horarios por móvil.
- Estado de móviles.

## 2. Secuencias generales

```text
Ciclo: 5 Trabajo + 3 Franco
Turnos: M → N → T → M
Móviles: 1 → 5 → 3 → 2 → 1
```

La secuencia es circular; no existe un “enero inicial” obligatorio. Cada inspector puede encontrarse en una posición diferente al comenzar el período consultado.

## 3. Reglas de cálculo

1. Partir del estado inicial válido (`estado_inicial_posicion`).
2. Completar el bloque en curso, si lo hubiera.
3. Generar cinco días con el mismo turno y móvil.
4. Generar tres francos.
5. Al cerrar el bloque de trabajo (transición día 4 → día 5 del ciclo), incrementar `bloques_completados_movil`.
6. Avanzar una posición en la secuencia de turnos al iniciar el próximo bloque (transición día 7 → día 0).
7. Evaluar el móvil objetivo al comienzo del nuevo bloque: si el perfil es fijo (`FIJO_MOVIL`, `MOVIL6_FIJO`, `MOVIL7_FIJO`) el móvil no cambia; si el perfil es `ROTACION_GENERAL`, cambiar de móvil sólo cuando `bloques_completados_movil ≥ 4` y reiniciar el contador a 0.
8. Si el bloque anterior cruzó de mes, no modificarlo.
9. Aplicar el cambio de móvil solamente en el nuevo bloque.
10. Repetir hasta cubrir el período solicitado.
11. Aplicar luego las capas de planificación conocida y operación real según el modelo definitivo.

## 4. Pseudocódigo

```text
estado = cargarEstadoInicial(inspector)
fecha = fechaDesde

mientras fecha <= fechaHasta:
    si estado.estaEnFranco:
        generarFranco(fecha)
        avanzarPosicionCiclo()
    si no:
        si comienzaNuevoBloque(fecha):
            turno = siguienteTurnoCircular(estado.turnoAnterior)
            movil = resolverMovilDelNuevoBloque(
                configuracionOperativa,
                fecha,
                estado.posicionMovil
            )
        generarAsignacion(fecha, turno, movil)
        avanzarPosicionCiclo()

    fecha = fecha + 1 día
```

## 5. Regla de mes

El mes calendario es una **vista**, no un reinicio.

- Un bloque iniciado en septiembre puede terminar en octubre.
- Mantiene el mismo móvil y turno durante sus cinco días.
- El siguiente bloque toma el móvil que corresponda a su configuración y al período de inicio.

## 6. Ejemplo validado: Acosta

Desde el 17 de septiembre:

| Fechas | Código |
|---|---|
| 17–21 septiembre | T2 |
| 22–24 septiembre | F |
| 25–29 septiembre | M2 |
| 30 septiembre–2 octubre | F |
| 3–7 octubre | N1 |
| 8–10 octubre | F |
| 11–15 octubre | T1 |
| 16–18 octubre | F |
| 19–23 octubre | M1 |
| 24–26 octubre | F |
| 27–31 octubre | N1 |

El cambio de móvil 2 a móvil 1 se produce al iniciar el bloque del 3 de octubre, no el 1 de octubre y no durante los francos.

## 7. Algoritmo específico del móvil 4

| Posición | Referencia histórica | Ancla | Código | Desfase en días |
|---|---|---:|---|---:|
| M4-P01 | Del Bel | 01/05/2026 | `M4` | 0 |
| M4-P02 | Carranza M. | 02/05/2026 | `T4` | 1 |
| M4-P03 | Haro / Ramos G. | 04/05/2026 | `N4` | 3 |
| M4-P04 | Carranza G. | 05/05/2026 | `M4` | 4 |
| M4-P05 | Mainardi | 07/05/2026 | `T4` | 6 |

1. Cada posición mantiene ciclo 5×3.
2. Los turnos avanzan `M → N → T`.
3. Las fases dentro del ciclo de ocho días son 0, 1, 3, 4 y 6.
4. `M4-P03` representa el rol del móvil 4 dentro de la dupla Haro–Ramos G.
5. Cambiar al ocupante no reinicia la posición.
6. La combinación mantiene cobertura M/T/N con solapamientos máximos de dos.

## 7.bis Algoritmo específico de Ruta 36 (móviles 6 y 7)

Misma lógica que el móvil 4, aplicada por separado a cada móvil:

1. Perfil fijo `MOVIL6_FIJO` o `MOVIL7_FIJO` (secuencia de un solo móvil).
2. Ciclo 5×3 continuo y turnos `M → N → T`.
3. Cinco posiciones desfasadas por móvil aseguran cobertura diaria M/T/N con dos francos.
4. Capacidad máxima 2; objetivo 1; huecos con alerta (RN-016).
5. Base operativa Ruta 36. Horarios: M6 06/14/22; M7 07/15/23.
6. Referencia de anclas: cronograma junio 2026 (estado al 01/06/2026).
7. Sin dupla vinculada en la configuración inicial.

## 8. Algoritmo de dupla operativa vinculada

Configuración inicial: Haro–Ramos G.

1. Comparten grupo de francos, bloque y turno.
2. En cada día de trabajo exactamente una posición ocupa el móvil 4.
3. La otra ocupa el móvil externo según `5 → 3 → 2 → 1`.
4. El intercambio nunca divide un bloque.
5. Novedades no adelantan ni reinician la dupla.
6. No se crea otra dupla por coincidencias parciales.

## 9. Configuraciones especiales

La regla general puede ser reemplazada por una configuración operativa vigente, por ejemplo:

- Inspector fijo en móvil 4.
- Secuencia particular que incluye móvil 4.
- Grupo de francos compartido.
- Rotación especial aprobada.

La excepción debe ser un dato; no una condición escrita con el nombre del inspector.

## 10. Validaciones

- El estado inicial (`estado_inicial_posicion`) debe existir para cada posición activa y ser internamente consistente.
- Cero personas genera alerta.
- Una persona representa cobertura normal.
- Dos personas representan cobertura reforzada.
- Tres personas se bloquean.
- No aprobar/publicar huecos sin motivo y responsable.
- No asignar al mismo inspector simultáneamente.
- No cortar bloques por cambio de mes.
- No reiniciar una posición del móvil 4 al cambiar de ocupante.
- No desincronizar la dupla Haro–Ramos G.
- Para perfiles con rotación general, `bloques_completados_movil` no puede quedar fuera de `[0, 4]`.

## 11. Inicialización del estado del motor (2.7)

Desde la versión 2.7 la inicialización se realiza como **seed operativo directo** (RN-026). El script `scripts/seed-catalogos.mjs`:

1. Ejecuta un wipe controlado de asignaciones, estados iniciales y posiciones previas.
2. Garantiza los catálogos base (bases operativas, móviles 1..7, horarios, perfiles, grupos de franco).
3. Inserta los 37 inspectores, sus posiciones (22 GENERAL, 5 MOVIL4, 5 MOVIL6, 5 MOVIL7) y las asignaciones vigentes desde el 01/06/2026.
4. Carga el `estado_inicial_posicion` de cada posición con el corte al 01/06/2026, incluyendo `posicion_ciclo`, `turno`, `movil_id`, `indice_turno`, `indice_movil` y `bloques_completados_movil` (RN-034).

Después del seed:

1. El Excel ya no es fuente operativa. El módulo `bootstrap-initialization`, la página web `Inicialización` y las rutas `/initialization` fueron retiradas del sistema.
2. El motor de reglas genera toda cuadratura futura desde el corte del 01/06/2026.
3. Las novedades se registran sobre planificado/real, no mediante importaciones.
4. Toda modificación de estado inicial se hace por administración operativa y queda auditada.

## 12. Algoritmo de vacaciones

Entrada:

- inspector;
- fecha de inicio;
- duración: 7, 14, 21, 28 o 35;
- cuadratura planificada;
- necesidades de cobertura.

Proceso:

1. Verificar tres francos normales previos.
2. Generar `V` por la cantidad indicada, usando días corridos.
3. Determinar trabajos a demanda:
   - 7 → 0;
   - 14 → 1;
   - 21 → 2;
   - 28 → 1;
   - 35 → 2.
4. Para cada trabajo:
   - buscar necesidad operativa;
   - priorizar T o N;
   - permitir cualquier móvil;
   - validar máximo de dos inspectores;
   - registrar motivo y aprobación.
5. Generar un franco adicional.
6. Reincorporar al inspector a la cuadratura planificada correspondiente a la fecha siguiente.
7. Mantener la cuadratura base intacta.

## 13. Algoritmo ejecutable del seed (2.7)

Reemplaza al algoritmo del inicializador Excel de la versión 2.6.

1. Abrir transacción y desactivar temporalmente triggers de replicación (`session_replication_role = 'replica'`).
2. Truncar tablas operativas dependientes: `asignacion_inspector_posicion`, `estado_inicial_posicion`, `miembro_grupo_rotacion_vinculada`, `grupo_rotacion_vinculada`, `posicion_cuadratura`, `grupo_franco`, `inspector`.
3. Asegurar catálogos base: bases operativas (`OBRADOR`, `RUTA53`, `RUTA36`), móviles 1..7, horarios `horario_turno_movil`, perfiles (`ROTACION_GENERAL`, `FIJO_MOVIL`, `MOVIL6_FIJO`, `MOVIL7_FIJO`) con sus turnos y móviles.
4. Insertar los 37 inspectores del corte 01/06/2026 con su grupo de franco y perfil.
5. Insertar las 37 posiciones (22 GENERAL, 5 MOVIL4, 5 MOVIL6, 5 MOVIL7) con su perfil y base.
6. Insertar las asignaciones vigentes `asignacion_inspector_posicion` con `vigencia = [2026-06-01, infinity)`.
7. Insertar los estados iniciales en `estado_inicial_posicion` con `fecha_referencia = 2026-06-01` y `bloques_completados_movil` calculado por el planificador de anclas.
8. Confirmar transacción; verificar consistencia con `scripts/verify-projection.mjs` y con `projection.spec.ts`.
