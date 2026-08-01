import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log:
        process.env.NODE_ENV === 'development'
          ? [{ emit: 'stdout', level: 'warn' }, { emit: 'stdout', level: 'error' }]
          : [{ emit: 'stdout', level: 'error' }],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Подключение к PostgreSQL установлено');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /** Лёгкая проверка живости соединения для health-эндпоинта. */
  async ping(): Promise<boolean> {
    await this.$queryRaw`SELECT 1`;
    return true;
  }

  /** Версия PostGIS — заодно подтверждает, что расширение установлено. */
  async postgisVersion(): Promise<string | null> {
    const rows = await this.$queryRaw<Array<{ version: string | null }>>`
      SELECT extversion AS version FROM pg_extension WHERE extname = 'postgis'
    `;
    return rows[0]?.version ?? null;
  }
}
