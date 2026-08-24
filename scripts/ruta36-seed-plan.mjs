/**
 * Deriva estados iniciales al 2026-06-01 desde el cronograma canónico junio-agosto 2026.
 * Compara la proyección del motor con la cuadratura declarada para validar cada ancla.
 *
 * No modifica la base. Emite JSON con los datos listos para pegar en la migración de seed.
 */
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createState,
  advanceOneDay,
} from '../apps/api/src/modules/schedule-engine/projection.js';

// Nota: se resuelve TS en runtime vía tsx si es necesario; ver invocación con --loader.

/* -------------------- Datos del cronograma canónico ---------------------- */

// Móviles 6 y 7 (Ruta 36) — usan MOVILx_FIJO
// Móviles 1..5 — perfil ROTACION_GENERAL con secuencia [1,5,3,2]
// Móvil 4 — perfil MOVIL4_FIJO con [4]

const M6_M7 = [
  { name: 'Fanloo',       pattern: 'F F T6 T6 T6 T6 T6 F F F M6 M6 M6 M6 M6 F F F N6 N6 N6 N6 N6 F F F T6 T6 T6 T6 T6 F F F M6 M6 M6 M6 M6 F F F N6 N6 N6 N6 N6 F F F T6 T6 T6 T6 T6 F F F M6 M6 M6 M6 M6 F F F N6 N6 N6 N6 N6 F F F T6 T6 T6 T6 T6 F F F M6 M6 M6 M6 M6 F F F N6 N6' },
  { name: 'Scagnetti',    pattern: 'T6 T6 F F F M6 M6 M6 M6 M6 F F F N6 N6 N6 N6 N6 F F F T6 T6 T6 T6 T6 F F F M6 M6 M6 M6 M6 F F F N6 N6 N6 N6 N6 F F F T6 T6 T6 T6 T6 F F F M6 M6 M6 M6 M6 F F F N6 N6 N6 N6 N6 F F F T6 T6 T6 T6 T6 F F F M6 M6 M6 M6 M6 F F F N6 N6 N6 N6 N6 F F' },
  { name: 'López J.',     pattern: 'M6 M6 M6 M6 M6 F F F N6 N6 N6 N6 N6 F F F T6 T6 T6 T6 T6 F F F M6 M6 M6 M6 M6 F F F N6 N6 N6 N6 N6 F F F T6 T6 T6 T6 T6 F F F M6 M6 M6 M6 M6 F F F N6 N6 N6 N6 N6 F F F T6 T6 T6 T6 T6 F F F M6 M6 M6 M6 M6 F F F N6 N6 N6 N6 N6 F F F T6 T6 T6 T6' },
  { name: 'Cingolani',    pattern: 'F F F N6 N6 N6 N6 N6 F F F T6 T6 T6 T6 T6 F F F M6 M6 M6 M6 M6 F F F N6 N6 N6 N6 N6 F F F T6 T6 T6 T6 T6 F F F M6 M6 M6 M6 M6 F F F N6 N6 N6 N6 N6 F F F T6 T6 T6 T6 T6 F F F M6 M6 M6 M6 M6 F F F N6 N6 N6 N6 N6 F F F T6 T6 T6 T6 T6 F F F M6' },
  { name: 'Torres',       pattern: 'N6 N6 N6 F F F T6 T6 T6 T6 T6 F F F M6 M6 M6 M6 M6 F F F N6 N6 N6 N6 N6 F F F T6 T6 T6 T6 T6 F F F M6 M6 M6 M6 M6 F F F N6 N6 N6 N6 N6 F F F T6 T6 T6 T6 T6 F F F M6 M6 M6 M6 M6 F F F N6 N6 N6 N6 N6 F F F T6 T6 T6 T6 T6 F F F M6 M6 M6 M6 M6 F' },
  { name: 'Coria',        pattern: 'M7 M7 F F F N7 N7 N7 N7 N7 F F F T7 T7 T7 T7 T7 F F F M7 M7 M7 M7 M7 F F F N7 N7 N7 N7 N7 F F F T7 T7 T7 T7 T7 F F F M7 M7 M7 M7 M7 F F F N7 N7 N7 N7 N7 F F F T7 T7 T7 T7 T7 F F F M7 M7 M7 M7 M7 F F F N7 N7 N7 N7 N7 F F F T7 T7 T7 T7 T7 F F' },
  { name: 'Fernandez L.', pattern: 'N7 N7 N7 N7 N7 F F F T7 T7 T7 T7 T7 F F F M7 M7 M7 M7 M7 F F F N7 N7 N7 N7 N7 F F F T7 T7 T7 T7 T7 F F F M7 M7 M7 M7 M7 F F F N7 N7 N7 N7 N7 F F F T7 T7 T7 T7 T7 F F F M7 M7 M7 M7 M7 F F F N7 N7 N7 N7 N7 F F F T7 T7 T7 T7 T7 F F F M7 M7 M7 M7' },
  { name: 'Falco',        pattern: 'F F F T7 T7 T7 T7 T7 F F F M7 M7 M7 M7 M7 F F F N7 N7 N7 N7 N7 F F F T7 T7 T7 T7 T7 F F F M7 M7 M7 M7 M7 F F F N7 N7 N7 N7 N7 F F F T7 T7 T7 T7 T7 F F F M7 M7 M7 M7 M7 F F F N7 N7 N7 N7 N7 F F F T7 T7 T7 T7 T7 F F F M7 M7 M7 M7 M7 F F F N7' },
  { name: 'Zeballe',      pattern: 'T7 T7 T7 F F F M7 M7 M7 M7 M7 F F F N7 N7 N7 N7 N7 F F F T7 T7 T7 T7 T7 F F F M7 M7 M7 M7 M7 F F F N7 N7 N7 N7 N7 F F F T7 T7 T7 T7 T7 F F F M7 M7 M7 M7 M7 F F F N7 N7 N7 N7 N7 F F F T7 T7 T7 T7 T7 F F F M7 M7 M7 M7 M7 F F F N7 N7 N7 N7 N7 F' },
  { name: 'Coronel R36',  pattern: 'F M7 M7 M7 M7 M7 F F F N7 N7 N7 N7 N7 F F F T7 T7 T7 T7 T7 F F F M7 M7 M7 M7 M7 F F F N7 N7 N7 N7 N7 F F F T7 T7 T7 T7 T7 F F F M7 M7 M7 M7 M7 F F F N7 N7 N7 N7 N7 F F F T7 T7 T7 T7 T7 F F F M7 M7 M7 M7 M7 F F F N7 N7 N7 N7 N7 F F F T7 T7 T7' },
];

