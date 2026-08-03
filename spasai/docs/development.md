# Как редактировать проект и собирать APK

Инструкция с нуля: что поставить, где что лежит, как поправить и как из
всего этого получить APK — для телефона и для RuStore.

---

## 1. Что поставить на компьютер

| Программа | Зачем | Где взять |
|---|---|---|
| **Node.js 20 или новее** | на нём работает и сайт, и сборка приложения | nodejs.org, вариант LTS |
| **Git** | скачивать и отправлять код | git-scm.com |
| **Docker Desktop** | база данных для локальной разработки | docker.com |
| **VS Code** | редактор | code.visualstudio.com |

Для APK дополнительно:

| Программа | Зачем |
|---|---|
| **JDK 17** | Android собирается на Java (`adoptium.net`, версия 17) |
| **Android Studio** | ставит Android SDK; сама студия потом не нужна |

После установки Android Studio один раз задайте переменную окружения
`ANDROID_HOME`:

- Windows: `C:\Users\ВашеИмя\AppData\Local\Android\Sdk`
- macOS: `~/Library/Android/sdk`
- Linux: `~/Android/Sdk`

Проверка, что всё встало:

```sh
node -v      # v20.x или выше
java -version   # 17.x
```

---

## 2. Скачать проект

```sh
git clone https://github.com/tombirdi732-cloud/tomas-fast-sites-smart-bots.git
cd tomas-fast-sites-smart-bots
git checkout claude/hello-create-hpsvnj
cd spasai
npm install
```

`npm install` ставит зависимости сразу для всех трёх частей — это одна
общая сборка (npm workspaces), отдельно по папкам ставить не нужно.

---

## 3. Что где лежит

```
spasai/
├── apps/
│   ├── api/        Бэкенд: база, заказы, авторизация
│   │   ├── src/    ← сам код
│   │   └── prisma/schema.prisma   ← структура базы данных
│   ├── web/        Панель заведения и админка (сайт в браузере)
│   │   └── src/pages/             ← страницы панели
│   └── mobile/     Приложение для телефона
│       ├── src/screens/           ← экраны приложения
│       ├── src/theme.ts           ← цвета
│       ├── assets/                ← иконка, заставка, булавки карты
│       └── app.json               ← название, версия, права доступа
├── deploy/         Всё для сервера
├── docs/           Документация, включая эту
└── scripts/        Вспомогательные скрипты
```

Где что менять на практике:

| Хочу поменять | Файл |
|---|---|
| Текст на экране приложения | `apps/mobile/src/screens/*.tsx` |
| Цвета приложения | `apps/mobile/src/theme.ts` |
| Иконку приложения | `apps/mobile/assets/icon.png` |
| Название или версию | `apps/mobile/app.json` |
| Страницу панели заведения | `apps/web/src/pages/*.tsx` |
| Правила заказов, отмены, комиссии | `apps/api/src/orders/orders.service.ts` |
| Поля в базе данных | `apps/api/prisma/schema.prisma` (+ миграция) |

---

## 4. Запустить у себя, чтобы видеть изменения

Четыре команды, каждая в своём окне терминала.

**Окно 1 — база данных:**

```sh
cd spasai
docker compose up -d postgres redis
```

**Окно 2 — бэкенд:**

```sh
cd spasai/apps/api
cp .env.example .env        # только в первый раз
npm run prisma:deploy       # только в первый раз и после смены схемы
npm run db:seed             # только в первый раз: тестовые заведения
npm run start:dev
```

Открылся на `http://localhost:3000/api`. Проверить: `http://localhost:3000/api/health`.

**Окно 3 — панель заведения:**

```sh
cd spasai/apps/web
npm run dev
```

Открылась на `http://localhost:5173`.

**Окно 4 — приложение:**

```sh
cd spasai/apps/mobile
npm start
```

Дальше два варианта:

- нажать `w` — приложение откроется в браузере. Быстро, годится для
  текстов и вёрстки. Карты в браузере нет — вместо неё схема;
- поставить на телефон **Expo Go** из RuStore и отсканировать QR из
  терминала. Телефон и компьютер должны быть в одном Wi-Fi. Здесь тоже
  не будет карт: Яндекс.Карты — нативный модуль, в Expo Go его нет.
  Всё остальное работает.

Сохраняете файл — экран на телефоне обновляется сам, пересобирать
ничего не надо.

---

## 5. Проверить, что ничего не сломали

Из папки `spasai`:

```sh
npm run typecheck --workspaces   # опечатки в коде
npm run lint --workspaces        # оформление
npm test -w @spasai/api          # тесты бэкенда
```

Все три должны пройти без ошибок. Если ругается — читайте первую
ошибку, остальные обычно её следствие.

---

## 6. Сохранить изменения

