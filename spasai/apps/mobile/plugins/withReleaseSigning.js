/**
 * Подпись релизной сборки своим ключом.
 *
 * Expo генерирует `android/` заново на каждом `prebuild`, поэтому править
 * `app/build.gradle` руками бесполезно — правки затрутся. Этот плагин
 * вносит их на каждой генерации.
 *
 * По умолчанию Expo подписывает релиз отладочным ключом. С таким ключом
 * приложение ставится на телефон, но магазины его не принимают: подпись
 * одинаковая у всех проектов, обновить приложение потом будет нечем.
 *
 * Ключ берётся из свойств Gradle, а не из репозитория:
 *
 *   SPASAI_STORE_FILE, SPASAI_STORE_PASSWORD,
 *   SPASAI_KEY_ALIAS,  SPASAI_KEY_PASSWORD
 *
 * Их удобно держать в `~/.gradle/gradle.properties` — этот файл лежит вне
 * проекта и в git не попадает. Если свойств нет, сборка не падает, а
 * подписывается отладочным ключом, как раньше: собрать APK «на посмотреть»
 * можно без всякого хранилища ключей.
 *
 * Заодно плагин ограничивает список процессорных архитектур. По умолчанию
 * собираются все четыре, включая эмуляторные x86, и APK весит под 80 МБ
 * вместо тридцати.
 */
const { withAppBuildGradle, withGradleProperties } = require('expo/config-plugins');

const SIGNING_CONFIG = `
    // Добавлено плагином plugins/withReleaseSigning.js
    signingConfigs {
        release {
            if (project.hasProperty('SPASAI_STORE_FILE')) {
                storeFile file(SPASAI_STORE_FILE)
                storePassword SPASAI_STORE_PASSWORD
                keyAlias SPASAI_KEY_ALIAS
                keyPassword SPASAI_KEY_PASSWORD
            }
        }
    }
`;

/** Вставляет конфиг подписи рядом с отладочным и переключает на него релиз. */
function patchBuildGradle(contents) {
  let next = contents;

  if (!next.includes("project.hasProperty('SPASAI_STORE_FILE')")) {
    // Свой блок signingConfigs добавляем сразу за уже существующим:
    // два блока подряд Gradle объединяет, а порядок здесь не важен.
    const anchor = /signingConfigs \{[\s\S]*?\n    \}\n/;
    if (!anchor.test(next)) {
      throw new Error('withReleaseSigning: не нашёл signingConfigs в app/build.gradle');
    }
    next = next.replace(anchor, (match) => match + SIGNING_CONFIG);
  }

  // В релизе Expo прописывает отладочный ключ — меняем на условный выбор.
  // Ищем строго внутри buildTypes: слово `release` встречается в файле
  // и раньше, в самих signingConfigs, и подменить надо не его.
  const buildTypesAt = next.indexOf('buildTypes {');
  const releaseAt = buildTypesAt >= 0 ? next.indexOf('release {', buildTypesAt) : -1;
  const debugSigningAt =
    releaseAt >= 0 ? next.indexOf('signingConfig signingConfigs.debug', releaseAt) : -1;

  if (debugSigningAt < 0) {
    throw new Error('withReleaseSigning: не нашёл подпись релиза в app/build.gradle');
  }

  return (
    next.slice(0, debugSigningAt) +
    "signingConfig project.hasProperty('SPASAI_STORE_FILE') ? signingConfigs.release : signingConfigs.debug" +
    next.slice(debugSigningAt + 'signingConfig signingConfigs.debug'.length)
  );
}

const withReleaseSigning = (config, props = {}) => {
  const architectures = props.architectures ?? 'armeabi-v7a,arm64-v8a';

  config = withAppBuildGradle(config, (mod) => {
    mod.modResults.contents = patchBuildGradle(mod.modResults.contents);
    return mod;
  });

  return withGradleProperties(config, (mod) => {
    const existing = mod.modResults.find(
      (item) => item.type === 'property' && item.key === 'reactNativeArchitectures',
    );
    if (existing) {
      existing.value = architectures;
    } else {
      mod.modResults.push({ type: 'property', key: 'reactNativeArchitectures', value: architectures });
    }
    return mod;
  });
};

module.exports = withReleaseSigning;
