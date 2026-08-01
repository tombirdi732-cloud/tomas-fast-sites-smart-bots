import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Машиночитаемые коды ошибок API. Клиенты (мобильное приложение, панель
 * заведения) ветвятся по `code`, а не по тексту сообщения.
 */
export const ErrorCode = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode] | (string & {});

/** Единый формат тела ошибки: `{ code, message, details? }` (раздел 10 ТЗ). */
export interface ApiErrorBody {
  code: ErrorCodeValue;
  message: string;
  details?: unknown;
}

export class ApiException extends HttpException {
  constructor(
    status: HttpStatus,
    public readonly code: ErrorCodeValue,
    message: string,
    public readonly details?: unknown,
  ) {
    const body: ApiErrorBody = details === undefined ? { code, message } : { code, message, details };
    super(body, status);
  }

  static notFound(message: string, details?: unknown): ApiException {
    return new ApiException(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, message, details);
  }

  static badRequest(code: ErrorCodeValue, message: string, details?: unknown): ApiException {
    return new ApiException(HttpStatus.BAD_REQUEST, code, message, details);
  }

  static conflict(message: string, details?: unknown): ApiException {
    return new ApiException(HttpStatus.CONFLICT, ErrorCode.CONFLICT, message, details);
  }

  static forbidden(message: string, details?: unknown): ApiException {
    return new ApiException(HttpStatus.FORBIDDEN, ErrorCode.FORBIDDEN, message, details);
  }

  static unauthorized(message: string, details?: unknown): ApiException {
    return new ApiException(HttpStatus.UNAUTHORIZED, ErrorCode.UNAUTHORIZED, message, details);
  }
}
