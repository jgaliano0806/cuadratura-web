import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

export type RegistroAccion = {
  usuarioId?: string | null;
  entidad: string;
  entidadId?: string | null;
  accion: string;
  motivo: string;
  ip?: string | null;
  metadata?: Record<string, unknown>;
};

const SECRET_KEYS = new Set([
  'password',
  'password2',
  'actual',
  'hash',
  'hash_clave',
  'clave',
  'clave_inicial',
]);

const DETALLE_CLARO: Record<string, string> = {
  'Materialización REAL con overlays operativos': 'Actualizó la cuadratura Real',
  'Proyección motor de cuadratura': 'Generó la cuadratura Ideal',
  'Aplicó cambios en Real': 'Actualizó la cuadratura Real',
  'Generó / aplicó Ideal': 'Generó la cuadratura Ideal',
  'Vació la capa Ideal': 'Vació la cuadratura Ideal',
  'Alta de móvil': 'Incorporó un móvil',
  'Alta de código': 'Agregó un código de cuadratura',
  'Alta de motivo Timer': 'Agregó un motivo del Timer',
  'Alta de posición': 'Agregó una posición',
  'Modificó un motivo Timer': 'Modificó un motivo del Timer',
  'Borró un motivo Timer': 'Borró un motivo del Timer',
  'Enrocó inspectores': 'Enrocó a dos personas',
  'Enrocó pareja vinculada': 'Enrocó una pareja vinculada',
  'Cambió turno o móvil': 'Cambió el turno o el móvil',
  'Volvió días a Ideal': 'Volvió días a la cuadratura Ideal',
  'Asignación trabajos a demanda': 'Asignó trabajos a demanda',
  'Envío a revisión': 'Envió una versión a revisión',
  'Reapertura de versión observada': 'Reabrió una versión',
  'Aprobar y publicar': 'Aprobó y publicó el cronograma',
  'Cierre de período': 'Cerró el período',
};

function detalleClaro(motivo: string | null, accion: string | null): string {
  const m = (motivo || '').trim();
  if (!m) return accion || 'Hizo un cambio';
  if (DETALLE_CLARO[m]) return DETALLE_CLARO[m];
  if (m.startsWith('Tabula rasa PLANIFICADA:')) {
    const extra = m.slice('Tabula rasa PLANIFICADA:'.length).trim();
    return extra ? `Vació la cuadratura Ideal (${extra})` : 'Vació la cuadratura Ideal';
  }
  if (/^(GET|POST|PATCH|PUT|DELETE) \//i.test(m)) return 'Hizo un cambio en el sistema';
  return m;
}

function nombreActor(row: {
  apellido: string | null;
  nombres: string | null;
  nombre_mostrar: string | null;
  nombre_usuario: string | null;
}): string {
  const ape = (row.apellido || '').trim();
  const nom = (row.nombres || '').trim();
  if (ape && nom) return `${ape}, ${nom}`;
  if (ape) return ape;
  const mostrar = (row.nombre_mostrar || '').trim();
  if (mostrar === 'Administración Seguridad Vial' || mostrar === 'Administracion de Seguridad Vial') {
    return 'Administrador del sistema';
  }
  return mostrar || row.nombre_usuario || 'Sistema';
}

@Injectable()
export class AuditService {
  constructor(private readonly db: DatabaseService) {}

  async list(limit = 80) {
    const result = await this.db.query<{
      id: string;
      ocurrido_en: Date;
      apellido: string | null;
      nombres: string | null;
      nombre_mostrar: string | null;
      nombre_usuario: string | null;
      detalle: string;
      entidad: string;
      accion: string;
    }>(
      `SELECT a.id::text,
              a.ocurrido_en,
              u.apellido,
              u.nombres,
              u.nombre_mostrar,
              u.nombre_usuario,
              coalesce(a.motivo, a.accion) AS detalle,
              a.entidad,
              a.accion
       FROM seguridad_vial.evento_auditoria a
       LEFT JOIN seguridad_vial.usuario u ON u.id = a.usuario_id
       WHERE a.accion NOT IN ('INSERT', 'UPDATE', 'DELETE')
       ORDER BY a.ocurrido_en DESC
       LIMIT $1`,
      [Math.min(Math.max(limit, 1), 300)],
    );
    return result.rows.map((row) => ({
      id: row.id,
      ocurrido_en: row.ocurrido_en,
      usuario: nombreActor(row),
      detalle: detalleClaro(row.detalle, row.accion),
      entidad: row.entidad,
      accion: row.accion,
    }));
  }

  async registrar(input: RegistroAccion) {
    const ip = this.ipValida(input.ip);
    await this.db.query(
      `INSERT INTO seguridad_vial.evento_auditoria (
         usuario_id, entidad, entidad_id, accion, motivo, ip, metadata
       ) VALUES ($1, $2, $3, $4, $5, $6::inet, $7::jsonb)`,
      [
        input.usuarioId || null,
        input.entidad,
        input.entidadId || null,
        input.accion.slice(0, 30),
        input.motivo,
        ip,
        JSON.stringify(this.sanitizar(input.metadata ?? {})),
      ],
    );
  }

  sanitizar(value: unknown): unknown {
    if (Array.isArray(value)) return value.map((v) => this.sanitizar(v));
    if (!value || typeof value !== 'object') return value;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEYS.has(k.toLowerCase())) {
        out[k] = '[oculto]';
        continue;
      }
      out[k] = this.sanitizar(v);
    }
    return out;
  }

  private ipValida(ip?: string | null): string | null {
    const t = ip?.trim() ?? '';
    if (!t || t === '::1' || t === '127.0.0.1') return t || null;
    if (/^[\d.:a-fA-F]+$/.test(t)) return t.slice(0, 64);
    return null;
  }
}