const M4 = [
  { name: 'Carranza G.', pattern: 'M4 M4 F F F N4 N4 N4 N4 N4 F F F T4 T4 T4 T4 T4 F F F M4 M4 M4 M4 M4 F F F N4 N4 N4 N4 N4 F F F T4 T4 T4 T4 T4 F F F M4 M4 M4 M4 M4 F F F N4 N4 N4 N4 N4 F F F T4 T4 T4 T4 T4 F F F M4 M4 M4 M4 M4 F F F N4 N4 N4 N4 N4 F F F T4 T4 T4 T4 T4 F F' },
  { name: 'Carranza M.', pattern: 'F F M4 M4 M4 M4 M4 F F F N4 N4 N4 N4 N4 F F F T4 T4 T4 T4 T4 F F F M4 M4 M4 M4 M4 F F F N4 N4 N4 N4 N4 F F F T4 T4 T4 T4 T4 F F F M4 M4 M4 M4 M4 F F F N4 N4 N4 N4 N4 F F F T4 T4 T4 T4 T4 F F F M4 M4 M4 M4 M4 F F F N4 N4 N4 N4 N4 F F F T4 T4' },
  { name: 'Mainardi',    pattern: 'T4 T4 T4 T4 F F F M4 M4 M4 M4 M4 F F F N4 N4 N4 N4 N4 F F F T4 T4 T4 T4 T4 F F F M4 M4 M4 M4 M4 F F F N4 N4 N4 N4 N4 F F F T4 T4 T4 T4 T4 F F F M4 M4 M4 M4 M4 F F F N4 N4 N4 N4 N4 F F F T4 T4 T4 T4 T4 F F F M4 M4 M4 M4 M4 F F F N4 N4 N4 N4 N4' },
  { name: 'Haro',        pattern: 'N4 F F F T4 T4 T4 T4 T4 F F F M4 M4 M4 M4 M4 F F F N4 N4 N4 N4 N4 F F F T4 T4 T4 T4 T4 F F F M4 M4 M4 M4 M4 F F F N4 N4 N4 N4 N4 F F F T4 T4 T4 T4 T4 F F F M4 M4 M4 M4 M4 F F F N4 N4 N4 N4 N4 F F F T4 T4 T4 T4 T4 F F F M4 M4 M4 M4 M4 F F F' },
  { name: 'Del Bel',     pattern: 'F N4 N4 N4 N4 N4 F F F T4 T4 T4 T4 T4 F F F M4 M4 M4 M4 M4 F F F N4 N4 N4 N4 N4 F F F T4 T4 T4 T4 T4 F F F M4 M4 M4 M4 M4 F F F N4 N4 N4 N4 N4 F F F T4 T4 T4 T4 T4 F F F M4 M4 M4 M4 M4 F F F N4 N4 N4 N4 N4 F F F T4 T4 T4 T4 T4 F F F M4 M4 M4' },
];

