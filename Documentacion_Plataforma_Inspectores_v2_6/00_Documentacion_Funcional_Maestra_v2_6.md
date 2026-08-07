# Documentación Funcional Maestra — Plataforma de Inspectores y Móviles

**Versión:** 2.6  
**Estado:** Base funcional consolidada; existen decisiones pendientes identificadas.  
**Fuente de verdad documental:** `01_Catalogo_Maestro_Reglas_de_Negocio_v2_6.md`

## 1. Objetivo

Definir de forma trazable la solución para:

- Generar la cuadratura operativa de inspectores y móviles.
- Planificar hasta 12 meses.
- Registrar lo planificado y lo ocurrido realmente.
- Gestionar vacaciones, ausencias, licencias y reemplazos opcionales.
- Mantener auditoría de cambios.
- Inicializar una única vez la cuadratura base utilizando la hoja `Móviles CBA 26-27` del Excel aprobado.
- Producir reportes de cobertura y comparación planificado versus real.

## 2. Principio de documentación

Cada requerimiento debe seguir la cadena:

`RN → HU → CU → CA → CP`

Donde:

- **RN:** Regla de Negocio.
- **HU:** Historia de Usuario.
- **CU:** Caso de Uso.
- **CA:** Criterio de Aceptación.
- **CP:** Caso de Prueba.

Los identificadores se definen una sola vez en el catálogo maestro. Ningún documento puede reutilizar un identificador con otro significado.

## 3. Conceptos principales

### 3.1 Cuadratura base

Representa la secuencia teórica generada a partir de:

- Ciclo laboral 5×3.
- Secuencia de turnos.
- Rotación de móviles.
- Estado inicial de generación.
- Configuración operativa vigente.

**Decisión pendiente:** determinar si la cuadratura base se persiste como una entidad independiente o si se genera bajo demanda.

### 3.2 Cuadratura planificada

Representa el deber ser aprobado para un período. Debe conservarse sin ser sobrescrita por novedades diarias.

Puede incorporar información conocida con anticipación, como vacaciones aprobadas, licencias programadas y reemplazos previstos, una vez que se cierre la decisión sobre el modelo de cuadraturas.

### 3.3 Cuadratura real

Representa lo que efectivamente ocurrió:

- Enfermedades o faltas puntuales.
- Reemplazos reales.
- Huecos operativos justificados.
- Cambios manuales autorizados.
- Licencias y novedades efectivas.

## 4. Regla madre de generación

El ciclo laboral es **5×3 y continuo**:

1. Se trabajan cinco días seguidos en un mismo turno y móvil.
2. Luego se cumplen tres días de franco.
3. Al iniciar el siguiente bloque se avanza en la secuencia circular de turnos:

`Mañana → Noche → Tarde → Mañana`

4. No existe reinicio por cambio de mes.
5. Un bloque que cruza de mes conserva el mismo turno y móvil hasta completarse.
6. La rotación general de móviles es:

`1 → 5 → 3 → 2 → 1`

7. El móvil puede cambiar únicamente cuando empieza un nuevo bloque de cinco días.
8. El móvil 4 posee una cuadratura operativa propia compuesta por cinco posiciones continuas y desfasadas bajo régimen 5×3.
9. Las posiciones del móvil 4 mantienen siempre el móvil 4 y rotan los turnos en la secuencia `M → N → T`.
10. La cuadratura del móvil 4 busca cubrir diariamente mañana, tarde y noche, admitiendo un solapamiento periódico de hasta dos personas en un mismo turno.
11. Los inspectores pueden cambiar dentro de una posición sin reiniciar ni alterar la continuidad de la cuadratura.
12. Haro y Ramos integran una dupla operativa vinculada: comparten turnos, bloques y francos, mientras alternan entre el móvil 4 y el móvil externo correspondiente a la secuencia general.
13. Las configuraciones especiales se modelan mediante datos y vigencias; no se programan por nombre de inspector.

## 5. Documentos del paquete

1. `01_Catalogo_Maestro_Reglas_de_Negocio_v2_6.md`
2. `02_Historias_de_Usuario_y_Criterios_v2_6.md`
3. `03_Modelo_de_Datos_v2_6.md`
4. `04_Arquitectura_del_Sistema_v2_6.md`
5. `05_Casos_de_Uso_v2_6.md`
6. `06_Casos_de_Prueba_y_Trazabilidad_v2_6.md`
7. `07_Algoritmo_Generacion_Cronograma_v2_6.md`
8. `08_Configuraciones_Operativas_v2_6.md`
9. `09_Infraestructura_v2_6.md`
10. `10_Checklist_Decisiones_Pendientes_v2_6.md`

## 6. Alcance de la versión 2

Esta versión:

- Unifica los identificadores.
- Formaliza la regla continua 5×3.
- Corrige la secuencia de turnos a `M → N → T`.
- Formaliza la continuidad entre meses.
- Formaliza la rotación general `1 → 5 → 3 → 2`.
- Distingue reglas generales de configuraciones particulares.
- Incorpora criterios de aceptación.
- Incorpora casos de uso y casos de prueba trazados.
- Cierra las reglas de vacaciones de 7, 14, 21, 28 y 35 días corridos.
- Define la importación del Excel como una herramienta extraordinaria de inicialización única, no como una función operativa recurrente.
- Amplía el modelo de datos.
- Mantiene visibles las decisiones todavía no cerradas.

