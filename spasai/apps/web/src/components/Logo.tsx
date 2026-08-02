/**
 * Знак «Спасай»: тот же пакет с часами, что на иконке приложения
 * и во вкладке браузера. Вставлен разметкой, а не картинкой, — чтобы
 * не тянуть лишний запрос ради 36 пикселей.
 */
export function Logo({ caption }: { caption: string }) {
  return (
    <div className="logo">
      <svg className="logo__mark" viewBox="0 0 64 64" role="img" aria-label="Спасай">
        <rect width="64" height="64" rx="14" fill="#21a038" />
        <path
          fill="#fff"
          d="M17 17.5l3.6-3.5 3.6 3.5 3.6-3.5 3.6 3.5 3.6-3.5 3.6 3.5 3.6-3.5 1.4 1.4v27.7a4 4 0 0 1-4 4H21a4 4 0 0 1-4-4z"
        />
        <path
          fill="#fff"
          opacity=".92"
          d="M45.6 15.4L48 17.5v27.6a4 4 0 0 1-4 4h-2.3a6 6 0 0 0 1.5-4V17.4z"
        />
        <circle cx="29.5" cy="33" r="8.6" fill="none" stroke="#21a038" strokeWidth="2.6" />
        <path
          fill="none"
          stroke="#21a038"
          strokeWidth="2.6"
          strokeLinecap="round"
          d="M29.5 27.4V33l4.6 3.1"
        />
      </svg>
      <span className="logo__text">
        Спасай
        <small>{caption}</small>
      </span>
    </div>
  );
}