```sh
git add -A
git commit -m "Что сделали, одной строкой"
git push
```

После этого на сервере запускается обновление — команда в
[docs/server.md](server.md).

---

## 7. Собрать APK

### 7.1. Один раз: ключ подписи

Приложение подписывается ключом. Ключ доказывает, что новая версия —
от того же автора, что и старая. **Потеряете ключ — не сможете
выпустить обновление, придётся публиковать приложение заново под другим
именем.** Поэтому сразу сделайте копию в надёжном месте.

```sh
keytool -genkeypair -v -storetype PKCS12 \
  -keystore spasai-upload.keystore -alias spasai \
  -keyalg RSA -keysize 2048 -validity 10000
```

`keytool` идёт вместе с JDK. Спросит пароль (придумайте и запишите) и
данные владельца — имя, организацию, город, двухбуквенный код страны
(`RU`). Получится файл `spasai-upload.keystore`.

Уберите его из папки проекта — например, в `C:\keys\` или `~/keys/` —
чтобы случайно не отправить в git.

Теперь пропишите путь и пароли **один раз** в файл настроек Gradle. Он
лежит вне проекта, поэтому в репозиторий пароли не попадут:

- Windows: `C:\Users\ВашеИмя\.gradle\gradle.properties`
- macOS и Linux: `~/.gradle/gradle.properties`

Создайте файл, если его нет, и добавьте четыре строки:

```properties
SPASAI_STORE_FILE=C:/keys/spasai-upload.keystore
SPASAI_STORE_PASSWORD=ваш_пароль
SPASAI_KEY_ALIAS=spasai
SPASAI_KEY_PASSWORD=ваш_пароль
```

Путь пишется через прямые слеши даже на Windows.

Без этих строк сборка не упадёт — APK подпишется отладочным ключом.
Такой APK ставится на телефон, но **в RuStore его не примут**.

### 7.2. Один раз: ключ Яндекс.Карт

В `apps/mobile/.env` должна лежать строка:

```
EXPO_PUBLIC_MAPKIT_API_KEY=ваш-ключ-mapkit
```

Файл в git не хранится. Ключ берётся в кабинете разработчика
Яндекса, тариф MapKit Mobile SDK. Без ключа приложение не падает, но
вместо карты рисует схему.

### 7.3. Собственно сборка

```sh
cd spasai/apps/mobile
npx expo prebuild --platform android --clean
cd android
./gradlew assembleRelease
```

На Windows вместо `./gradlew` пишется `gradlew`.

Первая сборка идёт 10–20 минут — Gradle скачивает половину интернета.
Следующие — 2–5 минут.

Готовый файл:

```
spasai/apps/mobile/android/app/build/outputs/apk/release/app-release.apk
```

Около 45 МБ (две архитектуры процессоров). Перекиньте на телефон любым
способом и установите — Android спросит разрешение на установку из
неизвестного источника.

### 7.4. Перед сборкой не забыть версию

В `apps/mobile/app.json` поднимите `version`:

```json
"version": "0.7.0",
```

RuStore не примет загрузку с версией, которая там уже была.

### 7.5. Сборка для RuStore

RuStore принимает и APK, и AAB. AAB меньше весит у пользователя:

```sh
cd spasai/apps/mobile/android
./gradlew bundleRelease
```

Файл окажется в `app/build/outputs/bundle/release/app-release.aab`.

Проверить, что подписалось вашим ключом, а не отладочным:

```sh
keytool -printcert -jarfile app/build/outputs/apk/release/app-release.apk
```

В строке `Владелец` должны быть ваши данные, а не `CN=Android Debug`.

---

## 8. Частые ошибки

**`SDK location not found`** — не задана `ANDROID_HOME`. Задайте
переменную окружения и перезапустите терминал.

**`Unsupported class file major version`** — стоит не та Java. Нужна
именно 17: `java -version`.

**Сборка идёт вечно и падает по памяти** — добавьте в
`spasai/apps/mobile/android/gradle.properties`:

```properties
org.gradle.jvmargs=-Xmx4096m
```

**В приложении вместо карты сетка** — нет `EXPO_PUBLIC_MAPKIT_API_KEY` в
`apps/mobile/.env`, либо ключ не от MapKit Mobile SDK, а от
JavaScript-карт: это разные ключи.

**Приложение не видит сервер** — адрес API прописан в
`apps/mobile/app.json`, в `extra.apiUrl`. На экране входа его можно
поменять на лету: долгое нажатие на надпись «СПАСАЙ».

**APK весит 80 МБ** — собрались все четыре архитектуры процессора.
Проверьте, что в `app.json` в списке плагинов есть
`"./plugins/withReleaseSigning.js"` — он ограничивает список до двух
нужных.
