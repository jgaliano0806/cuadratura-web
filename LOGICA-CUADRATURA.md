# Lógica de la cuadratura — Seguridad Vial

Reglas de negocio del armado de turnos, con la evidencia que las respalda y el
lugar del código donde vive cada una.

Todo lo marcado como **verificado** se contrastó contra planillas reales:

| Fuente | Contenido |
|---|---|
| `Cronograma ideal Junio a Agosto.xlsx` | jun–ago 2026 · 27 inspectores Córdoba + 10 Ruta 36 |
| `1 - Cronograma 2026-2027.xlsx` | may/2026 → may/2027, planificación humana |
| `historico.xlsx` | may/2025 → may/2026, histórico real |

---

## 1. Ciclo de trabajo

**Bloque 5×3.** Cinco días de trabajo seguidos, tres de franco. Ciclo de 8 días.

Las posiciones del ciclo se numeran 0 a 7: **0–4 trabajo**, **5–7 franco**.

> Verificado: 100% en los 37 inspectores.

---

## 2. Rotación de turno

Un turno por bloque, ciclo **N → T → M → N**.

El turno avanza en cada inicio de bloque, sin excepción. No se saltea ni se
reinicia por cambio de mes.

> Verificado: 100%. En Ruta 36, donde el móvil es fijo, la rotación de turno
> sola explica el 100% de la cuadratura (545 de 545 celdas).

---

## 3. Rotación de móvil — la regla crítica

Ciclo **5 → 3 → 2 → 1 → 5**.

**El móvil avanza un paso por mes calendario**, y el cambio se aplica en el
**primer bloque que arranca en el mes nuevo**.

### No es "cada 4 bloques"

Es el error que se cometió dos veces, las dos por validar sobre ventanas cortas:

```
4 bloques × 8 días = 32 días
1 mes                ≈ 30,4 días
```

Las dos reglas coinciden unos tres meses y después derivan ~1,5 días por mes. A
los diez meses el desfase es de un bloque entero.

### Evidencia

En la cuadratura ideal, **10 de 32 tramos de móvil no duran 4 bloques** — duran
3, 5, 2 o 1. Los casos limpios:

```
Carletto G.   móvil 3: 08/06, 16/06, 24/06     → solo 3 bloques
              móvil 2: arranca 02/07           ← primer bloque de julio
              móvil 1: arranca 03/08           ← primer bloque de agosto

Sandoval      móvil 2: solo 3 bloques
              móvil 1: arranca 02/07
              móvil 5: arranca 03/08
```

Medición sobre los 21 rotativos de Córdoba:

| Regla | Accuracy |
|---|---|
| Cada 4 bloques | 86,7% |
| **Mensual** | **100%** (1138/1138 celdas) |

La documentación funcional ya decía lo correcto (doc 07 §5): *"el siguiente
bloque toma el móvil que corresponda a su configuración y **al período de
inicio**"*.

### En el código

`apps/api/src/modules/schedule-engine/projection.ts`

```ts
const months = monthDiffIso(anchorBlockStart, blockStart);
mobileIndex = (anchorIndex + months) % mobiles.length;
```

Un perfil de móvil fijo se expresa con `mobiles` de un solo elemento: el módulo
lo deja constante, sin caso especial.

---

## 4. Un bloque no se parte

Si un bloque cruza el fin de mes, **se completa entero con el móvil viejo**. El
móvil nuevo arranca en el bloque siguiente.

Es estructural, no un parche: el móvil solo puede cambiar en la transición de
ciclo 7 → 0, o sea en el inicio de bloque.

> Verificado: los 22 bloques de la ideal que cruzan fin de mes mantienen el
> móvil del mes en que arrancan. La alternativa "el mes donde cae la mayoría del
> bloque" falla en 11 de esos 22.

---

## 5. Franjas horarias

Dentro de cada turno hay dos horarios de entrada (RPASV002):

| Turno | Móviles 1, 2 y 4 | Móviles 3 y 5 |
|---|---|---|
| Mañana | 05:00 – 13:00 | 07:00 – 15:00 |
| Tarde | 13:00 – 21:00 | 15:00 – 23:00 |
| Noche | 21:00 – 05:00 | 23:00 – 07:00 |

**La rotación respeta la franja.** El ciclo 5→3→2→1 recorre dos meses de entrada
tardía (5 y 3) y dos de entrada temprana (2 y 1). Nadie queda siempre en el
horario incómodo.

Un inspector **no puede cambiar de franja** de un día para el otro.

---

## 6. Desdoble por superposición

**Con tres inspectores en un mismo móvil, turno y día, se mueve a uno** al móvil
que comparte su horario de entrada, conservando el turno.

| Origen | Destino |
|---|---|
| 1 | 2 |
| 2 | 1 |
| 3 | 5 |
| 5 | 3 |

**Dos en un móvil es reparto normal y no se toca.** La cuadratura ideal tiene 182
slots con dos inspectores y solo uno con tres.

### A quién se mueve

En este orden:

1. Al que **menos veces le tocó** en el período
2. Si empatan, al que **hace más tiempo que no le toca**
3. Si siguen empatados, por **puntero rotativo**

Los tres criterios miran solo el historial de desdobles. **No interviene la
antigüedad ni el legajo**: quien ingresó después no tiene por qué caer siempre.

No se usa azar: no sería reproducible, no repartiría parejo, y no habría
respuesta si un inspector pregunta por qué le tocó a él.

### El desdoble no altera la secuencia

