import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import Admin from './pages/Admin'
import VMs from './pages/VMs'
import Pools from './pages/Pools'
import Reports from './pages/Reports'
import Login from './pages/Login'
import { api, getStoredToken, getStoredUser } from './api'

function App() {
  const [user, setUser] = useState(getStoredUser())
  const [loadingUser, setLoadingUser] = useState(!!getStoredToken())

  useEffect(() => {
    if (!getStoredToken()) {
      setLoadingUser(false)
      return
    }

    api.auth.me()
      .then((u) => setUser(u))
      .catch(() => setUser(null))
      .finally(() => setLoadingUser(false))
  }, [])

  if (loadingUser) return <p className="empty-hint">Проверка сессии...</p>
  if (!user) return <Login onLogin={setUser} />

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
            <NavLink to="/reports">Отчеты</NavLink>
            <NavLink to="/admin">Администрирование</NavLink>
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
            <Route path="/" element={<VMs />} />
            <Route path="/pools" element={<Pools />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/admin" element={<Admin />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}

export default App
