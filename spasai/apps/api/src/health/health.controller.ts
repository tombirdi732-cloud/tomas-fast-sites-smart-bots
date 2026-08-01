import { Controller, Get } from '@nestjs/common';

import { Public } from '../auth/auth.decorators';
import { PrismaService } from '../prisma/prisma.service';

interface HealthResponse {
  status: 'ok' | 'degraded';
  uptimeSec: number;
  /** Время сервера в UTC — все даты в системе UTC (раздел 10 ТЗ). */
  time: string;
  db: { connected: boolean; postgis: string | null };
}

@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check(): Promise<HealthResponse> {
    let connected = false;
    let postgis: string | null = null;

    try {
      connected = await this.prisma.ping();
      postgis = await this.prisma.postgisVersion();
    } catch {
      connected = false;
    }

    return {
      status: connected && postgis !== null ? 'ok' : 'degraded',
      uptimeSec: Math.round(process.uptime()),
      time: new Date().toISOString(),
      db: { connected, postgis },
    };
  }
}
