import { createHmac } from 'node:crypto';

import { HttpStatus } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@prisma/client';

import { ApiException } from '../common/errors/api-error';
import { AuthErrorCode } from '../common/errors/error-codes';
import { AuthService } from './auth.service';
import { SmsService } from './sms.service';

const ENV: Record<string, unknown> = {
  AUTH_HASH_SECRET: 'test-hash-secret-0123456789',
  SMS_RESEND_COOLDOWN: 60,
  SMS_CODE_TTL: 300,
  SMS_MAX_ATTEMPTS: 5,
  JWT_ACCESS_TTL: 900,
  JWT_REFRESH_TTL: 2_592_000,
  SMS_PROVIDER: 'stub',
};

function makeService(overrides: {
  lastVerification?: unknown;
  openVerification?: unknown;
  storedRefresh?: unknown;
} = {}) {
  const prisma = {
    phoneVerification: {
      findFirst: jest.fn((args: { where: { usedAt?: null } }) =>
        Promise.resolve(
          args.where.usedAt === null
            ? (overrides.openVerification ?? null)
            : (overrides.lastVerification ?? null),
        ),
      ),
      create: jest.fn(() => Promise.resolve({ id: 'v1' })),
      update: jest.fn(() => Promise.resolve({ id: 'v1' })),
      delete: jest.fn(() => Promise.resolve({ id: 'v1' })),
    },
    user: {
      upsert: jest.fn(() =>
        Promise.resolve({
          id: 'u1',
          phone: '+79990000001',
          role: UserRole.customer,
          isBlocked: false,
        }),
      ),
    },
    refreshToken: {
      findUnique: jest.fn(() => Promise.resolve(overrides.storedRefresh ?? null)),
      create: jest.fn(() => Promise.resolve({ id: 'r1' })),
      update: jest.fn(() => Promise.resolve({ id: 'r1' })),
      updateMany: jest.fn(() => Promise.resolve({ count: 1 })),
    },
  };

  const config = { get: (key: string) => ENV[key] };
  const jwt = new JwtService({ secret: 'test-secret-0123456789' });
  const sms = new SmsService(config as never);

  jest.spyOn(sms, 'send').mockResolvedValue(undefined);

  const service = new AuthService(prisma as never, jwt, sms, config as never);
  return { service, prisma, sms };
}

/** Хэш кода, вычисленный тем же способом, что и в сервисе. */
function hashOf(value: string): string {
  return createHmac('sha256', ENV.AUTH_HASH_SECRET as string).update(value).digest('hex');
}

describe('AuthService.requestCode', () => {
  it('в dev-режиме отдаёт код 0000 и сохраняет его хэш', async () => {
    const { service, prisma } = makeService();

    const result = await service.requestCode('+79990000001');

    expect(result.devCode).toBe('0000');
    expect(prisma.phoneVerification.create).toHaveBeenCalledTimes(1);
    const arg = prisma.phoneVerification.create.mock.calls[0] as unknown as [
      { data: { codeHash: string; phone: string } },
    ];
    expect(arg[0].data.codeHash).toBe(hashOf('0000'));
    expect(arg[0].data.codeHash).not.toContain('0000');
  });

  it('не даёт запросить второй код раньше минуты', async () => {
    const { service } = makeService({
      lastVerification: { createdAt: new Date(Date.now() - 20_000) },
    });

    await expect(service.requestCode('+79990000001')).rejects.toMatchObject({
      code: AuthErrorCode.SMS_RATE_LIMITED,
    });
  });

  it('разрешает повтор после истечения кулдауна', async () => {
    const { service } = makeService({
      lastVerification: { createdAt: new Date(Date.now() - 61_000) },
    });

    await expect(service.requestCode('+79990000001')).resolves.toMatchObject({ devCode: '0000' });
  });
});

describe('AuthService.verifyCode', () => {
  const openVerification = {
    id: 'v1',
    codeHash: hashOf('0000'),
    attempts: 0,
    expiresAt: new Date(Date.now() + 60_000),
  };

  it('выдаёт пару токенов и создаёт пользователя', async () => {
    const { service, prisma } = makeService({ openVerification });

    const result = await service.verifyCode('+79990000001', '0000', 'Иван');

    expect(result.accessToken).toMatch(/^ey/);
    expect(result.refreshToken).toHaveLength(64);
    expect(result.expiresIn).toBe(900);
    expect(prisma.user.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1);
    // Код гасится, чтобы им нельзя было войти второй раз.
    expect(prisma.phoneVerification.update).toHaveBeenCalledWith({
      where: { id: 'v1' },
      data: { usedAt: expect.any(Date) as Date },
    });
  });

  it('считает неудачные попытки', async () => {
    const { service, prisma } = makeService({ openVerification });

    await expect(service.verifyCode('+79990000001', '1234')).rejects.toMatchObject({
      code: AuthErrorCode.CODE_INVALID,
    });
    expect(prisma.phoneVerification.update).toHaveBeenCalledWith({
      where: { id: 'v1' },
      data: { attempts: { increment: 1 } },
    });
  });

  it('отвергает истёкший код', async () => {
    const { service } = makeService({
      openVerification: { ...openVerification, expiresAt: new Date(Date.now() - 1000) },
    });

    await expect(service.verifyCode('+79990000001', '0000')).rejects.toMatchObject({
      code: AuthErrorCode.CODE_EXPIRED,
    });
  });

  it('блокирует после исчерпания попыток', async () => {
    const { service } = makeService({ openVerification: { ...openVerification, attempts: 5 } });

    await expect(service.verifyCode('+79990000001', '0000')).rejects.toMatchObject({
      code: AuthErrorCode.CODE_ATTEMPTS_EXCEEDED,
    });
  });

  it('сообщает, что код не запрашивался', async () => {
    const { service } = makeService();

    await expect(service.verifyCode('+79990000001', '0000')).rejects.toMatchObject({
      code: AuthErrorCode.CODE_INVALID,
    });
  });
});

describe('AuthService.refresh', () => {
  it('ротирует токен: старый отзывается, выдаётся новый', async () => {
    const token = 'refresh-token-value';
    const { service, prisma } = makeService({
      storedRefresh: {
        id: 'r1',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        user: { id: 'u1', phone: '+79990000001', role: UserRole.customer, isBlocked: false },
      },
    });

    const pair = await service.refresh(token);

    expect(pair.accessToken).toMatch(/^ey/);
    expect(prisma.refreshToken.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { revokedAt: expect.any(Date) as Date },
    });
  });

  it('отвергает отозванный токен', async () => {
    const { service } = makeService({
      storedRefresh: {
        id: 'r1',
        revokedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
        user: { id: 'u1', phone: '+79990000001', role: UserRole.customer, isBlocked: false },
      },
    });

    await expect(service.refresh('x')).rejects.toMatchObject({
      code: AuthErrorCode.REFRESH_INVALID,
    });
  });

  it('не пускает заблокированного пользователя', async () => {
    const { service } = makeService({
      storedRefresh: {
        id: 'r1',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        user: { id: 'u1', phone: '+79990000001', role: UserRole.customer, isBlocked: true },
      },
    });

    const error: unknown = await service.refresh('x').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiException);
    expect((error as ApiException).getStatus()).toBe(HttpStatus.FORBIDDEN);
    expect((error as ApiException).code).toBe(AuthErrorCode.USER_BLOCKED);
  });
});
