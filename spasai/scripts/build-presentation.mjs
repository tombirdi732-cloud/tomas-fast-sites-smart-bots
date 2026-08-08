/**
 * Собирает презентацию: вшивает картинки в HTML и печатает PDF.
 *
 * Картинки идут не ссылками, а прямо в файл — так страница открывается
 * с флешки и из письма, без интернета и без папки рядом.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../docs/presentation');

const dataUri = (name) =>
  `data:image/jpeg;base64,${readFileSync(`${DIR}/${name}`).toString('base64')}`;

const page = (readFileSync(`${DIR}/_style.html`, 'utf8') + readFileSync(`${DIR}/_content.html`, 'utf8'))
  .replace('SCREENS1_SRC', dataUri('screens-1.jpg'))
  .replace('SCREENS2_SRC', dataUri('screens-2.jpg'))
  .replace('PANEL_SRC', dataUri('panel.jpg'));

writeFileSync(`${DIR}/prezentaciya.html`, page);
console.log(`prezentaciya.html — ${(page.length / 1024 / 1024).toFixed(2)} МБ`);

// Вторая копия — с картинками рядом, а не внутри. Её правят руками:
// такой файл открывается в редакторе, а не вешает его на мегабайте base64.
const editable = (readFileSync(`${DIR}/_style.html`, 'utf8') + readFileSync(`${DIR}/_content.html`, 'utf8'))
  .replace('SCREENS1_SRC', 'screens-1.jpg')
  .replace('SCREENS2_SRC', 'screens-2.jpg')
  .replace('PANEL_SRC', 'panel.jpg');

writeFileSync(`${DIR}/prezentaciya-pravki.html`, editable);
console.log(`prezentaciya-pravki.html — ${Math.round(editable.length / 1024)} КБ`);

const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
});

// PDF снимаем в светлой теме: тёмную никто не печатает.
const tab = await browser.newPage({ colorScheme: 'light' });
tab.on('pageerror', (error) => console.log('ОШИБКА СТРАНИЦЫ:', error.message));
await tab.goto(`file://${DIR}/prezentaciya.html`, { waitUntil: 'networkidle' });
await tab.emulateMedia({ media: 'print', colorScheme: 'light' });
await tab.pdf({
  path: `${DIR}/spasai.pdf`,
  format: 'A4',
  printBackground: true,
  preferCSSPageSize: true,
});
console.log('spasai.pdf готов');

await browser.close();
