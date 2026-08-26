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
  inspector: string | null;
};

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
              COALESCE(ia.nombre_completo, it.nombre_completo) AS inspector
       FROM seguridad_vial.dia_cronograma d
       JOIN seguridad_vial.posicion_cuadratura p ON p.id = d.posicion_id
       LEFT JOIN seguridad_vial.movil m ON m.id = d.movil_id
       LEFT JOIN seguridad_vial.inspector it ON it.id = d.inspector_titular_id
       LEFT JOIN seguridad_vial.inspector ia ON ia.id = d.inspector_asignado_id
       WHERE d.version_id = $1
         AND COALESCE(ia.id, it.id) IS NOT NULL
         AND COALESCE(ia.estado, it.estado) = 'ACTIVO'
         AND COALESCE(ia.tipo_plantel, it.tipo_plantel) <> 'PEAJISTA'
       ORDER BY d.fecha_operativa`,
      [versionId],
    );

    const filas = datos.rows;
    const fechas = [...new Set(filas.map((f) => f.fecha_operativa))].sort();
    const inspectores = [
      ...new Set(filas.map((f) => f.inspector).filter((n): n is string => Boolean(n))),
    ].sort((a, b) => a.localeCompare(b, 'es'));

    // índice inspector|fecha → código
    const porCelda = new Map<string, Fila>();
    for (const f of filas) {
      porCelda.set(`${f.inspector}|${f.fecha_operativa}`, f);
    }

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Cuadratura - Seguridad Vial';
    wb.created = new Date();

    if (pack !== 'planillas') {
      this.hojaCuadratura(wb, info, fechas, inspectores, porCelda);
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
    inspectores: string[],
    porCelda: Map<string, Fila>,
  ) {
    const ws = wb.addWorksheet('Cuadratura', {
      views: [{ state: 'frozen', xSplit: 1, ySplit: 5 }],
    });

    ws.getCell('A1').value = 'Seguridad Vial y Tránsito — Cuadratura';
    ws.getCell('A1').font = { bold: true, size: 14, color: { argb: `FF${COLOR.HDR}` } };
    ws.getCell('A2').value =
      `Capa ${info.capa} · ${info.periodo_desde} al ${info.periodo_hasta} · ` +
      `${inspectores.length} inspectores`;
    ws.getCell('A2').font = { italic: true, size: 10 };

    ws.getColumn(1).width = 22;

    // fila 4: meses agrupados
    let inicioMes = 2;
    let mesActual = '';
    fechas.forEach((f, i) => {
      const etiqueta = `${MESES[Number(f.slice(5, 7))]} ${f.slice(0, 4)}`;
      const col = 2 + i;
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
    if (1 + fechas.length > inicioMes) ws.mergeCells(4, inicioMes, 4, 1 + fechas.length);
    const ultimoMes = ws.getCell(4, inicioMes);
    ultimoMes.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } };
    ultimoMes.fill = relleno('13131F');
    ultimoMes.alignment = { horizontal: 'center' };

    // fila 5: fechas
    const enc = ws.getCell(5, 1);
    enc.value = 'INSPECTOR';
    enc.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    enc.fill = relleno(COLOR.HDR);
    fechas.forEach((f, i) => {
      const c = ws.getCell(5, 2 + i);
      c.value = ddmm(f);
      c.font = { bold: true, size: 7, color: { argb: 'FFFFFFFF' } };
      c.fill = relleno(COLOR.HDR);
      c.alignment = { horizontal: 'center' };
      c.border = BORDE;
      ws.getColumn(2 + i).width = 5.5;
    });

    // filas de inspectores
    inspectores.forEach((nombre, r) => {
      const fila = 6 + r;
      ws.getCell(fila, 1).value = nombre;
      ws.getCell(fila, 1).font = { size: 9 };
      fechas.forEach((f, i) => {
        const dato = porCelda.get(`${nombre}|${f}`);
        const codigo = dato?.codigo ?? '';
        const c = ws.getCell(fila, 2 + i);
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
}
