import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';

import { ApiErrorBody, ErrorCode, ErrorCodeValue } from '../errors/api-error';

/** HTTP-статус → машиночитаемый код ошибки. */
const CODE_BY_STATUS: Record<number, ErrorCodeValue> = {
  [HttpStatus.BAD_REQUEST]: ErrorCode.VALIDATION_FAILED,
  [HttpStatus.UNAUTHORIZED]: ErrorCode.UNAUTHORIZED,
  [HttpStatus.FORBIDDEN]: ErrorCode.FORBIDDEN,
  [HttpStatus.NOT_FOUND]: ErrorCode.NOT_FOUND,
  [HttpStatus.CONFLICT]: ErrorCode.CONFLICT,
  [HttpStatus.TOO_MANY_REQUESTS]: ErrorCode.RATE_LIMITED,
};

/** Начиная с этого статуса ошибка считается серверной и пишется в error-лог. */
const SERVER_ERROR_STATUS = 500;

/**
 * Приводит любое исключение к единому формату `{ code, message, details? }`.
 * Внутренние ошибки наружу не протекают — в ответ уходит generic-сообщение,
 * подробности остаются в логах.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, body } = this.normalize(exception);

    if (status >= SERVER_ERROR_STATUS) {
      this.logger.error(
        `${request.method} ${request.url} -> ${status} ${body.code}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(`${request.method} ${request.url} -> ${status} ${body.code}`);
    }

    response.status(status).json(body);
  }

  private normalize(exception: unknown): { status: number; body: ApiErrorBody } {
    if (exception instanceof HttpException) {
      return { status: exception.getStatus(), body: this.fromHttpException(exception) };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.fromPrismaError(exception);
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: { code: ErrorCode.INTERNAL_ERROR, message: 'Внутренняя ошибка сервера' },
    };
  }

  private fromHttpException(exception: HttpException): ApiErrorBody {
    const payload: unknown = exception.getResponse();

    if (typeof payload === 'string') {
      return { code: this.codeForStatus(exception.getStatus()), message: payload };
    }

    if (typeof payload === 'object' && payload !== null) {
      const record = payload as Record<string, unknown>;

      // Уже наш формат — отдаём как есть.
      if (typeof record.code === 'string' && typeof record.message === 'string') {
        return record as unknown as ApiErrorBody;
      }

      // Формат ValidationPipe: { statusCode, message: string[], error }.
      if (Array.isArray(record.message)) {
        return {
          code: ErrorCode.VALIDATION_FAILED,
          message: 'Ошибка валидации входных данных',
          details: record.message,
        };
      }

      if (typeof record.message === 'string') {
        return { code: this.codeForStatus(exception.getStatus()), message: record.message };
      }
    }

    return { code: this.codeForStatus(exception.getStatus()), message: exception.message };
  }

  private fromPrismaError(exception: Prisma.PrismaClientKnownRequestError): {
    status: number;
    body: ApiErrorBody;
  } {
    switch (exception.code) {
      case 'P2002':
        return {
          status: HttpStatus.CONFLICT,
          body: {
            code: ErrorCode.CONFLICT,
            message: 'Запись с такими данными уже существует',
            details: exception.meta,
          },
        };
      case 'P2025':
        return {
          status: HttpStatus.NOT_FOUND,
          body: { code: ErrorCode.NOT_FOUND, message: 'Запись не найдена' },
        };
      default:
        this.logger.error(`Необработанная ошибка Prisma ${exception.code}`, exception.stack);
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          body: { code: ErrorCode.INTERNAL_ERROR, message: 'Внутренняя ошибка сервера' },
        };
    }
  }

  private codeForStatus(status: number): ErrorCodeValue {
    return CODE_BY_STATUS[status] ?? ErrorCode.INTERNAL_ERROR;
  }
}