const GEN = [
  { name: 'Garate',       pattern: 'T1 T1 F F F M5 M5 M5 M5 M5 F F F N5 N5 N5 N5 N5 F F F T5 T5 T5 T5 T5 F F F M5 M5 M5 M5 M5 F F F N3 N3 N3 N3 N3 F F F T3 T3 T3 T3 T3 F F F M3 M3 M3 M3 M3 F F F N2 N2 N2 N2 N2 F F F T2 T2 T2 T2 T2 F F F M2 M2 M2 M2 M2 F F F N2 N2 N2 N2 N2 F F' },
  { name: 'Gimenez P.',   pattern: 'M1 F F F N5 N5 N5 N5 N5 F F F T5 T5 T5 T5 T5 F F F M5 M5 M5 M5 M5 F F F N5 N5 N5 N5 N5 F F F T3 T3 T3 T3 T3 F F F M3 M3 M3 M3 M3 F F F N3 N3 N3 N3 N3 F F F T3 T3 T3 T3 T3 F F F M2 M2 M2 M2 M2 F F F N2 N2 N2 N2 N2 F F F T2 T2 T2 T2 T2 F F F' },
  { name: 'Coronel',      pattern: 'F F T5 T5 T5 T5 T5 F F F M5 M5 M5 M5 M5 F F F N5 N5 N5 N5 N5 F F F T5 T5 T5 T5 T5 F F F M3 M3 M3 M3 M3 F F F N3 N3 N3 N3 N3 F F F T3 T3 T3 T3 T3 F F F M3 M3 M3 M3 M3 F F F N2 N2 N2 N2 N2 F F F T2 T2 T2 T2 T2 F F F M2 M2 M2 M2 M2 F F F N2 N2' },
  { name: 'Almada',       pattern: 'F N5 N5 N5 N5 N5 F F F T5 T5 T5 T5 T5 F F F M5 M5 M5 M5 M5 F F F N5 N5 N5 N5 N5 F F F T3 T3 T3 T3 T3 F F F M3 M3 M3 M3 M3 F F F N3 N3 N3 N3 N3 F F F T3 T3 T3 T3 T3 F F F M2 M2 M2 M2 M2 F F F N2 N2 N2 N2 N2 F F F T2 T2 T2 T2 T2 F F F M2 M2 M2' },
  { name: 'Grandi',       pattern: 'M5 M5 M5 M5 M5 F F F N5 N5 N5 N5 N5 F F F T5 T5 T5 T5 T5 F F F M5 M5 M5 M5 M5 F F F N3 N3 N3 N3 N3 F F F T3 T3 T3 T3 T3 F F F M3 M3 M3 M3 M3 F F F N3 N3 N3 N3 N3 F F F T2 T2 T2 T2 T2 F F F M2 M2 M2 M2 M2 F F F N2 N2 N2 N2 N2 F F F T2 T2 T2 T2' },
  { name: 'Tejada',       pattern: 'F M1 M1 M1 M1 M1 F F F N1 N1 N1 N1 N1 F F F T1 T1 T1 T1 T1 F F F M1 M1 M1 M1 M1 F F F N5 N5 N5 N5 N5 F F F T5 T5 T5 T5 T5 F F F M5 M5 M5 M5 M5 F F F N5 N5 N5 N5 N5 F F F T3 T3 T3 T3 T3 F F F M3 M3 M3 M3 M3 F F F N3 N3 N3 N3 N3 F F F T3 T3 T3' },
  { name: 'Acosta',       pattern: 'M2 F F F N1 N1 N1 N1 N1 F F F T1 T1 T1 T1 T1 F F F M1 M1 M1 M1 M1 F F F N1 N1 N1 N1 N1 F F F T5 T5 T5 T5 T5 F F F M5 M5 M5 M5 M5 F F F N5 N5 N5 N5 N5 F F F T5 T5 T5 T5 T5 F F F M3 M3 M3 M3 M3 F F F N3 N3 N3 N3 N3 F F F T3 T3 T3 T3 T3 F F F' },
  { name: 'Martinez J.',  pattern: 'F F F T1 T1 T1 T1 T1 F F F M1 M1 M1 M1 M1 F F F N1 N1 N1 N1 N1 F F F T1 T1 T1 T1 T1 F F F M5 M5 M5 M5 M5 F F F N5 N5 N5 N5 N5 F F F T5 T5 T5 T5 T5 F F F M5 M5 M5 M5 M5 F F F N3 N3 N3 N3 N3 F F F T3 T3 T3 T3 T3 F F F M3 M3 M3 M3 M3 F F F N2' },
  { name: 'Peralta M.',   pattern: 'T2 T2 T2 F F F M1 M1 M1 M1 M1 F F F N1 N1 N1 N1 N1 F F F T1 T1 T1 T1 T1 F F F M5 M5 M5 M5 M5 F F F N5 N5 N5 N5 N5 F F F T5 T5 T5 T5 T5 F F F M5 M5 M5 M5 M5 F F F N3 N3 N3 N3 N3 F F F T3 T3 T3 T3 T3 F F F M3 M3 M3 M3 M3 F F F N3 N3 N3 N3 N3 F' },
  { name: 'Zambrano N.',  pattern: 'N1 N1 N1 N1 N1 F F F T1 T1 T1 T1 T1 F F F M1 M1 M1 M1 M1 F F F N1 N1 N1 N1 N1 F F F T5 T5 T5 T5 T5 F F F M5 M5 M5 M5 M5 F F F N5 N5 N5 N5 N5 F F F T5 T5 T5 T5 T5 F F F M3 M3 M3 M3 M3 F F F N3 N3 N3 N3 N3 F F F T3 T3 T3 T3 T3 F F F M3 M3 M3 M3' },
  { name: 'Capdevila',    pattern: 'F F M2 M2 M2 M2 M2 F F F N2 N2 N2 N2 N2 F F F T2 T2 T2 T2 T2 F F F M2 M2 M2 M2 M2 F F F N1 N1 N1 N1 N1 F F F T1 T1 T1 T1 T1 F F F M1 M1 M1 M1 M1 F F F N1 N1 N1 N1 N1 F F F T5 T5 T5 T5 T5 F F F M5 M5 M5 M5 M5 F F F N5 N5 N5 N5 N5 F F F T5 T5' },
  { name: 'Sandoval',     pattern: 'T3 T3 T3 T3 F F F M2 M2 M2 M2 M2 F F F N2 N2 N2 N2 N2 F F F T2 T2 T2 T2 T2 F F F M1 M1 M1 M1 M1 F F F N1 N1 N1 N1 N1 F F F T1 T1 T1 T1 T1 F F F M1 M1 M1 M1 M1 F F F N5 N5 N5 N5 N5 F F F T5 T5 T5 T5 T5 F F F M5 M5 M5 M5 M5 F F F N5 N5 N5 N5 N5' },
  { name: 'Lungrin',      pattern: 'F N2 N2 N2 N2 N2 F F F T2 T2 T2 T2 T2 F F F M2 M2 M2 M2 M2 F F F N2 N2 N2 N2 N2 F F F T1 T1 T1 T1 T1 F F F M1 M1 M1 M1 M1 F F F N1 N1 N1 N1 N1 F F F T1 T1 T1 T1 T1 F F F M5 M5 M5 M5 M5 F F F N5 N5 N5 N5 N5 F F F T5 T5 T5 T5 T5 F F F M5 M5 M5' },
  { name: 'Giuliani',     pattern: 'N3 F F F T2 T2 T2 T2 T2 F F F M2 M2 M2 M2 M2 F F F N2 N2 N2 N2 N2 F F F T2 T2 T2 T2 T2 F F F M1 M1 M1 M1 M1 F F F N1 N1 N1 N1 N1 F F F T1 T1 T1 T1 T1 F F F M1 M1 M1 M1 M1 F F F N5 N5 N5 N5 N5 F F F T5 T5 T5 T5 T5 F F F M5 M5 M5 M5 M5 F F F' },
  { name: 'Tissera',      pattern: 'M3 M3 F F F N2 N2 N2 N2 N2 F F F T2 T2 T2 T2 T2 F F F M2 M2 M2 M2 M2 F F F N2 N2 N2 N2 N2 F F F T1 T1 T1 T1 T1 F F F M1 M1 M1 M1 M1 F F F N1 N1 N1 N1 N1 F F F T5 T5 T5 T5 T5 F F F M5 M5 M5 M5 M5 F F F N5 N5 N5 N5 N5 F F F T5 T5 T5 T5 T5 F F' },
  { name: 'Martinez F.',  pattern: 'N3 N3 N3 N3 N3 F F F T3 T3 T3 T3 T3 F F F M3 M3 M3 M3 M3 F F F N3 N3 N3 N3 N3 F F F T2 T2 T2 T2 T2 F F F M2 M2 M2 M2 M2 F F F N2 N2 N2 N2 N2 F F F T2 T2 T2 T2 T2 F F F M1 M1 M1 M1 M1 F F F N1 N1 N1 N1 N1 F F F T1 T1 T1 T1 T1 F F F M1 M1 M1 M1' },
  { name: 'Zambrano M.',  pattern: 'M5 M5 F F F N3 N3 N3 N3 N3 F F F T3 T3 T3 T3 T3 F F F M3 M3 M3 M3 M3 F F F N3 N3 N3 N3 N3 F F F T3 T3 T3 T3 T3 F F F M2 M2 M2 M2 M2 F F F N2 N2 N2 N2 N2 F F F T1 T1 T1 T1 T1 F F F M1 M1 M1 M1 M1 F F F N1 N1 N1 N1 N1 F F F T1 T1 T1 T1 T1 F F' },
  { name: 'Barrera P.',   pattern: 'F F M3 M3 M3 M3 M3 F F F N3 N3 N3 N3 N3 F F F T3 T3 T3 T3 T3 F F F M3 M3 M3 M3 M3 F F F N2 N2 N2 N2 N2 F F F T2 T2 T2 T2 T2 F F F M2 M2 M2 M2 M2 F F F N2 N2 N2 N2 N2 F F F T1 T1 T1 T1 T1 F F F M1 M1 M1 M1 M1 F F F N1 N1 N1 N1 N1 F F F T1 T1' },
  { name: 'Carletto G.',  pattern: 'T5 T5 T5 T5 F F F M3 M3 M3 M3 M3 F F F N3 N3 N3 N3 N3 F F F T3 T3 T3 T3 T3 F F F M2 M2 M2 M2 M2 F F F N2 N2 N2 N2 N2 F F F T2 T2 T2 T2 T2 F F F M2 M2 M2 M2 M2 F F F N1 N1 N1 N1 N1 F F F T1 T1 T1 T1 T1 F F F M1 M1 M1 M1 M1 F F F N1 N1 N1 N1 N1' },
  { name: 'Ramos G.',     pattern: 'N5 F F F T3 T3 T3 T3 T3 F F F M3 M3 M3 M3 M3 F F F N3 N3 N3 N3 N3 F F F T3 T3 T3 T3 T3 F F F M2 M2 M2 M2 M2 F F F N2 N2 N2 N2 N2 F F F T2 T2 T2 T2 T2 F F F M2 M2 M2 M2 M2 F F F N1 N1 N1 N1 N1 F F F T1 T1 T1 T1 T1 F F F M1 M1 M1 M1 M1 F F F' },
  { name: 'Flores J.',    pattern: 'N5 N5 N5 F F F T5 T5 T5 T5 T5 F F F M5 M5 M5 M5 M5 F F F N5 N5 N5 N5 N5 F F F T3 T3 T3 T3 T3 F F F M3 M3 M3 M3 M3 F F F N3 N3 N3 N3 N3 F F F T3 T3 T3 T3 T3 F F F M2 M2 M2 M2 M2 F F F N2 N2 N2 N2 N2 F F F T2 T2 T2 T2 T2 F F F M2 M2 M2 M2 M2 F' },
  { name: 'Bendayán',     pattern: 'F F F N3 N3 N3 N3 N3 F F F T3 T3 T3 T3 T3 F F F M3 M3 M3 M3 M3 F F F N3 N3 N3 N3 N3 F F F T2 T2 T2 T2 T2 F F F M2 M2 M2 M2 M2 F F F N2 N2 N2 N2 N2 F F F T2 T2 T2 T2 T2 F F F M1 M1 M1 M1 M1 F F F N1 N1 N1 N1 N1 F F F T1 T1 T1 T1 T1 F F F M1' },
];

