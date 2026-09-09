import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import { tap } from 'rxjs';
import { AuditService } from './audit.service';

const SKIP = [
  /^\/health/,
  /^\/auth\/me$/,
  /^\/auth\/login$/,
  /^\/auth\/password$/,
  /^\/auth\/password-reset$/,
  /^\/schedule-engine\/ocupacion/,
  /^\/schedule-engine\/preview/,
  /^\/schedule-engine\/desdobles/,
  /^\/audit/,
];

const ETIQUETAS: Array<[RegExp, { entidad: string; accion: string; motivo: string }]> = [
  [/^PATCH \/auth\/password$/, { entidad: 'sesion', accion: 'CLAVE', motivo: 'Cambió su contraseña' }],
  [/^POST \/admin\/users$/, { entidad: 'usuario', accion: 'ALTA', motivo: 'Incorporó un usuario' }],
  [/^PATCH \/admin\/users\/[^/]+\/password$/, { entidad: 'usuario', accion: 'CLAVE', motivo: 'Reseteó una contraseña' }],
  [/^PATCH \/admin\/users\//, { entidad: 'usuario', accion: 'EDICION', motivo: 'Modificó un usuario' }],
  [/^DELETE \/admin\/users\//, { entidad: 'usuario', accion: 'BAJA', motivo: 'Borró un usuario' }],
  [/^POST \/admin\/inspectors$/, { entidad: 'persona', accion: 'ALTA', motivo: 'Incorporó una persona' }],
  [/^PATCH \/admin\/inspectors\//, { entidad: 'persona', accion: 'EDICION', motivo: 'Modificó una persona' }],
  [/^DELETE \/admin\/inspectors\//, { entidad: 'persona', accion: 'BAJA', motivo: 'Desactivó una persona' }],
  [/^POST \/admin\/mobiles$/, { entidad: 'movil', accion: 'ALTA', motivo: 'Incorporó un móvil' }],
  [/^PATCH \/admin\/mobiles\//, { entidad: 'movil', accion: 'EDICION', motivo: 'Modificó un móvil' }],
  [/^DELETE \/admin\/mobiles\//, { entidad: 'movil', accion: 'BAJA', motivo: 'Desactivó un móvil' }],
  [/^POST \/admin\/licencias$/, { entidad: 'licencia', accion: 'ALTA', motivo: 'Agregó un código de cuadratura' }],
  [/^PATCH \/admin\/licencias\//, { entidad: 'licencia', accion: 'EDICION', motivo: 'Modificó un código de cuadratura' }],
  [/^DELETE \/admin\/licencias\//, { entidad: 'licencia', accion: 'BAJA', motivo: 'Borró un código de cuadratura' }],
  [/^POST \/admin\/timer-motivos$/, { entidad: 'motivo', accion: 'ALTA', motivo: 'Agregó un motivo del Timer' }],
  [/^PATCH \/admin\/timer-motivos\//, { entidad: 'motivo', accion: 'EDICION', motivo: 'Modificó un motivo del Timer' }],
  [/^DELETE \/admin\/timer-motivos\//, { entidad: 'motivo', accion: 'BAJA', motivo: 'Borró un motivo del Timer' }],
  [/^POST \/admin\/positions$/, { entidad: 'posicion', accion: 'ALTA', motivo: 'Agregó una posición' }],
  [/^POST \/schedule-engine\/apply-real$/, { entidad: 'cuadratura', accion: 'REAL', motivo: 'Actualizó la cuadratura Real' }],
  [/^POST \/schedule-engine\/apply$/, { entidad: 'cuadratura', accion: 'IDEAL', motivo: 'Generó la cuadratura Ideal' }],
  [/^POST \/schedule-engine\/wipe-planificada$/, { entidad: 'cuadratura', accion: 'WIPE', motivo: 'Vació la cuadratura Ideal' }],
  [/^POST \/schedule-engine\/swap$/, { entidad: 'cuadratura', accion: 'ENROQUE', motivo: 'Enrocó a dos personas' }],
  [/^POST \/schedule-engine\/linked-pair\/swap$/, { entidad: 'cuadratura', accion: 'ENROQUE', motivo: 'Enrocó una pareja vinculada' }],
  [/^POST \/schedule-engine\/assignment$/, { entidad: 'cuadratura', accion: 'ASIGNACION', motivo: 'Cambió el turno o el móvil' }],
  [/^POST \/schedule-engine\/absence$/, { entidad: 'cuadratura', accion: 'AUSENCIA', motivo: 'Cargó una ausencia' }],
  [/^POST \/schedule-engine\/clear-range$/, { entidad: 'cuadratura', accion: 'REVERTIR', motivo: 'Volvió días a la cuadratura Ideal' }],
  [/^POST \/operations\/timer-guardados$/, { entidad: 'timer', accion: 'GUARDAR', motivo: 'Guardó el Timer' }],
  [/^POST \/operations\/timer-extras$/, { entidad: 'timer', accion: 'ALTA', motivo: 'Agregó una novedad al Timer' }],
  [/^PATCH \/operations\/timer-extras\//, { entidad: 'timer', accion: 'EDICION', motivo: 'Editó una novedad del Timer' }],
  [/^DELETE \/operations\/timer-extras\//, { entidad: 'timer', accion: 'BAJA', motivo: 'Borró una novedad del Timer' }],
  [/^POST \/vacations$/, { entidad: 'vacacion', accion: 'ALTA', motivo: 'Cargó vacaciones' }],
  [/^POST \/planning\/[^/]+\/submit$/, { entidad: 'version', accion: 'ENVIAR', motivo: 'Envió una versión a revisión' }],
  [/^POST \/planning\/[^/]+\/observe$/, { entidad: 'version', accion: 'OBSERVAR', motivo: 'Observó una versión' }],
  [/^POST \/planning\/[^/]+\/reopen$/, { entidad: 'version', accion: 'REABRIR', motivo: 'Reabrió una versión' }],
  [/^POST \/planning\/[^/]+\/approve-and-publish$/, { entidad: 'version', accion: 'PUBLICAR', motivo: 'Aprobó y publicó el cronograma' }],
  [/^POST \/planning\/[^/]+\/close$/, { entidad: 'version', accion: 'CERRAR', motivo: 'Cerró un período' }],
  [/^GET \/exports\//, { entidad: 'export', accion: 'EXCEL', motivo: 'Descargó Excel de cuadratura' }],
  [/^POST \/exports\/timer/, { entidad: 'export', accion: 'EXCEL', motivo: 'Descargó Excel del Timer' }],
  [/^POST \/exports\/tabla/, { entidad: 'export', accion: 'EXCEL', motivo: 'Descargó una planilla' }],
];

@Injectable()
export class ActivityInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    const req = context.switchToHttp().getRequest<
      Request & { user?: { userId?: string } }
    >();
    const method = (req.method || 'GET').toUpperCase();
    const path = (req.path || req.url || '').split('?')[0];
    if (method === 'GET' && !path.startsWith('/exports/')) {
      return next.handle();
    }
    const clave = `${method} ${path}`;
    if (SKIP.some((re) => re.test(path))) return next.handle();

    const etiqueta =
      ETIQUETAS.find(([re]) => re.test(clave))?.[1] ??
      (method === 'GET'
        ? null
        : {
            entidad: path.split('/').filter(Boolean)[0] || 'app',
            accion: method.slice(0, 30),
            motivo: `${method} ${path}`,
          });
    if (!etiqueta) return next.handle();

    const usuarioId = req.user?.userId ?? null;
    const ip = clientIp(req);
    const entidadId =
      typeof req.params?.id === 'string' ? req.params.id : null;

    return next.handle().pipe(
      tap({
        next: () => {
          void this.audit
            .registrar({
              usuarioId,
              entidad: etiqueta.entidad,
              entidadId,
              accion: etiqueta.accion,
              motivo: etiqueta.motivo,
              ip,
              metadata: {
                method,
                path,
                body: this.audit.sanitizar(req.body ?? {}),
              },
            })
            .catch(() => undefined);
        },
      }),
    );
  }
}

function clientIp(req: Request): string | null {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.trim()) return fwd.split(',')[0].trim();
  return req.ip || req.socket?.remoteAddress || null;
}
