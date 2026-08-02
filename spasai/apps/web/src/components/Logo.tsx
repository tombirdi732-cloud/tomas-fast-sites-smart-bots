/** Знак «Спасай»: тот же зелёный квадрат, что и на иконке приложения. */
export function Logo({ caption }: { caption: string }) {
  return (
    <div className="logo">
      <span className="logo__mark" aria-hidden="true">
        С
      </span>
      <span className="logo__text">
        Спасай
        <small>{caption}</small>
      </span>
    </div>
  );
}
