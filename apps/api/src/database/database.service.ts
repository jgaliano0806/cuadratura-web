import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, PoolClient, QueryResultRow } from 'pg';

export type AuditContext = {
  userId?: string;
  changeReason?: string;
  clientIp?: string;
};

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly pool: Pool;

  constructor(config: ConfigService) {
    const connectionString =
      config.get<string>('DATABASE_URL') ??
      'postgresql://seguridad_vial:seguridad_vial_local@localhost:55433/seguridad_vial';
    this.pool = new Pool({ connectionString });
  }

  async onModuleDestroy() {
    await this.pool.end();
  }

  async query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[],
  ) {
    return this.pool.query<T>(text, params);
  }

  async withClient<T>(
    fn: (client: PoolClient) => Promise<T>,
    audit?: AuditContext,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL search_path TO seguridad_vial, public');
      if (audit?.userId) {
        await client.query(`SELECT set_config('app.user_id', $1, true)`, [
          audit.userId,
        ]);
      }
      if (audit?.changeReason) {
        await client.query(`SELECT set_config('app.change_reason', $1, true)`, [
          audit.changeReason,
        ]);
      }
      if (audit?.clientIp) {
        await client.query(`SELECT set_config('app.client_ip', $1, true)`, [
          audit.clientIp,
        ]);
      }
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
