import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

@Injectable()
export class AdministrationService {
  constructor(private readonly db: DatabaseService) {}

  async overview() {
    const [inspectors, mobiles, positions, versions, users, gaps] =
      await Promise.all([
        this.db.query(
          `SELECT count(*)::int AS n FROM seguridad_vial.inspector WHERE estado = 'ACTIVO'`,
        ),
        this.db.query(
          `SELECT count(*)::int AS n FROM seguridad_vial.movil WHERE estado = 'ACTIVO'`,
        ),
        this.db.query(
          `SELECT count(*)::int AS n FROM seguridad_vial.posicion_cuadratura WHERE estado = 'ACTIVO'`,
        ),
        this.db.query(
          `SELECT count(*)::int AS n FROM seguridad_vial.cronograma_version`,
        ),
        this.db.query(
          `SELECT count(*)::int AS n FROM seguridad_vial.usuario WHERE estado = 'ACTIVO'`,
        ),
        this.db.query(
          `SELECT count(*)::int AS n
           FROM seguridad_vial.cobertura_dia
           WHERE estado = 'HUECO' AND responsable_aceptacion_id IS NULL`,
        ),
      ]);

    return {
      inspectores_activos: inspectors.rows[0].n,
      moviles_activos: mobiles.rows[0].n,
      posiciones_activas: positions.rows[0].n,
      versiones: versions.rows[0].n,
      usuarios_activos: users.rows[0].n,
      huecos_pendientes: gaps.rows[0].n,
    };
  }

  async inspectors() {
    const result = await this.db.query(
      `SELECT i.id,
              i.nombre_completo,
              i.tipo_plantel,
              i.estado,
              a.fecha_desde::text AS vigencia_desde,
              p.codigo AS posicion_codigo,
              CASE
                WHEN p.codigo IS NULL THEN NULL
                WHEN p.tipo = 'MOVIL4' THEN 'Móvil 4 · ' || p.codigo
                WHEN p.tipo = 'MOVIL6' THEN 'Ruta 36 · Móvil 6 · ' || p.codigo
                WHEN p.tipo = 'MOVIL7' THEN 'Ruta 36 · Móvil 7 · ' || p.codigo
                ELSE 'Rotación · ' || p.codigo
              END AS posicion_etiqueta
       FROM seguridad_vial.inspector i
       LEFT JOIN LATERAL (
         SELECT a1.posicion_id, a1.fecha_desde
         FROM seguridad_vial.asignacion_inspector_posicion a1
         WHERE a1.inspector_id = i.id AND current_date <@ a1.vigencia
         ORDER BY a1.fecha_desde DESC LIMIT 1
       ) a ON true
       LEFT JOIN seguridad_vial.posicion_cuadratura p ON p.id = a.posicion_id
       ORDER BY i.nombre_completo`,
    );
    return result.rows;
  }

  async mobiles() {
    const result = await this.db.query(
      `SELECT m.id,
              m.numero,
              m.capacidad_maxima,
              m.estado,
              b.nombre AS base_nombre,
              coalesce(
                string_agg(
                  h.turno || ' ' || to_char(h.hora_inicio, 'HH24:MI'),
                  ' · ' ORDER BY h.turno
                ),
                '—'
              ) AS horarios_texto
       FROM seguridad_vial.movil m
       JOIN seguridad_vial.base_operativa b ON b.id = m.base_operativa_id
       LEFT JOIN seguridad_vial.horario_turno_movil h
         ON h.movil_id = m.id AND current_date <@ h.vigencia
       GROUP BY m.id, b.nombre
       ORDER BY m.numero`,
    );
    return result.rows;
  }

