# Análisis del Móvil 4 desde el Excel Histórico

**Versión:** 2.6  
**Archivo:** `1 - Cronograma 2026-2027(1).xlsx`  
**Hoja:** `Móviles Cba 26-27`  
**SHA-256:** `fc9dc8d1bd349a98015057fbfdf7191a2000f12e8bf50fc698fd7582b3939a3b`  
**Tramo para validar duplas:** 01/05/2026–30/09/2026

## Método

Se leyó la hoja mediante `artifact_tool`, se normalizaron los códigos operativos y se buscó el desfase 5×3 que mejor reproduce trabajo/franco para cada línea. Para detectar duplas se exigió, durante todo el tramo comparable, igualdad de turnos/francos y que exactamente una de las dos personas ocupara el móvil 4 en cada jornada de trabajo.

## Anclas verificadas

| Posición | Referencia histórica | Inicio de bloque ancla | Código | Desfase desde 01/05/2026 |
|---|---|---:|---|---:|
| M4-P01 | Del Bel | 01/05/2026 | `M4` | 0 |
| M4-P02 | Carranza M. | 02/05/2026 | `T4` | 1 |
| M4-P03 | Haro / Ramos G. | 04/05/2026 | `N4` | 3 |
| M4-P04 | Carranza G. | 05/05/2026 | `M4` | 4 |
| M4-P05 | Mainardi | 07/05/2026 | `T4` | 6 |

## Dupla vinculada confirmada

**Haro–Ramos G.** comparte ciclo, turnos y francos. En cada jornada de trabajo uno ocupa el móvil 4 y el otro un móvil externo. La secuencia externa observada es `5 → 3 → 2 → 1 → 5`.

## Búsqueda de otras duplas

Personas que utilizaron el móvil 4: Carranza G., Carranza M., Mainardi, Haro, Del Bel y Ramos G.

No se detectó otra combinación que cumpliera simultáneamente:

1. igualdad completa de trabajo/franco;
2. igualdad completa de turno;
3. alternancia complementaria del móvil 4.

Las coincidencias parciales no se modelan como dupla.

## Decisión

- Crear `M4-P01` a `M4-P05`.
- Usar nombres solo como referencia histórica.
- Asociar `M4-P03` al grupo Haro–Ramos G.
- No configurar otra dupla durante la inicialización.
