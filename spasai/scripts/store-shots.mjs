/**
 * Скриншоты для карточки в RuStore. Снимаем настоящее приложение,
 * а не макеты: что нарисовано, то и увидит пользователь.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../docs/store');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
});
const ctx = await browser.newContext({
  // 360×780 при трёхкратной плотности — 1080×2340, обычный размер экрана.
  viewport: { width: 360, height: 780 },
  deviceScaleFactor: 3,
  geolocation: { latitude: 55.7539, longitude: 37.6208 },
  permissions: ['geolocation'],
  colorScheme: 'light',
});
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));

const shot = async (n, name) => {
  await page.screenshot({ path: `${OUT}/${String(n).padStart(2, '0')}-${name}.png` });
  console.log(`${String(n).padStart(2, '0')}-${name}.png`);
};

const wait = (ms) => page.waitForTimeout(ms);

/** Ярлык, который реально виден на экране (вкладки остаются в DOM). */
const visible = async (text, exact = false) => {
  const it = page.getByText(text, { exact });
  for (let i = 0; i < (await it.count()); i += 1) {
    const b = await it.nth(i).boundingBox();
    if (b && b.y > 40 && b.y + b.height < 780) return { locator: it.nth(i), box: b };
  }
  return null;
};

const click = async (text, exact = false) => {
  const found = await visible(text, exact);
  if (!found) return false;
  await page.mouse.click(found.box.x + found.box.width / 2, found.box.y + found.box.height / 2);
  return true;
};

const tab = async (name) => {
  await page.locator('[role="tab"]').filter({ hasText: name }).first().click();
  await wait(2200);
};

await page.goto('http://localhost:8081', { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.setItem('spasai.apiUrl', 'http://localhost:3000/api'));
await page.reload({ waitUntil: 'networkidle' });
await wait(6000);

// 1–3. Знакомство с приложением
await shot(1, 'eda-ne-propadet');
if (await click('Дальше')) await wait(900);
await shot(2, 'deshevle');
if (await click('Дальше')) await wait(1200);
await shot(3, 'ryadom-s-vami');
if (await click('Позже')) await wait(900);

// Дальше нужен вход — в браузере проходим демо-входом.
const tokens = await fetch('http://localhost:3000/api/auth/demo', { method: 'POST' }).then((r) =>
  r.json(),
);
const auth = { authorization: `Bearer ${tokens.accessToken}`, 'content-type': 'application/json' };
// Профиль и избранное на пустом аккаунте выглядят как ошибка, а не как экран.
await fetch('http://localhost:3000/api/auth/me', {
  method: 'PATCH',
  headers: auth,
  body: JSON.stringify({ name: 'Анна' }),
});
const nearby = await fetch(
  'http://localhost:3000/api/boxes?lat=55.7539&lng=37.6208&limit=3',
).then((r) => r.json());
for (const box of (nearby.items ?? nearby).slice(0, 2)) {
  await fetch('http://localhost:3000/api/favorites', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ merchantId: box.merchant.id }),
  });
}
await page.evaluate(
  ([a, r]) => {
    localStorage.setItem('spasai.access', a);
    localStorage.setItem('spasai.refresh', r);
    localStorage.setItem('spasai.onboarded', 'true');
  },
  [tokens.accessToken, tokens.refreshToken],
);
await page.reload({ waitUntil: 'networkidle' });
await wait(7000);

// 4. Лента боксов рядом
await shot(4, 'lenta');

// 5. Карточка бокса
if (await click('Купить', true)) await wait(2500);
await shot(5, 'box');

// 6. Оформление
if (await click('Забронировать за')) await wait(2500);
await shot(6, 'oformlenie');

// 7. Код выдачи
const pay = page.getByText('Забронировать за', { exact: false });
for (let i = 0; i < (await pay.count()); i += 1) {
  const b = await pay.nth(i).boundingBox();
  if (b && b.y > 620) {
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
    break;
  }
}
await wait(4000);
await shot(7, 'kod-vydachi');

// 8. Мои заказы
await page.goto('http://localhost:8081', { waitUntil: 'networkidle' });
await wait(8000);
await tab('Заказы');
await shot(8, 'zakazy');

// 9. Избранное
await tab('Избранное');
await wait(1500);
await shot(9, 'izbrannoe');

// 10. Профиль
await tab('Профиль');
await shot(10, 'profil');

await browser.close();
