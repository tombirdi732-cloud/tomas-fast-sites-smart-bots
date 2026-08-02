import { Controller, Get, Header, Query } from '@nestjs/common';

import { Public } from './auth.decorators';
import { YandexService } from './yandex.service';

/**
 * Страница, на которую Яндекс возвращает пользователя после подтверждения.
 *
 * Отдаёт человеку простую страницу «можно возвращаться», а приложению
 * сигналит тем, что помечает вход подтверждённым — приложение узнаёт
 * об этом своим опросом.
 */
@Controller('auth/yandex')
export class YandexCallbackController {
  constructor(private readonly yandex: YandexService) {}

  @Public()
  @Get('callback')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async callback(
    @Query('code') code?: string,
    @Query('state') state?: string,
    @Query('error') error?: string,
  ): Promise<string> {
    if (error || !code || !state) {
      return page('Вход отменён', 'Вернитесь в приложение и попробуйте ещё раз.');
    }

    const ok = await this.yandex.completeCallback(code, state);

    return ok
      ? page('Готово', 'Возвращайтесь в приложение — вы уже вошли.')
      : page('Не получилось', 'Ссылка устарела. Вернитесь в приложение и начните заново.');
  }
}

/** Страницу видит человек в браузере, поэтому без рамок и лишних слов. */
function page(title: string, text: string): string {
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · Спасай</title>
<style>
  body { margin:0; min-height:100vh; display:grid; place-items:center;
         background:#f4f6f7; color:#1a1d1f; font:16px/1.5 system-ui, sans-serif; padding:24px; }
  .box { max-width:360px; text-align:center; }
  .mark { width:56px; height:56px; border-radius:17px; background:#21a038; color:#fff;
          display:grid; place-items:center; font-size:26px; font-weight:800; margin:0 auto 20px; }
  h1 { font-size:1.4rem; margin:0 0 8px; }
  p { color:#8b9296; margin:0; }
</style>
</head>
<body>
  <div class="box">
    <div class="mark">С</div>
    <h1>${title}</h1>
    <p>${text}</p>
  </div>
</body>
</html>`;
}
