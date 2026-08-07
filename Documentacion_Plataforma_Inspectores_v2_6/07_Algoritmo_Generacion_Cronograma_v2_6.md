# Algoritmo Oficial de Generación de Cronograma

**Versión:** 2.6  
**Estado:** Regla general confirmada. Anclas del móvil 4 verificadas contra el Excel histórico.

## 1. Entradas

- Fecha desde y fecha hasta.
- Inspector.
- Estado inicial:
  - fecha de referencia;
  - posición dentro del bloque 5×3;
  - turno vigente;
  - móvil vigente;
  - posición de la rotación de turnos;
  - posición de la rotación de móviles.
- Grupo de francos.
- Configuración operativa vigente.
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

1. Partir del estado inicial válido.
2. Completar el bloque en curso, si lo hubiera.
3. Generar cinco días con el mismo turno y móvil.
4. Generar tres francos.
5. Avanzar una posición en la secuencia de turnos.
6. Evaluar el móvil objetivo al comienzo del nuevo bloque.
7. Si el bloque anterior cruzó de mes, no modificarlo.
8. Aplicar el cambio de móvil solamente en el nuevo bloque.
9. Repetir hasta cubrir el período solicitado.
10. Aplicar luego las capas de planificación conocida y operación real según el modelo definitivo.

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

- El Excel debe permitir reconstruir un estado inicial consistente.
- Cero personas genera alerta.
- Una persona representa cobertura normal.
- Dos personas representan cobertura reforzada.
- Tres personas se bloquean.
- No aprobar/publicar huecos sin motivo y responsable.
- No asignar al mismo inspector simultáneamente.
- No cortar bloques por cambio de mes.
- No reiniciar una posición del móvil 4 al cambiar de ocupante.
- No desincronizar la dupla Haro–Ramos G.

## 11. Inicialización del estado del motor

La hoja `Móviles CBA 26-27` se utiliza una única vez para obtener:

- bloques históricos;
- grupos de franco;
- posiciones de cuadratura;
- estados iniciales de inspectores y posiciones;
- configuraciones generales y especiales observables;
- datos esperados del Golden Master.

Después de confirmar la inicialización:

1. El Excel deja de ser fuente operativa.
2. El motor de reglas genera toda cuadratura futura.
3. Las novedades se registran sobre planificado/real, no mediante nuevas importaciones.
4. El Golden Master permanece como referencia de regresión.
5. El último estado histórico válido se transforma en estado inicial oficial.

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

## 13. Algoritmo ejecutable del inicializador

1. Seleccionar únicamente la hoja cuya clave normalizada sea `moviles cba 26 27`.
2. Localizar la fila `INSPECTOR DE MÓVIL`.
3. Leer fechas desde la columna C y exigir continuidad diaria.
4. Expandir encabezados mensuales combinados por *forward-fill*.
5. Leer inspectores numerados de forma contigua; detenerse antes de la matriz de cobertura.
6. Normalizar nombres y códigos; nunca rellenar celdas operativas vacías.
7. Clasificar trabajo, franco, vacaciones y enfermedad.
8. Inferir desfase 5×3 ignorando novedades.
9. Reconstruir bloques de trabajo/franco y marcar parciales.
10. Detectar posiciones del móvil 4 y duplas complementarias.
11. Guardar preview/staging; confirmar solamente sin errores.
12. Materializar BASE y Golden Master en una transacción.
