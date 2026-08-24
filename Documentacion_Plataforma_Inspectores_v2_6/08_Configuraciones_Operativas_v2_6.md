# Configuraciones Operativas

**Versión:** 2.7

## 1. Objetivo

Representar variaciones aprobadas sin convertirlas en condiciones rígidas del código.

Se reemplaza el término ambiguo “perfil del inspector” por **configuración operativa del inspector**.

## 2. Componentes

Una configuración puede definir:

- Secuencia de turnos.
- Secuencia de móviles.
- Posición inicial.
- Grupo de francos.
- Base operativa.
- Fecha desde/hasta.
- Regla de cambio de móvil.
- Condiciones de cobertura.
- Estado y aprobación.

## 3. Configuración general

```yaml
nombre: Rotación general
ciclo_laboral:
  trabajo: 5
  franco: 3
turnos: [M, N, T]
moviles: [1, 5, 3, 2]
rotacion: 1 -> 5 -> 3 -> 2 -> 1
bloques_por_movil: 4
cambio_movil: inicio_de_bloque_y_al_completar_bloques_por_movil
continuidad_mensual: true
```

## 4. Configuración de cuadratura propia del móvil 4

La cuadratura del móvil 4 debe configurarse mediante cinco posiciones continuas:

```yaml
nombre: Cuadratura móvil 4
tipo: movil4
cantidad_posiciones: 5
ciclo:
  trabajo: 5
  franco: 3
turnos: [M, N, T]
moviles: [4]
desfase_posiciones: configurable
capacidad_maxima_por_turno: 2
base: Ruta 53
```

Cada posición conserva su estado aunque cambie la persona asignada.

## 5. Configuración de dupla vinculada

```yaml
nombre: Dupla vinculada móvil 4
tipo: dupla_vinculada
posiciones:
  - rol: movil_4
  - rol: movil_externo
grupo_franco_compartido: true
turnos_compartidos: true
secuencia_movil_externo: [5, 3, 2, 1]
alternancia: por_periodo_al_inicio_de_bloque
reiniciar_por_ausencia: false
```

## 6. Configuración fija

Ejemplo conceptual:

```yaml
nombre: Fijo móvil 4
turnos: [M, N, T]
moviles: [4]
grupo_franco: configurable
base: Ruta 53
```

## 7. Configuración especial

Permite secuencias como:

```yaml
nombre: Rotación especial con móvil 4
moviles: [4, 3, 4, 1]
turnos: [M, N, T]
vigencia_desde: YYYY-MM-DD
vigencia_hasta: null
```

La secuencia real debe obtenerse de la cuadratura aprobada y validarse con supervisión.

## 8. Grupos de franco

El grupo de francos es independiente de la secuencia de móviles.

Esto permite que dos inspectores:

- compartan F;
- tengan móviles diferentes;
- cambien de configuración sin perder sincronización, si así se aprueba.

## 9. Vigencias

- No puede haber dos configuraciones activas superpuestas para el mismo inspector.
- Todo cambio futuro debe tener fecha de inicio.
- El historial no se sobrescribe.
- Una configuración finalizada conserva su trazabilidad.

## 10. Pendientes

- Confirmar si existen otras duplas o grupos vinculados además del caso validado.
- Confirmar la configuración histórica de cada inspector.


## 11. Origen inicial de las configuraciones (2.7)

Durante la puesta en marcha, las configuraciones y posiciones se cargan mediante el **seed operativo directo** del sistema (RN-026), sin importación de Excel.

Esta carga:

- se ejecuta con el script `scripts/seed-catalogos.mjs`;
- toma como corte el 01/06/2026;
- es idempotente (limpia y reinserta los estados operativos antes de cargar);
- crea las vigencias iniciales de asignaciones y estados de posición;
- persiste `bloques_completados_movil` para respetar la rotación 1 → 5 → 3 → 2 → 1 con 4 bloques por móvil;
- no habilita ninguna importación externa después de la puesta en marcha;
- toda modificación posterior se realiza por administración operativa auditada.

## 12. Configuración de vacaciones

```yaml
vacaciones:
  dias_corridos: true
  francos_previos: 3
  franco_posterior: 1
  protocolos:
    7:
      trabajos_demanda: 0
    14:
      trabajos_demanda: 1
    21:
      trabajos_demanda: 2
    28:
      trabajos_demanda: 1
    35:
      trabajos_demanda: 2
  trabajo_demanda:
    priorizar_turnos: [T, N]
    movil: cualquiera_con_necesidad
    respetar_capacidad: true
  retorno:
    modo: cuadratura_planificada_vigente
```


