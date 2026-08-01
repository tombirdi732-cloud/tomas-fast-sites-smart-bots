import { NavLink, Navigate, Route, Routes } from 'react-router-dom';

import { BoxesPage } from './pages/BoxesPage';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';
import { OrdersPage } from './pages/OrdersPage';
import { RegisterMerchantPage } from './pages/RegisterMerchantPage';
import { ReviewsPage } from './pages/ReviewsPage';
import { useSession } from './lib/session';

const NAV = [
  ['/', 'Дашборд'],
  ['/boxes', 'Боксы'],
  ['/orders', 'Заказы'],
  ['/reviews', 'Отзывы'],
] as const;

export function App() {
  const { me, merchant, loading, logout } = useSession();

  if (loading) {
    return (
      <div className="centered">
        <span className="muted">Загружаем…</span>
      </div>
    );
  }

  if (!me) return <LoginPage />;
  if (!merchant) return <RegisterMerchantPage />;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="logo">
          Спасай
          <small>панель заведения</small>
        </div>

        <nav className="nav">
          {NAV.map(([path, label]) => (
            <NavLink
              key={path}
              to={path}
              end={path === '/'}
              className={({ isActive }) => (isActive ? 'is-active' : '')}
            >
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar__foot">
          <span>
            {me.name ?? me.phone}
            <br />
            {merchant.title}
          </span>
          <button className="btn btn--ghost btn--small" type="button" onClick={logout}>
            Выйти
          </button>
        </div>
      </aside>

      <main className="main">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/boxes" element={<BoxesPage />} />
          <Route path="/orders" element={<OrdersPage />} />
          <Route path="/reviews" element={<ReviewsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