## 7. Control de cambios

| Versión | Descripción |
|---|---|
| 1.0 | Documentación inicial y archivos separados. |
| 2.0 | Consolidación funcional, trazabilidad, algoritmo continuo y actualización de arquitectura. |
| 2.1 | Incorporación de la cuadratura propia del móvil 4 y de la dupla operativa vinculada Haro–Ramos. |
| 2.2 | Redefinición del importador como inicialización única de la cuadratura base desde la hoja `Móviles CBA 26-27`. |
| 2.3 | Cierre funcional de vacaciones: días corridos, francos previos, trabajo a demanda y retorno a la cuadratura. |
| 2.4 | Estado inicial desde el Excel histórico, cobertura mínima, aprobación/publicación y anclas verificadas del móvil 4. |
| 2.5 | Modelo físico PostgreSQL, materialización de BASE/PLANIFICADA/REAL, migraciones y restricciones. |

## 8. Regla consolidada de vacaciones

Las vacaciones:

- comienzan siempre después de los tres francos normales;
- se cuentan en días corridos;
- no modifican la cuadratura base;
- impactan en la cuadratura planificada;
- terminan con el protocolo de reintegro correspondiente;
- después del franco adicional, el inspector vuelve a la cuadratura planificada que le corresponde en esa fecha.

Protocolos:

| Duración | Secuencia |
|---|---|
| 7 días | `3F + 7V + 1F + regreso` |
| 14 días | `3F + 14V + 1 trabajo a demanda + 1F + regreso` |
| 21 días | `3F + 21V + 2 trabajos a demanda + 1F + regreso` |
| 28 días | `3F + 28V + 1 trabajo a demanda + 1F + regreso` |
| 35 días | `3F + 35V + 2 trabajos a demanda + 1F + regreso` |

El trabajo a demanda:

- se asigna donde exista necesidad operativa;
- puede realizarse en cualquier móvil;
- se prioriza turno tarde o noche;
- debe respetar la capacidad máxima de dos inspectores por móvil y turno;
- no altera la cuadratura base ni hace reiniciar el ciclo.


## 9. Decisiones cerradas en la versión 2.4

### 9.1 Estado inicial

La hoja histórica `Móviles Cba 26-27` determina el estado inicial oficial. El inicializador reconstruye para cada inspector o posición el último estado histórico válido: fecha, posición del ciclo 5×3, turno, móvil, grupo de francos y posiciones de rotación. El motor continúa desde ese punto sin reiniciar ni solicitar anclas manuales.

### 9.2 Cobertura

- Objetivo: una persona por móvil y turno.
- Máximo: dos personas por móvil y turno.
- Cero personas: hueco permitido con alerta.
- Una persona: cobertura normal.
- Dos personas: cobertura reforzada o solapamiento válido.
- Tres o más: error bloqueante.
- Para aprobar/publicar con huecos se exige motivo y responsable.

### 9.3 Versionado y aprobación

- `Administración de Seguridad Vial` crea, modifica, valida, justifica huecos y envía a revisión.
- El `Jefe del sector` observa y devuelve, o aprueba.
- La aprobación publica automáticamente en la misma acción.
- Una versión publicada es inmutable; todo cambio genera una nueva versión.
- El Jefe del sector cierra el período.

### 9.4 Móvil 4

Referencia común: 01/05/2026.

| Posición | Referencia histórica | Ancla | Código | Desfase en días |
|---|---|---:|---|---:|
| M4-P01 | Del Bel | 01/05/2026 | `M4` | 0 |
| M4-P02 | Carranza M. | 02/05/2026 | `T4` | 1 |
| M4-P03 | Haro / Ramos G. | 04/05/2026 | `N4` | 3 |
| M4-P04 | Carranza G. | 05/05/2026 | `M4` | 4 |
| M4-P05 | Mainardi | 07/05/2026 | `T4` | 6 |

En el tramo completo analizado, 01/05/2026–30/09/2026, la única dupla vinculada que cumple igualdad total de turnos/francos y alternancia complementaria del móvil 4 es **Haro–Ramos G.**


## 10. Cierre del modelo físico — versión 2.5

Se incorpora un esquema PostgreSQL ejecutable con migraciones, índices, restricciones, materialización de las tres capas, auditoría y procedimientos de workflow.

## 11. Implementaciones cerradas en la versión 2.6

1. Turnos de ocho horas y fecha operativa por inicio.
2. Inicializador exacto de `Móviles Cba 26-27` con preview, staging, confirmación, Golden Master y reversión controlada.
3. Administración de ocupantes, vigencias, sustituciones e intercambio de la dupla del móvil 4.
4. Tablero de huecos con filtros y estado de justificación.
5. Propuesta y asignación de trabajos a demanda de vacaciones según necesidad operativa.
6. Migración PostgreSQL `V011__excel_initializer_and_operational_functions.sql` y aplicación Python ejecutable.
