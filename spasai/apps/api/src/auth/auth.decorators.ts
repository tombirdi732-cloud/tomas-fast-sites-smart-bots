import { SetMetadata, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { UserRole } from '@prisma/client';

export const IS_PUBLIC_KEY = 'isPublic';
export const ROLES_KEY = 'roles';

/** Эндпоинт доступен без токена. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Доступ только перечисленным ролям. */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

export interface AuthUser {
  id: string;
  role: UserRole;
  phone: string;
}

/** Достаёт пользователя, положенного в запрос JwtAuthGuard'ом. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser => {
    const request = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    if (!request.user) {
      throw new Error('CurrentUser использован на эндпоинте без JwtAuthGuard');
    }
    return request.user;
  },
);