/* ------------------- Inferencia del estado inicial ---------------------- */

function tokenize(pattern) {
  return pattern.trim().split(/\s+/);
}

/** Descubre bloques de trabajo (turno+móvil, día inicio, día fin). */
function detectBlocks(tokens) {
  const blocks = [];
  let cur = null;
  tokens.forEach((tok, idx) => {
    if (tok === 'F') {
      if (cur) {
        blocks.push(cur);
        cur = null;
      }
      return;
    }
    const shift = tok[0];
    const mobile = Number(tok.slice(1));
    if (cur && cur.shift === shift && cur.mobile === mobile && cur.end === idx - 1) {
      cur.end = idx;
    } else {
      if (cur) blocks.push(cur);
      cur = { shift, mobile, start: idx, end: idx };
    }
  });
  if (cur) blocks.push(cur);
  return blocks;
}

/** Deriva el estado engineable al día 0 (2026-06-01) a partir de la secuencia. */
function inferInitialState(tokens, shifts, mobiles) {
  const blocks = detectBlocks(tokens);
  if (blocks.length === 0) {
    throw new Error('sin bloques');
  }

  // Buscar el bloque activo al día 0 o el próximo bloque si el día 0 es franco.
  const first = blocks[0];

  let cyclePosition;
  let shift = null;
  let mobile = null;
  let shiftIndex;
  let mobileIndex;
  let completedBlocksOnMobile;

  if (first.start === 0) {
    // Día 0 dentro del primer bloque de trabajo. Determinar día dentro del bloque (0..4).
    const daysInto = 0; // día 0 = primer día del array
    // Puede que el bloque previo (mayo) haya terminado el día -1 y el bloque actual empiece en 0..-4.
    // Necesitamos saber en qué día del bloque estamos al día 0.
    const blockLen = first.end - first.start + 1;
    // Si el bloque tiene 5 días completos visibles: día 0 es día 1 del bloque.
    // Si el bloque tiene <5, arrancó antes del 01/06.
    const dayInBlock = 5 - blockLen; // 0..4
    cyclePosition = dayInBlock;
    shift = first.shift;
    mobile = first.mobile;
    shiftIndex = shifts.indexOf(shift);
    mobileIndex = mobiles.indexOf(mobile);
    // Cuántos bloques ya se completaron en el móvil actual antes del bloque en curso:
    // buscar hacia adelante hasta el primer cambio de móvil y contar bloques.
    let blocksInCurrentMobileSoFar = 0;
    for (let i = 0; i < blocks.length; i++) {
      if (blocks[i].mobile !== mobile) break;
      blocksInCurrentMobileSoFar++;
    }
    // Bloque actual es "el primero" en la ventana, previamente se cerraron (4 - blocksInCurrentMobileSoFar)
    // porque cambia móvil cada 4 bloques.
    completedBlocksOnMobile = 4 - blocksInCurrentMobileSoFar;
  } else {
    // Día 0 en franco (o antes del primer bloque visible).
    const francoStart = 0;
    const francoLen = first.start; // días de franco visibles antes del primer bloque
    // Al menos 1 franco, hasta 3. Si visibles < 3, el resto quedó en mayo.
    const dayInFranco = 3 - francoLen; // 0..2
    cyclePosition = 5 + dayInFranco;
    shift = null;
    mobile = null;
    // El próximo bloque (first) tendrá shift=first.shift y mobile=first.mobile.
    // Antes del franco había un bloque previo con turno = shifts[(indexOf(first.shift)-1+3)%3]
    // y móvil = si el primer bloque cambia móvil, era el móvil previo; si no, mismo.
    let blocksInCurrentMobileSoFar = 0;
    for (let i = 0; i < blocks.length; i++) {
      if (blocks[i].mobile !== first.mobile) break;
      blocksInCurrentMobileSoFar++;
    }
    // Si el primer bloque tras el franco es el primero de su móvil (i.e. el móvil previo era distinto):
    // el previo era el 4to en el móvil anterior. Guardamos completedBlocksOnMobile=4 y mobileIndex = anterior.
    // El motor al cerrar franco: shiftIndex++, y si completed>=4 mobileIndex++.
    const nextShiftIdx = shifts.indexOf(first.shift);
    const prevShiftIdx = (nextShiftIdx - 1 + shifts.length) % shifts.length;
    shiftIndex = prevShiftIdx;
    if (blocksInCurrentMobileSoFar === 4) {
      // El primer bloque es el 1ro en móvil nuevo → antes había 4 en el móvil anterior.
      const nextMobIdx = mobiles.indexOf(first.mobile);
      const prevMobIdx = (nextMobIdx - 1 + mobiles.length) % mobiles.length;
      mobileIndex = prevMobIdx;
      completedBlocksOnMobile = 4;
    } else {
      // Continuación del mismo móvil.
      mobileIndex = mobiles.indexOf(first.mobile);
      completedBlocksOnMobile = 4 - blocksInCurrentMobileSoFar;
    }
  }

  return {
    cyclePosition,
    shift,
    mobile,
    shiftIndex,
    mobileIndex,
    completedBlocksOnMobile,
    shifts,
    mobiles,
  };
}

