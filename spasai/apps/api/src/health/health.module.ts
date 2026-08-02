import { Module } from '@nestjs/common';

import { AppConfigController } from './app-config.controller';
import { HealthController } from './health.controller';

@Module({
  controllers: [HealthController, AppConfigController],
})
export class HealthModule {}