  async positions() {
    const result = await this.db.query(
      `SELECT p.codigo,
              coalesce(i.nombre_completo, 'Sin ocupante') AS ocupante_vigente,
              p.tipo,
              p.estado,
              pr.nombre AS perfil,
              gf.codigo AS grupo_franco,
              CASE
                WHEN g.codigo IS NULL THEN NULL
                ELSE coalesce(g.nombre, g.codigo) ||
                     coalesce(' (' || mg.rol || ')', '')
              END AS grupo_vinculado
       FROM seguridad_vial.posicion_cuadratura p
       LEFT JOIN seguridad_vial.grupo_franco gf ON gf.id = p.grupo_franco_id
       LEFT JOIN seguridad_vial.perfil_rotacion pr ON pr.id = p.perfil_rotacion_id
       LEFT JOIN LATERAL (
         SELECT a1.inspector_id
         FROM seguridad_vial.asignacion_inspector_posicion a1
         WHERE a1.posicion_id = p.id AND current_date <@ a1.vigencia
         ORDER BY a1.fecha_desde DESC LIMIT 1
       ) a ON true
       LEFT JOIN seguridad_vial.inspector i ON i.id = a.inspector_id
       LEFT JOIN seguridad_vial.miembro_grupo_rotacion_vinculada mg ON mg.posicion_id = p.id
       LEFT JOIN seguridad_vial.grupo_rotacion_vinculada g ON g.id = mg.grupo_id
       ORDER BY i.nombre_completo NULLS LAST, p.codigo`,
    );
    return result.rows;
  }

  async profiles() {
    const result = await this.db.query(
      `SELECT pr.codigo,
              pr.nombre,
              pr.tipo,
              pr.estado,
              (
                SELECT coalesce(string_agg(pt.turno, ' → ' ORDER BY pt.orden), '—')
                FROM seguridad_vial.perfil_rotacion_turno pt WHERE pt.perfil_id = pr.id
              ) AS turnos_texto,
              (
                SELECT coalesce(string_agg(m.numero::text, ' → ' ORDER BY pm.orden), '—')
                FROM seguridad_vial.perfil_rotacion_movil pm
                JOIN seguridad_vial.movil m ON m.id = pm.movil_id
                WHERE pm.perfil_id = pr.id
              ) AS moviles_texto
       FROM seguridad_vial.perfil_rotacion pr
       ORDER BY pr.nombre, pr.codigo`,
    );
    return result.rows;
  }

  async users() {
    const result = await this.db.query(
      `SELECT u.id,
              u.nombre_usuario,
              u.nombre_mostrar,
              u.estado,
              coalesce(
                string_agg(r.nombre, ' · ' ORDER BY r.nombre),
                '—'
              ) AS roles_texto
       FROM seguridad_vial.usuario u
       LEFT JOIN seguridad_vial.usuario_rol ur
         ON ur.usuario_id = u.id
        AND (ur.fecha_hasta IS NULL OR ur.fecha_hasta >= current_date)
       LEFT JOIN seguridad_vial.rol r ON r.id = ur.rol_id
       GROUP BY u.id
       ORDER BY u.nombre_mostrar, u.nombre_usuario`,
    );
    return result.rows;
  }

  async linkedGroups() {
    const result = await this.db.query(
      `SELECT g.id,
              coalesce(g.nombre, g.codigo) AS nombre,
              g.estado,
              string_agg(
                coalesce(i.nombre_completo, p.codigo) ||
                CASE WHEN mg.rol IS NOT NULL THEN ' (' || mg.rol || ')' ELSE '' END,
                ' · ' ORDER BY mg.rol
              ) AS miembros_texto
       FROM seguridad_vial.grupo_rotacion_vinculada g
       JOIN seguridad_vial.miembro_grupo_rotacion_vinculada mg ON mg.grupo_id = g.id
       JOIN seguridad_vial.posicion_cuadratura p ON p.id = mg.posicion_id
       LEFT JOIN LATERAL (
         SELECT a1.inspector_id
         FROM seguridad_vial.asignacion_inspector_posicion a1
         WHERE a1.posicion_id = p.id AND current_date <@ a1.vigencia
         ORDER BY a1.fecha_desde DESC LIMIT 1
       ) a ON true
       LEFT JOIN seguridad_vial.inspector i ON i.id = a.inspector_id
       GROUP BY g.id
       ORDER BY coalesce(g.nombre, g.codigo)`,
    );
    return result.rows;
  }
}