/* -------------------- Validación contra el motor ------------------------- */

async function loadEngine() {
  // Cargar motor compilando TS en runtime con tsx.
  const mod = await import('../apps/api/src/modules/schedule-engine/projection.ts');
  return mod;
}

async function main() {
  const engine = await loadEngine();
  const perfil = {
    GEN: { shifts: ['M', 'N', 'T'], mobiles: [1, 5, 3, 2] },
    M4:  { shifts: ['M', 'N', 'T'], mobiles: [4] },
    M6:  { shifts: ['M', 'N', 'T'], mobiles: [6] },
    M7:  { shifts: ['M', 'N', 'T'], mobiles: [7] },
  };

  const results = [];
  const errors = [];

  const runOne = (name, tokens, kind) => {
    const cfg = perfil[kind];
    const state0 = inferInitialState(tokens, cfg.shifts, cfg.mobiles);
    const input = {
      positionCode: name,
      positionId: name,
      inspectorId: name,
      inspectorName: name,
      referenceDate: '2026-06-01',
      cyclePosition: state0.cyclePosition,
      shift: state0.shift,
      mobile: state0.mobile,
      shiftIndex: state0.shiftIndex,
      mobileIndex: state0.mobileIndex,
      shifts: cfg.shifts,
      mobiles: cfg.mobiles,
      completedBlocksOnMobile: state0.completedBlocksOnMobile,
    };
    let state = engine.createState(input);
    for (let i = 0; i < tokens.length; i++) {
      const expected = tokens[i];
      const day = engine.dayFromState(state, {
        positionCode: name, positionId: name, inspectorId: name, inspectorName: name,
      });
      if (day.code !== expected) {
        errors.push({ name, day: i, expected, got: day.code });
      }
      state = engine.advanceOneDay(state);
    }
    results.push({ name, kind, state: state0 });
  };

  for (const insp of M6_M7) {
    const k = insp.pattern.includes('7') ? 'M7' : 'M6';
    runOne(insp.name, tokenize(insp.pattern), k);
  }
  for (const insp of M4) runOne(insp.name, tokenize(insp.pattern), 'M4');
  for (const insp of GEN) runOne(insp.name, tokenize(insp.pattern), 'GEN');

  const outPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'ruta36-seed-anchors.json');
  await writeFile(outPath, JSON.stringify({ results, errors }, null, 2));

  console.log(`resultados: ${results.length}  errores: ${errors.length}`);
  if (errors.length) {
    // Mostrar los primeros por inspector
    const byName = new Map();
    for (const e of errors) {
      const list = byName.get(e.name) ?? [];
      if (list.length < 3) list.push(e);
      byName.set(e.name, list);
    }
    for (const [name, list] of byName) {
      console.log('  ', name, list);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
