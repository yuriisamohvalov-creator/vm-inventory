import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import Admin from './pages/Admin'
import VMs from './pages/VMs'
import Pools from './pages/Pools'
import Reports from './pages/Reports'
import Requests from './pages/Requests'
import Login from './pages/Login'
import { api, getStoredToken, getStoredUser } from './api'

/**
 * Корневой компонент SPA.
 *
 * Назначение:
 * - восстанавливает пользовательскую сессию по токену;
 * - отображает экран логина, если сессии нет;
 * - управляет маршрутизацией между разделами приложения.
 *
 * Взаимодействия:
 * - `api.auth.me()` проверяет токен и возвращает профиль пользователя;
 * - `api.auth.logout()` инвалидирует сессию на сервере и очищает локальные данные;
 * - `BrowserRouter` и `Routes` обеспечивают навигацию внутри SPA.
 */
function App() {
  /** Храним данные текущего пользователя между рендерами. */
  const [user, setUser] = useState(getStoredUser())
  /** Пока есть токен, показываем индикатор проверки сессии. */
  const [loadingUser, setLoadingUser] = useState(!!getStoredToken())

  useEffect(() => {
    // Если токена нет, проверять сессию на сервере не требуется.
    if (!getStoredToken()) {
      setLoadingUser(false)
      return
    }

    // Проверяем действительность токена и загружаем профиль.
    api.auth.me()
      .then((u) => setUser(u))
      .catch(() => setUser(null))
      .finally(() => setLoadingUser(false))
  }, [])

  if (loadingUser) return <p className="empty-hint">Проверка сессии...</p>
  if (!user) return <Login onLogin={setUser} />

  // Признак прав на изменение данных (CRUD).
  const canWrite = user.is_superuser || (user.roles || []).includes('administrator')

  /**
   * Выход из системы.
   * Сначала пробуем завершить сессию на сервере, затем очищаем локальный стейт.
   */
  const handleLogout = async () => {
    await api.auth.logout()
    setUser(null)
  }

  return (
    <BrowserRouter>
      <div className="app">
        <aside className="sidebar">
          <h1>VM Inventory</h1>
          <nav>
            <NavLink to="/" end>Виртуальные машины</NavLink>
            <NavLink to="/pools">Общие пулы</NavLink>
            <NavLink to="/requests">Заявки</NavLink>
            <NavLink to="/reports">Отчеты</NavLink>
            <NavLink to="/admin">Администрирование</NavLink>
            {/* Swagger и пользовательские инструкции открываются в новой вкладке,
                чтобы не прерывать рабочий процесс в основном интерфейсе. */}
            <a href="/instructions/index.html" target="_blank" rel="noopener noreferrer">Инструкции</a>
            <a href="/api/docs/" target="_blank" rel="noopener noreferrer">API Swagger</a>
          </nav>
          <div className="sidebar-user">
            <div className="sidebar-user-name">{user.username}</div>
            <div className="sidebar-user-role">{(user.role_labels || []).join(', ') || 'Без роли'}</div>
            <button type="button" className="btn btn-secondary btn-sm" onClick={handleLogout}>
              Выйти
            </button>
          </div>
        </aside>
        <main className="main">
          <Routes>
            <Route path="/" element={<VMs canWrite={canWrite} />} />
            <Route path="/pools" element={<Pools canWrite={canWrite} />} />
            <Route path="/requests" element={<Requests />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/admin" element={<Admin canWrite={canWrite} userRole={(user.roles || [])[0] || ''} />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}

export default App
