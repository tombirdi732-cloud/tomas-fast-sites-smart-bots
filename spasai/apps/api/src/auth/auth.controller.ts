import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsString, Length } from 'class-validator';

import { PrismaService } from '../prisma/prisma.service';
import { AuthUser, CurrentUser, Public } from './auth.decorators';
import { AuthService, type RequestCodeResult, type TokenPair } from './auth.service';
import { TelegramService, type TelegramLoginStart } from './telegram.service';
import { YandexService, type YandexLoginStart } from './yandex.service';
import { RefreshDto, RequestCodeDto, UpdateMeDto, VerifyCodeDto } from './dto/auth.dto';

class TelegramPollDto {
  @IsString()
  @Length(8, 64)
  nonce!: string;
}

class YandexPollDto {
  @IsString()
  @Length(8, 64)
  state!: string;
}

interface MeResponse {
  id: string;
  phone: string | null;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
  role: string;
  createdAt: string;
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
    private readonly telegram: TelegramService,
    private readonly yandex: YandexService,
  ) {}

  /** Шаг 1. Отправка кода. Дополнительно прикрыт троттлингом по IP. */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('request-code')
  @HttpCode(HttpStatus.OK)
  requestCode(@Body() dto: RequestCodeDto): Promise<RequestCodeResult> {
    return this.auth.requestCode(dto.phone);
  }

  /** Шаг 2. Проверка кода, выдача токенов. */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('verify-code')
  @HttpCode(HttpStatus.OK)
  async verifyCode(@Body() dto: VerifyCodeDto): Promise<TokenPair & { user: MeResponse }> {
    const { user, ...tokens } = await this.auth.verifyCode(dto.phone, dto.code, dto.name);
    return { ...tokens, user: AuthController.toMe(user) };
  }

  /**
   * Демо-вход без номера и кода. Работает только при `DEMO_LOGIN=true`
   * и заводит новый пустой аккаунт — чужой им не открыть.
   */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('demo')
  @HttpCode(HttpStatus.OK)
  async demo(): Promise<TokenPair & { user: MeResponse }> {
    const { user, ...tokens } = await this.auth.demoLogin();
    return { ...tokens, user: AuthController.toMe(user) };
  }

  /** Шаг 1 входа через Telegram: ссылка на бота. */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('telegram/start')
  @HttpCode(HttpStatus.OK)
  telegramStart(): Promise<TelegramLoginStart> {
    return this.telegram.start();
  }

  /**
   * Шаг 3: приложение спрашивает, нажал ли пользователь «Старт» у бота.
   * Пока не нажал — отвечаем `pending`, это не ошибка.
   */
  @Public()
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @Post('telegram/poll')
  @HttpCode(HttpStatus.OK)
  async telegramPoll(
    @Body() dto: TelegramPollDto,
  ): Promise<{ status: 'pending' } | (TokenPair & { status: 'ok'; user: MeResponse })> {
    const confirmed = await this.telegram.claim(dto.nonce);
    if (!confirmed) return { status: 'pending' };

    const { user, ...tokens } = await this.auth.loginByTelegram(
      confirmed.telegramId,
      confirmed.firstName,
    );
    return { status: 'ok', ...tokens, user: AuthController.toMe(user) };
  }

  /** Шаг 1 входа через Яндекс: ссылка на страницу подтверждения. */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('yandex/start')
  @HttpCode(HttpStatus.OK)
  yandexStart(): Promise<YandexLoginStart> {
    return this.yandex.start();
  }

  /** Шаг 3: приложение спрашивает, подтвердил ли пользователь вход. */
  @Public()
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @Post('yandex/poll')
  @HttpCode(HttpStatus.OK)
  async yandexPoll(
    @Body() dto: YandexPollDto,
  ): Promise<{ status: 'pending' } | (TokenPair & { status: 'ok'; user: MeResponse })> {
    const confirmed = await this.yandex.claim(dto.state);
    if (!confirmed) return { status: 'pending' };

    const { user, ...tokens } = await this.auth.loginByYandex(
      confirmed.externalId,
      confirmed.displayName,
      confirmed.email,
    );
    return { status: 'ok', ...tokens, user: AuthController.toMe(user) };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshDto): Promise<TokenPair> {
    return this.auth.refresh(dto.refreshToken);
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(@Body() dto: RefreshDto): Promise<void> {
    return this.auth.logout(dto.refreshToken);
  }

  @Get('me')
  async me(@CurrentUser() current: AuthUser): Promise<MeResponse> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: current.id } });
    return AuthController.toMe(user);
  }

  @Patch('me')
  async updateMe(@CurrentUser() current: AuthUser, @Body() dto: UpdateMeDto): Promise<MeResponse> {
    const user = await this.prisma.user.update({
      where: { id: current.id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.fcmToken !== undefined ? { fcmToken: dto.fcmToken } : {}),
      },
    });
    return AuthController.toMe(user);
  }

  private static toMe(user: {
    id: string;
    phone: string | null;
    name: string | null;
    email: string | null;
    avatarUrl: string | null;
    role: string;
    createdAt: Date;
  }): MeResponse {
    return {
      id: user.id,
      phone: user.phone,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl,
      role: user.role,
      createdAt: user.createdAt.toISOString(),
    };
  }
}
