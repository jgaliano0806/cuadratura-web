import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { parseExcel } from './excel/excel-parser';
import { previewToApi } from './excel/models';
import { InitializationRepository } from './initialization.repository';

function mapDbError(error: unknown): never {
  const err = error as { message?: string; code?: string; detail?: string };
  const message = [err.message, err.detail].filter(Boolean).join(' — ');
  if (
    err.code &&
    ['23505', '23503', '23514', 'P0001', '42804'].includes(err.code)
  ) {
    throw new BadRequestException(
      message || 'Error de validación en base de datos',
    );
  }
  throw new InternalServerErrorException(
    message || 'Error interno al procesar la inicialización',
  );
}

@Injectable()
export class InitializationService {
  constructor(private readonly repo: InitializationRepository) {}

  private async persistUpload(buffer: Buffer, originalName: string) {
    const dir = path.join(process.cwd(), 'uploads');
    await mkdir(dir, { recursive: true });
    const ext = path.extname(originalName) || '.xlsx';
    const filePath = path.join(dir, `${randomUUID()}${ext}`);
    await writeFile(filePath, buffer);
    return filePath;
  }

  async preview(buffer: Buffer, originalName: string) {
    const filePath = await this.persistUpload(buffer, originalName);
    try {
      const preview = await parseExcel(filePath);
      return previewToApi(preview);
    } finally {
      await unlink(filePath).catch(() => undefined);
    }
  }

  async stage(buffer: Buffer, originalName: string, userId: string) {
    const filePath = await this.persistUpload(buffer, originalName);
    try {
      const preview = await parseExcel(filePath);
      const initializationId = await this.repo.stage(preview, userId);
      return {
        initialization_id: initializationId,
        valid: preview.isValid,
        issues: preview.issues,
      };
    } catch (error) {
      mapDbError(error);
    } finally {
      await unlink(filePath).catch(() => undefined);
    }
  }

  async confirm(id: string, userId: string) {
    try {
      await this.repo.confirm(id, userId);
      return { status: 'CONFIRMADA' };
    } catch (error) {
      mapDbError(error);
    }
  }

  async revert(id: string, userId: string, reason: string) {
    if (!reason?.trim()) {
      throw new BadRequestException('Se requiere motivo de reversión');
    }
    try {
      await this.repo.revert(id, userId, reason);
      return { status: 'REVERTIDA' };
    } catch (error) {
      mapDbError(error);
    }
  }

  status() {
    return this.repo.status();
  }
}
