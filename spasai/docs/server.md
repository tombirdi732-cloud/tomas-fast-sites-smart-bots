# Шпаргалка по серверу

Всё делается по SSH: `ssh root@ВАШ_IP`.

Проект лежит в `/opt/spasai`, рабочая папка — `/opt/spasai/spasai`.
Чтобы не писать длинную команду каждый раз, заведите ярлык (один раз
на сервер):

```sh
echo "alias sp='cd /opt/spasai/spasai && docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env'" >> ~/.bashrc
source ~/.bashrc
```

Дальше вместо `docker compose -f … --env-file …` можно писать просто `sp`.

---

## Когда что делать

| Что изменилось | Что запускать | Сколько ждать |
|---|---|---|
| Я прислал новую версию кода (API, панель) | **Обновление** — раздел ниже | 3–7 минут |
| Поменяли что-то в `deploy/.env` (ключи, пароли) | **Перезапуск** | 20 секунд |
| Сайт/панель не отвечает, что-то залипло | **Перезапуск** | 20 секунд |
| Прислал новый APK | ничего на сервере не нужно | — |

Правило простое: **менялся код — обновление, менялись настройки —
перезапуск.**

---

## Обновление (после моих изменений)

Одна команда — она сама скачает свежий код, пересоберёт и запустит.
Миграции базы применяются автоматически при старте API.

```sh
curl -fsSL https://raw.githubusercontent.com/tombirdi732-cloud/tomas-fast-sites-smart-bots/claude/hello-create-hpsvnj/spasai/deploy/bootstrap.sh | bash
```

Ничего не сотрёт: база, сертификат и `.env` остаются на месте.

## Перезапуск (без обновления кода)

```sh
sp restart
```

Отдельный кусок, если нужно только его:

```sh
sp restart api      # только бэкенд
sp restart nginx    # только сайт и панель
```

## Проверить, что всё живо

```sh
sp ps                                   # что запущено
curl -s https://tomas-it.ru/api/health  # должно ответить "status":"ok"
```

## Посмотреть логи

```sh
sp logs -f api           # бэкенд, живым потоком (выход — Ctrl+C)
sp logs --tail 100 api   # последние 100 строк
sp logs --tail 50 nginx  # сайт и панель
```

## Настройки и секреты

```sh
nano /opt/spasai/spasai/deploy/.env   # правим
sp restart                            # применяем
```

## База данных

```sh
sp exec postgres psql -U spasai spasai   # консоль базы, выход — \q
ls -la /opt/spasai/spasai/deploy/backups # бэкапы, делаются сами в 3:30 ночи
```

## Место на диске

```sh
df -h /            # сколько свободно
docker system prune -af --volumes=false   # почистить старые образы
```

`--volumes=false` тут важен: без него можно снести базу.

---

## Если что-то сломалось после обновления

```sh
sp logs --tail 100 api    # смотрим, на чём упало
sp up -d --build          # пересобрать ещё раз
```

Если не помогло — пришлите мне вывод `sp logs --tail 100 api`, по нему
видно причину.
