# Configuraciones Operativas

**Versión:** 2.6

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
cambio_movil: inicio_de_bloque
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


## 11. Origen inicial de las configuraciones

Durante la puesta en marcha, las configuraciones y posiciones pueden inferirse y cargarse desde la hoja `Móviles CBA 26-27`.

Esta carga:

- ocurre una sola vez;
- debe ser revisada antes de confirmarse;
- crea las vigencias iniciales;
- no habilita actualizaciones posteriores desde Excel;
- no reemplaza la administración normal de configuraciones después de la puesta en marcha.

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

## 15. Configuración ejecutable 2.6

```yaml
turnos:
  duracion_minutos: 480
  fecha_operativa: inicio
inicializador:
  hoja_exacta: "Móviles Cba 26-27"
  rango_esperado: "A1:OP56"
  celdas_combinadas: "forward-fill solo encabezados"
  reversion: "solo antes de capas derivadas o eventos reales"
trabajo_demanda:
  prioridad_turnos: [T, N, M]
  requiere_hueco: true
movil4:
  posicion_externa_vinculada: M4-P03-EXT
  grupo_vinculado: GRV-M4-P03
```
