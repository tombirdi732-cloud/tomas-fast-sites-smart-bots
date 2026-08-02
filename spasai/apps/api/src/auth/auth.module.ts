import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import type { Env } from '../config/env';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SmsService } from './sms.service';
import { TelegramWebhookController } from './telegram.controller';
import { TelegramService } from './telegram.service';
import { YandexCallbackController } from './yandex.controller';
import { YandexService } from './yandex.service';

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        secret: config.get('JWT_SECRET', { infer: true }),
        signOptions: { expiresIn: config.get('JWT_ACCESS_TTL', { infer: true }) },
      }),
    }),
  ],
  controllers: [AuthController, TelegramWebhookController, YandexCallbackController],
  providers: [AuthService, SmsService, TelegramService, YandexService],
  exports: [AuthService, TelegramService, YandexService, JwtModule],
})
export class AuthModule {}
