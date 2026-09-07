import { Injectable, NotFoundException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { DatabaseService } from '../../database/database.service';

/** Colores por turno, iguales a los de la planilla en uso. */
const COLOR = {
  M: 'FFD966',
  T: '70AD47',
  N: '2F75B6',
  F: 'D9D9D9',
  V: 'FF9999',
  EF: 'FF6666',
  RP: 'FFA500',
  L: 'FFB6C1',
  HDR: '1F4E79',
} as const;

const TEXTO: Record<string, string> = {
  M: '000000',
  T: '000000',
  N: 'FFFFFF',
  F: '555555',
  V: '000000',
  EF: 'FFFFFF',
  RP: '000000',
  L: '000000',
};

const MESES = [
  '', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const TURNOS: Array<[string, string]> = [['M', 'Mañana'], ['T', 'Tarde'], ['N', 'Noche']];

/** Horarios de entrada por franja (RPASV002). */
const HORARIOS: Record<string, [string, string]> = {
  M: ['MÓVILES 1 - 2 y 4 de 05:00 hs a 13:00 hs', 'MÓVILES 3 y 5 de 07:00 hs a 15:00 hs'],
  T: ['MÓVILES 1 - 2 y 4 de 13:00 hs a 21:00 hs', 'MÓVILES 3 y 5 de 15:00 hs a 23:00 hs'],
  N: ['MÓVILES 1 - 2 y 4 de 21:00 hs a 05:00 hs', 'MÓVILES 3 y 5 de 23:00 hs a 07:00 hs'],
};

const DIAS_POR_BLOQUE = 10;

type Fila = {
  fecha_operativa: string;
  tipo_dia: string;
  turno: string | null;
  codigo: string | null;
  movil: number | null;
  posicion_codigo: string;
  inspector_id: string | null;
  inspector: string | null;
  seccion: string | null;
  licencia_codigo: string | null;
};

export type ExportFiltros = {
  from?: string;
  to?: string;
  inspectores: string[];
  secciones: string[];
  codigos: string[];
  moviles: string[];
  turnos: string[];
};

const FILTROS_VACIOS: ExportFiltros = {
  inspectores: [],
  secciones: [],
  codigos: [],
  moviles: [],
  turnos: [],
};

const SECCION_XLS: Record<string, string> = {
  MOVILES: 'Móviles (SV)',
  EPI: 'E.P.I.',
  BO: 'Base de Operaciones',
};

function etiquetaSeccionXls(id: string | null | undefined) {
  if (!id) return SECCION_XLS.MOVILES;
  return SECCION_XLS[id] ?? id.replace(/_/g, ' ');
}

function enRango(fecha: string, from?: string, to?: string): boolean {
  if (from && fecha < from) return false;
  if (to && fecha > to) return false;
  return true;
}

/** Misma lógica que `diaPasa` / `cellShortLabel` de la grilla. */
function cortoCelda(f: Fila): string {
  const c = (f.codigo || '').trim();
  if (c) return c;
  if (f.tipo_dia === 'FRANCO') return 'F';
  if (f.tipo_dia === 'VACACION') return 'V';
  if (f.tipo_dia === 'ENFERMEDAD') return 'EF';
  if (f.turno && f.movil != null) return `${f.turno}${f.movil}`;
  return '';
}

function celdaPasa(f: Fila, filtros: ExportFiltros): boolean {
  if (filtros.moviles.length && (f.movil == null || !filtros.moviles.includes(String(f.movil)))) {
    return false;
  }
  if (filtros.turnos.length && (!f.turno || !filtros.turnos.includes(f.turno))) return false;
  if (filtros.codigos.length) {
    const codigos = new Set<string>();
    if (f.licencia_codigo) codigos.add(f.licencia_codigo);
    if (f.codigo) codigos.add(f.codigo);
    const corto = cortoCelda(f);
    if (corto) codigos.add(corto);
    if (![...codigos].some((c) => filtros.codigos.includes(c))) return false;
  }
  return true;
}

function etiquetaFiltros(filtros: ExportFiltros): string {
  const bits: string[] = [];
  if (filtros.from || filtros.to) {
    bits.push(`${filtros.from ?? '…'} al ${filtros.to ?? '…'}`);
  }
  if (filtros.codigos.length) bits.push(`códigos ${filtros.codigos.join(', ')}`);
  if (filtros.moviles.length) bits.push(`móviles ${filtros.moviles.join(', ')}`);
  if (filtros.turnos.length) bits.push(`turnos ${filtros.turnos.join(', ')}`);
  if (filtros.inspectores.length) {
    bits.push(`${filtros.inspectores.length} inspector${filtros.inspectores.length === 1 ? '' : 'es'}`);
  }
  if (filtros.secciones.length > 1) {
    bits.push(`${filtros.secciones.length} secciones`);
  }
  return bits.length ? ` · ${bits.join(' · ')}` : '';
}

const BORDE: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FFBFBFBF' } },
  left: { style: 'thin', color: { argb: 'FFBFBFBF' } },
  bottom: { style: 'thin', color: { argb: 'FFBFBFBF' } },
  right: { style: 'thin', color: { argb: 'FFBFBFBF' } },
};

function relleno(argb: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${argb}` } };
}

function ddmm(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

function hexArgb(hex?: string | null): string | null {
  if (!hex) return null;
  const t = hex.trim().replace('#', '');
  if (!/^[0-9A-Fa-f]{6}$/.test(t)) return null;
  return t.toUpperCase();
}

type CodigoCat = {
  codigo: string;
  codigo_sap: string | null;
  nombre: string;
  horario: string | null;
  color_fondo: string | null;
  color_letra: string | null;
};

function textoTimerCodigo(codigo: string, mapa: Map<string, CodigoCat>): string {
  const c = codigo.trim();
  if (!c) return '';
  const row = mapa.get(c.toUpperCase());
  if (!row) return c;
  const desc = (row.horario || row.nombre || '').trim();
  const sap = (row.codigo_sap || '').trim();
  if (desc && sap) return `${c}  ${desc} / ${sap}`;
  if (desc) return `${c}  ${desc}`;
  return c;
}

function pintarCodigo(cell: ExcelJS.Cell, codigo: string, mapa: Map<string, CodigoCat>) {
  const row = mapa.get(codigo.trim().toUpperCase());
  const bg = hexArgb(row?.color_fondo);
  const fg = hexArgb(row?.color_letra);
  if (bg) cell.fill = relleno(bg);
  cell.font = {
    size: 10,
    bold: true,
    color: fg ? { argb: `FF${fg}` } : undefined,
  };
}

@Injectable()
export class ExportsService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Arma el Excel de una versión de cronograma.
   *
   * pack=cuadratura → grilla inspector × día
   * pack=planillas  → hojas por móvil/turno (formato RPASV002)
   * pack=todo       → ambos + ocupación
   */
  async workbook(
    versionId: string,
    pack: 'cuadratura' | 'planillas' | 'todo' = 'todo',
    filtros: ExportFiltros = FILTROS_VACIOS,
  ): Promise<{ buffer: Buffer; fileName: string }> {
    const meta = await this.db.query<{
      codigo: string;
      capa: string;
      numero_version: number;
      periodo_desde: string;
      periodo_hasta: string;
    }>(
      `SELECT c.codigo, c.capa::text AS capa, v.numero_version,
              c.periodo_desde::text, c.periodo_hasta::text
       FROM seguridad_vial.cronograma_version v
       JOIN seguridad_vial.cronograma c ON c.id = v.cronograma_id
       WHERE v.id = $1`,
      [versionId],
    );
    if (!meta.rows[0]) throw new NotFoundException('Versión inexistente');
    const info = meta.rows[0];

    const datos = await this.db.query<Fila>(
      `SELECT d.fecha_operativa::text AS fecha_operativa,
              d.tipo_dia::text AS tipo_dia,
              d.turno::text AS turno,
              d.codigo,
              m.numero AS movil,
              p.codigo AS posicion_codigo,
              COALESCE(ia.id, it.id)::text AS inspector_id,
              COALESCE(ia.nombre_completo, it.nombre_completo) AS inspector,
              COALESCE(ia.seccion, it.seccion) AS seccion,
              lic.licencia_codigo
       FROM seguridad_vial.dia_cronograma d
       JOIN seguridad_vial.posicion_cuadratura p ON p.id = d.posicion_id
       LEFT JOIN seguridad_vial.movil m ON m.id = d.movil_id
       LEFT JOIN seguridad_vial.inspector it ON it.id = d.inspector_titular_id
       LEFT JOIN seguridad_vial.inspector ia ON ia.id = d.inspector_asignado_id
       LEFT JOIN LATERAL (
         SELECT cl.codigo AS licencia_codigo
         FROM seguridad_vial.asignacion_operativa ao
         JOIN seguridad_vial.catalogo_licencia cl ON cl.id = ao.catalogo_licencia_id
         WHERE ao.estado = 'ACTIVA'
           AND ao.tipo = 'LICENCIA'
           AND ao.tipo_dia = 'LICENCIA'
           AND ao.inspector_id = COALESCE(ia.id, it.id)
           AND d.fecha_operativa >= ao.fecha_desde
           AND (ao.fecha_hasta IS NULL OR d.fecha_operativa <= ao.fecha_hasta)
         ORDER BY ao.creada_en DESC
         LIMIT 1
       ) lic ON true
       WHERE d.version_id = $1
         AND COALESCE(ia.id, it.id) IS NOT NULL
         AND COALESCE(ia.estado, it.estado) = 'ACTIVO'
         AND COALESCE(ia.tipo_plantel, it.tipo_plantel) <> 'PEAJISTA'
       ORDER BY d.fecha_operativa`,
      [versionId],
    );

    const cruza = Boolean(
      filtros.codigos.length || filtros.moviles.length || filtros.turnos.length,
    );
    const enPeriodo = datos.rows.filter((f) =>
      enRango(f.fecha_operativa, filtros.from, filtros.to),
    );
    const delInspector = enPeriodo.filter(
      (f) =>
        !filtros.inspectores.length ||
        (f.inspector_id != null && filtros.inspectores.includes(f.inspector_id)),
    );
    const delSeccion = delInspector.filter(
      (f) =>
        !filtros.secciones.length ||
        (f.seccion != null && filtros.secciones.includes(f.seccion)),
    );
    const filas = delSeccion.filter((f) => !cruza || celdaPasa(f, filtros));
    const fechas = [...new Set(enPeriodo.map((f) => f.fecha_operativa))].sort();
    const personasMap = new Map<string, { nombre: string; seccion: string }>();
    for (const f of filas) {
      if (!f.inspector || personasMap.has(f.inspector)) continue;
      personasMap.set(f.inspector, {
        nombre: f.inspector,
        seccion: etiquetaSeccionXls(f.seccion),
      });
    }
    const personas = [...personasMap.values()].sort(
      (a, b) =>
        a.seccion.localeCompare(b.seccion, 'es') || a.nombre.localeCompare(b.nombre, 'es'),
    );
    const conSeccion = filtros.secciones.length > 1;

    const porCelda = new Map<string, Fila>();
    for (const f of filas) {
      porCelda.set(`${f.inspector}|${f.fecha_operativa}`, f);
    }

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Cuadratura - Seguridad Vial';
    wb.created = new Date();

    if (pack !== 'planillas') {
      this.hojaCuadratura(
        wb,
        info,
        fechas,
        personas,
        porCelda,
        etiquetaFiltros(filtros),
        conSeccion,
      );
    }
    if (pack !== 'cuadratura') {
      for (const [clave, nombre] of TURNOS) {
        this.hojaPorMovil(wb, info, fechas, filas, clave, nombre);
      }
    }
    if (pack === 'todo') {
      this.hojaOcupacion(wb, fechas, filas);
    }

    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    const capa = info.capa === 'REAL' ? 'REAL' : 'IDEAL';
    const periodo = `${info.periodo_desde.slice(0, 7).replace('-', '')}_${info.periodo_hasta.slice(0, 7).replace('-', '')}`;
    const prefijo =
      pack === 'planillas' ? 'Planillas' : pack === 'cuadratura' ? 'Cuadratura' : 'Cuadratura';
    const fileName = `${prefijo}_${capa}_${periodo}.xlsx`;
    return { buffer, fileName };
  }

  // ---------------------------------------------------------------- hoja 1
  private hojaCuadratura(
    wb: ExcelJS.Workbook,
    info: { capa: string; periodo_desde: string; periodo_hasta: string },
    fechas: string[],
    personas: Array<{ nombre: string; seccion: string }>,
    porCelda: Map<string, Fila>,
    extraA2 = '',
    conSeccion = false,
  ) {
    const dia0 = conSeccion ? 3 : 2;
    const ws = wb.addWorksheet('Cuadratura', {
      views: [{ state: 'frozen', xSplit: conSeccion ? 2 : 1, ySplit: 5 }],
    });

    ws.getCell('A1').value = 'Seguridad Vial y Tránsito — Cuadratura';
    ws.getCell('A1').font = { bold: true, size: 14, color: { argb: `FF${COLOR.HDR}` } };
    ws.getCell('A2').value =
      `Capa ${info.capa} · ${info.periodo_desde} al ${info.periodo_hasta} · ` +
      `${personas.length} inspectores${extraA2}`;
    ws.getCell('A2').font = { italic: true, size: 10 };

    ws.getColumn(1).width = 22;
    if (conSeccion) ws.getColumn(2).width = 16;

    if (!fechas.length) {
      ws.getCell('A3').value = 'Nadie coincide con el período o los filtros.';
      return;
    }

    let inicioMes = dia0;
    let mesActual = '';
    fechas.forEach((f, i) => {
      const etiqueta = `${MESES[Number(f.slice(5, 7))]} ${f.slice(0, 4)}`;
      const col = dia0 + i;
      if (mesActual && etiqueta !== mesActual) {
        if (col - 1 > inicioMes) ws.mergeCells(4, inicioMes, 4, col - 1);
        const c = ws.getCell(4, inicioMes);
        c.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
        c.fill = relleno('13131F');
        c.alignment = { horizontal: 'center' };
        inicioMes = col;
      }
      if (etiqueta !== mesActual) ws.getCell(4, inicioMes).value = etiqueta;
      mesActual = etiqueta;
    });
    const ultimaFechaCol = dia0 - 1 + fechas.length;
    if (ultimaFechaCol > inicioMes) ws.mergeCells(4, inicioMes, 4, ultimaFechaCol);
    const ultimoMes = ws.getCell(4, inicioMes);
    ultimoMes.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
    ultimoMes.fill = relleno('13131F');
    ultimoMes.alignment = { horizontal: 'center' };

    const pintarEnc = (col: number, texto: string) => {
      const c = ws.getCell(5, col);
      c.value = texto;
      c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      c.fill = relleno(COLOR.HDR);
    };
    pintarEnc(1, 'INSPECTOR');
    if (conSeccion) pintarEnc(2, 'SECCIÓN');
    fechas.forEach((f, i) => {
      const c = ws.getCell(5, dia0 + i);
      c.value = ddmm(f);
      c.font = { bold: true, size: 7, color: { argb: 'FFFFFFFF' } };
      c.fill = relleno(COLOR.HDR);
      c.alignment = { horizontal: 'center' };
      c.border = BORDE;
      ws.getColumn(dia0 + i).width = 5.5;
    });

    personas.forEach((persona, r) => {
      const fila = 6 + r;
      ws.getCell(fila, 1).value = persona.nombre;
      ws.getCell(fila, 1).font = { size: 9 };
      if (conSeccion) {
        ws.getCell(fila, 2).value = persona.seccion;
        ws.getCell(fila, 2).font = { size: 9 };
      }
      fechas.forEach((f, i) => {
        const dato = porCelda.get(`${persona.nombre}|${f}`);
        const codigo = dato?.codigo ?? '';
        const c = ws.getCell(fila, dia0 + i);
        c.value = codigo;
        c.alignment = { horizontal: 'center' };
        c.border = BORDE;
        const clave = codigo.length > 1 && codigo[1] >= '0' && codigo[1] <= '9'
          ? codigo[0]
          : codigo;
        const bg = (COLOR as Record<string, string>)[clave];
        if (bg) {
          c.fill = relleno(bg);
          c.font = { size: 8, bold: codigo !== 'F', color: { argb: `FF${TEXTO[clave] ?? '000000'}` } };
        } else {
          c.font = { size: 8 };
        }
      });
    });
  }

  // ---------------------------------------------------------------- hojas 2-4
  private hojaPorMovil(
    wb: ExcelJS.Workbook,
    info: { periodo_desde: string; periodo_hasta: string },
    fechas: string[],
    filas: Fila[],
    turno: string,
    nombreTurno: string,
  ) {
    const ws = wb.addWorksheet(`Móviles - Turno ${turno}`);
    ws.getColumn(1).width = 7;

    const mesEtiqueta = `${MESES[Number(info.periodo_desde.slice(5, 7))].toUpperCase()} ${info.periodo_desde.slice(0, 4)}`;
    ws.getCell('A3').value = `TURNO ${nombreTurno.toUpperCase()} MOVILES DE TySV - ${mesEtiqueta}`;
    ws.getCell('A3').font = { bold: true, size: 12 };
    ws.getCell('A4').value = 'HORARIO DEL TURNO:';
    ws.getCell('A4').font = { bold: true };
    ws.getCell('D4').value = HORARIOS[turno][0];
    ws.getCell('D5').value = HORARIOS[turno][1];

    // móvil × fecha → nombres
    const grilla = new Map<string, string[]>();
    for (const f of filas) {
      if (f.tipo_dia !== 'TRABAJO' || f.turno !== turno || f.movil === null) continue;
      const k = `${f.movil}|${f.fecha_operativa}`;
      const lista = grilla.get(k) ?? [];
      if (f.inspector) lista.push(f.inspector);
      grilla.set(k, lista);
    }
    const moviles = [...new Set(filas.map((f) => f.movil).filter((m): m is number => m !== null))].sort();

    let fila = 7;
    for (let i = 0; i < fechas.length; i += DIAS_POR_BLOQUE) {
      const tramo = fechas.slice(i, i + DIAS_POR_BLOQUE);

      ws.getCell(fila, 1).value = 'Día';
      ws.getCell(fila, 1).font = { bold: true };
      ws.getCell(fila + 1, 1).value = 'Móvil';
      ws.getCell(fila + 1, 1).font = { bold: true };

      tramo.forEach((f, j) => {
        const dia = new Date(`${f}T12:00:00Z`).getUTCDay();
        const c1 = ws.getCell(fila, 2 + j);
        c1.value = DIAS[dia];
        c1.font = { bold: true, size: 8, color: { argb: 'FFFFFFFF' } };
        c1.fill = relleno(COLOR.HDR);
        c1.alignment = { horizontal: 'center' };
        c1.border = BORDE;

        const c2 = ws.getCell(fila + 1, 2 + j);
        c2.value = ddmm(f);
        c2.font = { bold: true, size: 8, color: { argb: 'FFFFFFFF' } };
        c2.fill = relleno(COLOR.HDR);
        c2.alignment = { horizontal: 'center' };
        c2.border = BORDE;
        ws.getColumn(2 + j).width = 14;
      });

      let r = fila + 2;
      for (const movil of moviles) {
        ws.getCell(r, 1).value = movil;
        ws.getCell(r, 1).font = { bold: true, size: 10 };
        ws.getCell(r, 1).alignment = { horizontal: 'center', vertical: 'middle' };
        ws.mergeCells(r, 1, r + 1, 1);

        tramo.forEach((f, j) => {
          const nombres = (grilla.get(`${movil}|${f}`) ?? []).sort((a, b) =>
            a.localeCompare(b, 'es'),
          );
          const c1 = ws.getCell(r, 2 + j);
          const c2 = ws.getCell(r + 1, 2 + j);
          c1.value = nombres[0] ?? '';
          c2.value = nombres.slice(1).join(', ');
          for (const c of [c1, c2]) {
            c.alignment = { horizontal: 'center', vertical: 'middle' };
            c.font = { size: 8 };
            c.border = BORDE;
            if (c.value) c.fill = relleno((COLOR as Record<string, string>)[turno]);
          }
        });
        r += 2;
      }
      fila = r + 1;
    }
  }

  // ---------------------------------------------------------------- hoja 5
  private hojaOcupacion(wb: ExcelJS.Workbook, fechas: string[], filas: Fila[]) {
    const ws = wb.addWorksheet('Ocupación', {
      views: [{ state: 'frozen', xSplit: 2, ySplit: 4 }],
    });

    ws.getCell('A1').value = 'Ocupación: inspectores por móvil y turno';
    ws.getCell('A1').font = { bold: true, size: 13, color: { argb: `FF${COLOR.HDR}` } };
    ws.getCell('A2').value =
      'Verde = 1 (ideal) · Amarillo = 2 (normal) · Rojo = 3 o más · Gris = sin cobertura';
    ws.getCell('A2').font = { italic: true, size: 9 };

    ws.getColumn(1).width = 8;
    ws.getColumn(2).width = 11;
    for (const [col, texto] of [[1, 'MÓVIL'], [2, 'TURNO']] as Array<[number, string]>) {
      const c = ws.getCell(4, col);
      c.value = texto;
      c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      c.fill = relleno(COLOR.HDR);
      c.alignment = { horizontal: 'center' };
    }
    fechas.forEach((f, i) => {
      const c = ws.getCell(4, 3 + i);
      c.value = ddmm(f);
      c.font = { bold: true, size: 7, color: { argb: 'FFFFFFFF' } };
      c.fill = relleno(COLOR.HDR);
      c.alignment = { horizontal: 'center' };
      ws.getColumn(3 + i).width = 5;
    });

    const conteo = new Map<string, number>();
    for (const f of filas) {
      if (f.tipo_dia !== 'TRABAJO' || f.movil === null || !f.turno) continue;
      const k = `${f.movil}|${f.turno}|${f.fecha_operativa}`;
      conteo.set(k, (conteo.get(k) ?? 0) + 1);
    }
    const moviles = [...new Set(filas.map((f) => f.movil).filter((m): m is number => m !== null))].sort();

    let r = 5;
    for (const movil of moviles) {
      for (const [clave, nombre] of TURNOS) {
        ws.getCell(r, 1).value = movil;
        ws.getCell(r, 1).alignment = { horizontal: 'center' };
        ws.getCell(r, 2).value = nombre;
        ws.getCell(r, 2).font = { size: 9 };
        fechas.forEach((f, i) => {
          const n = conteo.get(`${movil}|${clave}|${f}`) ?? 0;
          const c = ws.getCell(r, 3 + i);
          c.value = n;
          c.alignment = { horizontal: 'center' };
          c.border = BORDE;
          c.font = { size: 8, bold: n >= 3, color: { argb: n >= 3 ? 'FF9C0006' : 'FF000000' } };
          c.fill = relleno(
            n === 0 ? 'D9D9D9' : n === 1 ? 'C6EFCE' : n === 2 ? 'FFEB9C' : 'FFC7CE',
          );
        });
        r += 1;
      }
      r += 1;
    }

    // resumen
    ws.getCell(r, 2).value = 'Trabajando';
    ws.getCell(r, 2).font = { bold: true, size: 9 };
    fechas.forEach((f, i) => {
      const n = filas.filter(
        (x) => x.fecha_operativa === f && x.tipo_dia === 'TRABAJO',
      ).length;
      const c = ws.getCell(r, 3 + i);
      c.value = n;
      c.alignment = { horizontal: 'center' };
      c.font = { size: 8, bold: true };
      c.border = BORDE;
    });
  }

  async timer(
    from: string,
    to: string,
    filas: Array<{
      fecha: string;
      legajo: string;
      persona: string;
      origen: string;
      ideal: string;
      real: string;
      motivo: string;
      observacion: string;
    }>,
  ): Promise<{ buffer: Buffer; fileName: string }> {
    const catalogo = await this.db.query<CodigoCat>(
      `SELECT DISTINCT ON (upper(btrim(codigo)))
              codigo, codigo_sap, nombre, horario, color_fondo, color_letra
       FROM seguridad_vial.catalogo_licencia
       WHERE activo = true
       ORDER BY upper(btrim(codigo)),
                CASE WHEN ambito = 'SEGURIDAD_VIAL' THEN 0 ELSE 1 END,
                orden`,
    );
    const mapa = new Map<string, CodigoCat>();
    for (const r of catalogo.rows) {
      const key = (r.codigo || '').trim().toUpperCase();
      if (key) mapa.set(key, r);
    }
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Cuadratura - Seguridad Vial';
    wb.created = new Date();
    const ws = wb.addWorksheet('Timer', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });
    const headers = [
      'Fecha',
      'Legajo',
      'Persona',
      'Origen',
      'Ideal',
      'Real',
      'Motivo',
      'Observación',
    ];
    ws.columns = [
      { width: 12 },
      { width: 12 },
      { width: 28 },
      { width: 14 },
      { width: 36 },
      { width: 36 },
      { width: 32 },
      { width: 36 },
    ];
    const head = ws.addRow(headers);
    head.font = { bold: true, size: 10 };
    head.eachCell((c) => {
      c.fill = relleno('1F5A2A');
      c.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
      c.border = BORDE;
    });
    const ordenadas = [...filas].sort((a, b) => {
      const f = a.fecha.localeCompare(b.fecha);
      if (f) return f;
      return a.persona.localeCompare(b.persona, 'es');
    });
    for (const f of ordenadas) {
      const agregada = f.origen === 'extra';
      const row = ws.addRow([
        ddmm(f.fecha.length >= 10 ? f.fecha.slice(0, 10) : f.fecha),
        f.legajo || '',
        f.persona || '',
        agregada ? 'Agregada' : 'Cambio',
        textoTimerCodigo(f.ideal, mapa),
        textoTimerCodigo(f.real, mapa),
        f.motivo || '',
        f.observacion || '',
      ]);
      row.height = 28;
      row.eachCell((c) => {
        c.border = BORDE;
        c.font = { size: 10 };
        c.alignment = { vertical: 'middle', wrapText: true };
      });
      row.getCell(2).numFmt = '@';
      pintarCodigo(row.getCell(5), f.ideal, mapa);
      pintarCodigo(row.getCell(6), f.real, mapa);
      if (agregada) {
        row.getCell(4).fill = relleno('D9EAD3');
      }
    }
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    const periodo = `${from.slice(0, 10).replace(/-/g, '')}_${to.slice(0, 10).replace(/-/g, '')}`;
    return { buffer, fileName: `Timer_REAL_${periodo}.xlsx` };
  }

  async tabla(input: {
    fileName: string;
    sheets: Array<{
      name: string;
      headers: string[];
      rows: Array<Array<string | number | null>>;
    }>;
  }): Promise<{ buffer: Buffer; fileName: string }> {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Cuadratura - Seguridad Vial';
    wb.created = new Date();
    for (const hoja of input.sheets.slice(0, 4)) {
      const ws = wb.addWorksheet((hoja.name || 'Hoja').slice(0, 31), {
        views: [{ state: 'frozen', ySplit: 1 }],
      });
      const headers = hoja.headers.slice(0, 40);
      ws.columns = headers.map((h) => ({
        width: Math.min(42, Math.max(12, String(h).length + 4)),
      }));
      const head = ws.addRow(headers);
      head.eachCell((c) => {
        c.fill = relleno('1F5A2A');
        c.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
        c.border = BORDE;
      });
      for (const fila of hoja.rows.slice(0, 5000)) {
        const row = ws.addRow(fila.slice(0, headers.length));
        row.eachCell((c) => {
          c.border = BORDE;
          c.font = { size: 10 };
          c.alignment = { vertical: 'middle', wrapText: true };
        });
      }
    }
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    const bruto = (input.fileName || 'Export').replace(/[^\w.\-áéíóúñÁÉÍÓÚÑ ]+/gi, '_');
    const fileName = bruto.toLowerCase().endsWith('.xlsx') ? bruto : `${bruto}.xlsx`;
    return { buffer, fileName };
  }
}
