import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { ApiException, ErrorCode } from '../common/errors/api-error';
import { AuthErrorCode } from '../common/errors/error-codes';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser, IS_PUBLIC_KEY } from './auth.decorators';
import type { JwtPayload } from './auth.service';

/**
 * Глобальный guard: требует валидный access-токен везде, кроме эндпоинтов
 * с декоратором @Public(). Заблокированный пользователь отсекается сразу.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const header = request.headers.authorization;

    if (!header?.startsWith('Bearer ')) {
      throw ApiException.unauthorized('Требуется авторизация');
    }

    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(header.slice(7));
    } catch {
      throw ApiException.unauthorized('Токен недействителен или истёк');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, role: true, phone: true, isBlocked: true },
    });

    if (!user) {
      throw ApiException.unauthorized('Пользователь не найден');
    }

    if (user.isBlocked) {
      throw new ApiException(HttpStatus.FORBIDDEN, AuthErrorCode.USER_BLOCKED, 'Аккаунт заблокирован');
    }

    request.user = { id: user.id, role: user.role, phone: user.phone };
    return true;
  }
}

/** Проверяет роль после JwtAuthGuard. Работает в паре с @Roles(). */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[] | undefined>('roles', [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    const role = request.user?.role;

    if (!role || !required.includes(role)) {
      throw new ApiException(
        HttpStatus.FORBIDDEN,
        ErrorCode.FORBIDDEN,
        'Недостаточно прав для этой операции',
        { requiredRoles: required },
      );
    }

    return true;
  }
}