Vale **solo por ese día**. Al día siguiente la persona vuelve a su móvil. Se
guarda como asignación operativa conservando `baseMobile`, así la cuadratura base
queda intacta.

### Es obligatorio, no opcional

La base de datos lo impone:

```sql
cantidad_asignada smallint NOT NULL CHECK (cantidad_asignada BETWEEN 0 AND 2)
CONSTRAINT ck_cobertura_estado CHECK (
    (cantidad_asignada = 0 AND estado = 'HUECO'     AND alerta_activa) OR
    (cantidad_asignada = 1 AND estado = 'CUBIERTA'  AND NOT alerta_activa) OR
    (cantidad_asignada = 2 AND estado = 'REFORZADA' AND NOT alerta_activa)
)
```

Un triple no se puede guardar. Por eso el desdoble corre dentro de la generación,
antes de materializar.

### Si no hay destino

Si el móvil pareja también tiene dos, **se deja el triple y se marca para
resolución manual**. La generación corta con un mensaje que indica fecha, móvil y
turno.

El móvil 4 comparte la franja temprana y podría absorberlo, pero se gestiona a
mano, así que no se asigna automáticamente. Existe la opción `permitirMovil4`
para habilitarlo si el sector lo decide.

> Sobre jun/2026 – feb/2027: 38 superposiciones, 37 se resuelven solas, 1 queda
> manual (01/09/2026, móvil 1, turno Mañana).

### En el código

`apps/api/src/modules/schedule-engine/desdoble.ts`
`POST /schedule-engine/desdobles/preview` — simula y devuelve la justificación

---

## 7. Las dos operaciones

| | Córdoba | Ruta 36 |
|---|---|---|
| Inspectores | 27 | 10 |
| Móviles | 1 a 5 | 6 y 7 |
| Móvil | rota mensualmente | **fijo por inspector** |
| Turno | rota N→T→M | rota N→T→M |

En Ruta 36 solo rota el turno. Cinco inspectores en el móvil 6 y cinco en el 7.

> Verificado: 100% en los 10 inspectores, 545 de 545 celdas.

---

## 8. Móvil 4 — manual

Fuera del motor. Se carga a mano.

**Grupo fijo:** Carranza G., Carranza M., Mainardi, Del Bel — siempre móvil 4.

**Dupla Haro – Ramos G.:** comparten francos y turnos, e intercambian el móvil 4
mensualmente. Uno ocupa el móvil 4 y el otro rota por el ciclo externo.

---

## 9. Ausencias

Se cargan **a mano**. No hay cálculo automático.

| Código | Significado |
|---|---|
| `V` | Vacaciones |
| `EF` | Licencia por enfermedad |
| `RP` | Reserva de puesto |
| `L` | Licencia (otras) |

**Una ausencia no altera la secuencia.** El ciclo de turno y móvil sigue
corriendo por debajo y se retoma al volver. Lo único que cambia es que esa
persona ese día no ocupa un móvil.

### Por qué importa para la cobertura

| | Trabajando/día | Ausentes/día |
|---|---|---|
| Histórico con ausencias cargadas | 14,96 | 2,76 |
| Proyección sin cargar ausencias | 17,49 | 0 |
| Slots operativos | 15 | |

La capacidad bruta es `28 × 5/8 = 17,5` por día. Las vacaciones que corresponden
al plantel (952 días-persona/año) están dimensionadas casi exactamente para
absorber el excedente estructural (912 días-persona/año).

**Consecuencia práctica:** leer la cobertura de un período sin ausencias cargadas
muestra ~24% de superposiciones. Con las ausencias cargadas baja a ~7,6%. No es
un defecto del motor: es un cronograma incompleto.

---

## 10. Estado de la implementación

| Regla | Estado |
|---|---|
| 1 · Ciclo 5×3 | Implementada |
| 2 · Rotación de turno | Implementada |
| 3 · Móvil por mes calendario | Implementada |
| 4 · No partir bloque | Implementada |
| 5 · Franjas horarias | Implementada |
| 6 · Desdoble | Implementada |
| 7 · Perfil Ruta 36 | Implementada |
| 8 · Móvil 4 manual | Fuera del motor, por diseño |
| 9 · Ausencias manuales | Implementada |

### Verificación automática

```bash
npm test
```

- `cuadratura-ideal.spec.ts` — contrasta el motor contra la cuadratura ideal
  depurada. Exige coincidencia exacta.
- `desdoble.spec.ts` — la regla de desdoble y su criterio.
- `projection.spec.ts` — el ciclo y la rotación.

El fixture `__fixtures__/cuadratura-ideal-2026.json` es la ideal **depurada**: se
corrigieron 12 celdas donde la planilla se apartaba de la cuadratura base.
Ninguna resolvía una superposición de tres y seis además cambiaban la franja
horaria del inspector. Las correcciones están documentadas dentro del JSON.

---

## Apéndice · Errores de método a no repetir

**Validar sobre ventanas cortas.** La regla del móvil se infirió mal dos veces
mirando ~3 meses, donde 32 días y un mes calendario dan lo mismo. Cualquier
cambio en la cadencia hay que contrastarlo contra un período largo.

**Leer la cobertura de un período crudo.** Sin ausencias cargadas, los solapes
son esperables y no indican un problema del motor.

**Confundir parches con reglas.** Las planillas traen retoques manuales de un
día. Antes de derivar una regla de un caso observado, conviene verificar que
resuelva algo — por ejemplo, que efectivamente haya una superposición de tres.