## 13. Catálogo inicial del móvil 4

```yaml
movil_4:
  referencia: 2026-05-01
  posiciones:
    - { codigo: M4-P01, ancla: 2026-05-01, codigo_inicial: M4, desfase_dias: 0 }
    - { codigo: M4-P02, ancla: 2026-05-02, codigo_inicial: T4, desfase_dias: 1 }
    - { codigo: M4-P03, ancla: 2026-05-04, codigo_inicial: N4, desfase_dias: 3, grupo_vinculado: Haro-Ramos }
    - { codigo: M4-P04, ancla: 2026-05-05, codigo_inicial: M4, desfase_dias: 4 }
    - { codigo: M4-P05, ancla: 2026-05-07, codigo_inicial: T4, desfase_dias: 6 }
```

## 13.bis Catálogo inicial Ruta 36 (móviles 6 y 7)

```yaml
ruta_36:
  base: Ruta 36
  referencia: 2026-06-01
  ciclo: { trabajo: 5, franco: 3 }
  turnos: [M, N, T]
  capacidad_maxima_por_turno: 2
  cobertura_objetivo: 1
  dupla_vinculada: false
  movil_6:
    sitio: Piedras Moras
    horarios: { M: "06:00", T: "14:00", N: "22:00" }
    posiciones:
      - { codigo: M6-P01, ocupante: "López J.", ancla: 2026-06-01, codigo_inicial: M6 }
      - { codigo: M6-P02, ocupante: Scagnetti, ancla: 2026-06-01, codigo_inicial: T6 }
      - { codigo: M6-P03, ocupante: Cingolani, ancla: 2026-06-01, codigo_inicial: N6 }
      - { codigo: M6-P04, ocupante: Fanloo, ancla: 2026-06-03, codigo_inicial: M6, desfase_dias: 2 }
      - { codigo: M6-P05, ocupante: Torres, ancla: 2026-06-03, codigo_inicial: T6, desfase_dias: 2 }
  movil_7:
    sitio: Arroyo Tegua
    horarios: { M: "07:00", T: "15:00", N: "23:00" }
    posiciones:
      - { codigo: M7-P01, ocupante: Falco, ancla: 2026-06-01, codigo_inicial: M7 }
      - { codigo: M7-P02, ocupante: "Fernández L.", ancla: 2026-06-01, codigo_inicial: T7 }
      - { codigo: M7-P03, ocupante: Zeballe, ancla: 2026-06-01, codigo_inicial: N7 }
      - { codigo: M7-P04, ocupante: Coria, ancla: 2026-06-03, codigo_inicial: M7, desfase_dias: 2 }
      - { codigo: M7-P05, ocupante: Coronel, ancla: 2026-06-03, codigo_inicial: T7, desfase_dias: 2 }
```

## 14. Cobertura y aprobación

```yaml
cobertura:
  objetivo_por_movil_turno: 1
  maximo_por_movil_turno: 2
  hueco:
    permitido: true
    alerta: true
    exige_motivo: true
    exige_responsable: true

flujo:
  prepara: ADMINISTRACION_SEGURIDAD_VIAL
  aprueba_publica: JEFE_SECTOR
  aprobacion_publicacion_atomica: true
  version_publicada_inmutable: true
```

## 15. Configuración ejecutable 2.7

```yaml
turnos:
  duracion_minutos: 480
  fecha_operativa: inicio
seed_operativo:
  script: scripts/seed-catalogos.mjs
  corte: 2026-06-01
  idempotente: true
  wipe_previo:
    - asignacion_inspector_posicion
    - estado_inicial_posicion
    - miembro_grupo_rotacion_vinculada
    - grupo_rotacion_vinculada
    - posicion_cuadratura
    - grupo_franco
    - inspector
motor:
  rotacion_general: [1, 5, 3, 2]
  bloques_por_movil: 4
  perfiles_fijos: [FIJO_MOVIL, MOVIL6_FIJO, MOVIL7_FIJO]
  fuente_estado_inicial: estado_inicial_posicion
  campo_persistido: bloques_completados_movil
trabajo_demanda:
  prioridad_turnos: [T, N, M]
  requiere_hueco: true
movil4:
  posicion_externa_vinculada: M4-P03-EXT
  grupo_vinculado: GRV-M4-P03
ruta36:
  base: RUTA36
  moviles: [6, 7]
  perfiles: [MOVIL6_FIJO, MOVIL7_FIJO]
  posiciones_por_movil: 5
```
