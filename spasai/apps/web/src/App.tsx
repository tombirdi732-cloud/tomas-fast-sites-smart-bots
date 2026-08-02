import { NavLink, Navigate, Route, Routes } from 'react-router-dom';

import { AdminMerchantsPage } from './pages/AdminMerchantsPage';
import { BoxesPage } from './pages/BoxesPage';
import { DashboardPage } from './pages/DashboardPage';
import { Logo } from './components/Logo';
import { LoginPage } from './pages/LoginPage';
import { OrdersPage } from './pages/OrdersPage';
import { RegisterMerchantPage } from './pages/RegisterMerchantPage';
import { ReviewsPage } from './pages/ReviewsPage';
import { StaffPage } from './pages/StaffPage';
import { useSession } from './lib/session';

const MERCHANT_NAV = [
  ['/', 'Дашборд'],
  ['/boxes', 'Боксы'],
  ['/orders', 'Заказы'],
  ['/reviews', 'Отзывы'],
  ['/staff', 'Сотрудники'],
] as const;

const ADMIN_NAV = [['/admin/merchants', 'Заведения']] as const;

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

  const isAdmin = me.role === 'admin';
  // Админ платформы может не быть привязан ни к одному заведению — ему
  // нужна модерация, а не форма регистрации точки.
  if (!merchant && !isAdmin) return <RegisterMerchantPage />;

  const home = merchant ? '/' : '/admin/merchants';

  return (
    <div className="shell">
      <aside className="sidebar">
        <Logo caption={merchant ? 'панель заведения' : 'админка платформы'} />

        <nav className="nav">
          {merchant &&
            MERCHANT_NAV.map(([path, label]) => (
              <NavLink
                key={path}
                to={path}
                end={path === '/'}
                className={({ isActive }) => (isActive ? 'is-active' : '')}
              >
                {label}
              </NavLink>
            ))}

          {isAdmin && (
            <>
              <div className="nav__group">Платформа</div>
              {ADMIN_NAV.map(([path, label]) => (
                <NavLink
                  key={path}
                  to={path}
                  className={({ isActive }) => (isActive ? 'is-active' : '')}
                >
                  {label}
                </NavLink>
              ))}
            </>
          )}
        </nav>

        <div className="sidebar__foot">
          <span>
            {me.name ?? me.phone}
            {merchant && (
              <>
                <br />
                {merchant.title}
              </>
            )}
          </span>
          <button className="btn btn--ghost btn--small" type="button" onClick={logout}>
            Выйти
          </button>
        </div>
      </aside>

      <main className="main">
        <Routes>
          {merchant && (
            <>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/boxes" element={<BoxesPage />} />
              <Route path="/orders" element={<OrdersPage />} />
              <Route path="/reviews" element={<ReviewsPage />} />
              <Route path="/staff" element={<StaffPage />} />
            </>
          )}
          {isAdmin && <Route path="/admin/merchants" element={<AdminMerchantsPage />} />}
          <Route path="*" element={<Navigate to={home} replace />} />
        </Routes>
      </main>
    </div>
  );
}
