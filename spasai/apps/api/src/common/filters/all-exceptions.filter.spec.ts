import { ArgumentsHost, BadRequestException, HttpStatus, NotFoundException } from '@nestjs/common';

import { ApiErrorBody, ApiException, ErrorCode } from '../errors/api-error';
import { AllExceptionsFilter } from './all-exceptions.filter';

interface Captured {
  status: number;
  body: ApiErrorBody;
}

function createHost(captured: Captured): ArgumentsHost {
  const response = {
    status(code: number) {
      captured.status = code;
      return this;
    },
    json(body: ApiErrorBody) {
      captured.body = body;
      return this;
    },
  };

  const request = { method: 'POST', url: '/api/boxes' };

  return {
    switchToHttp: () => ({
      getResponse: <T>() => response as T,
      getRequest: <T>() => request as T,
    }),
  } as unknown as ArgumentsHost;
}

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();
  let captured: Captured;

  beforeEach(() => {
    captured = { status: 0, body: { code: '', message: '' } };
    jest.spyOn(filter['logger'], 'warn').mockImplementation(() => undefined);
    jest.spyOn(filter['logger'], 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('отдаёт ApiException как есть', () => {
    filter.catch(
      ApiException.badRequest('BOX_EXPIRED', 'Срок годности бокса истекает раньше окна выдачи', {
        field: 'best_before',
      }),
      createHost(captured),
    );

    expect(captured.status).toBe(HttpStatus.BAD_REQUEST);
    expect(captured.body).toEqual({
      code: 'BOX_EXPIRED',
      message: 'Срок годности бокса истекает раньше окна выдачи',
      details: { field: 'best_before' },
    });
  });

  it('сворачивает вывод ValidationPipe в единый формат', () => {
    filter.catch(
      new BadRequestException(['price must be a positive number', 'quantity should not be empty']),
      createHost(captured),
    );

    expect(captured.status).toBe(HttpStatus.BAD_REQUEST);
    expect(captured.body.code).toBe(ErrorCode.VALIDATION_FAILED);
    expect(captured.body.details).toEqual([
      'price must be a positive number',
      'quantity should not be empty',
    ]);
  });

  it('маппит стандартные исключения Nest на коды', () => {
    filter.catch(new NotFoundException('Бокс не найден'), createHost(captured));

    expect(captured.status).toBe(HttpStatus.NOT_FOUND);
    expect(captured.body).toEqual({ code: ErrorCode.NOT_FOUND, message: 'Бокс не найден' });
  });

  it('не выпускает наружу детали внутренней ошибки', () => {
    filter.catch(new Error('connect ECONNREFUSED 10.0.0.5:5432'), createHost(captured));

    expect(captured.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(captured.body).toEqual({
      code: ErrorCode.INTERNAL_ERROR,
      message: 'Внутренняя ошибка сервера',
    });
  });
});
