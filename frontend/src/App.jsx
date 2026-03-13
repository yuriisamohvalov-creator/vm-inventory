import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import { api } from './api'
import Admin from './pages/Admin'
import VMs from './pages/VMs'
import Pools from './pages/Pools'
import Reports from './pages/Reports'

function App() {
  const [authLoading, setAuthLoading] = useState(true)
  const [user, setUser] = useState(null)
  const [login, setLogin] = useState({ username: '', password: '' })
  const [loginError, setLoginError] = useState('')
  const [passwordForm, setPasswordForm] = useState({ current: '', next: '', confirm: '' })
  const [passwordError, setPasswordError] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)

  useEffect(() => {
    const token = api.getAuthToken()
    if (!token) {
      setAuthLoading(false)
      return
    }
    api.auth.me()
      .then((me) => setUser(me))
      .catch(() => {
        api.setAuthToken('')
        setUser(null)
      })
      .finally(() => setAuthLoading(false))
  }, [])

  const onLogin = async (event) => {
    event.preventDefault()
    setLoginError('')
    try {
      const data = await api.auth.login(login.username, login.password)
      setUser(data.user)
      setLogin({ username: '', password: '' })
    } catch (err) {
      setLoginError(err.body?.detail || err.message || 'Не удалось выполнить вход')
    }
  }

  const onLogout = async () => {
    await api.auth.logout()
    setUser(null)
  }

  const onForcePasswordChange = async (event) => {
    event.preventDefault()
    setPasswordError('')
    if (passwordForm.next.length < 8) {
      setPasswordError('Новый пароль должен содержать минимум 8 символов.')
      return
    }
    if (passwordForm.next !== passwordForm.confirm) {
      setPasswordError('Подтверждение пароля не совпадает.')
      return
    }
    setPasswordSaving(true)
    try {
      const updatedUser = await api.auth.changePassword(passwordForm.current, passwordForm.next)
      setUser(updatedUser)
      setPasswordForm({ current: '', next: '', confirm: '' })
    } catch (err) {
      setPasswordError(err.body?.detail || err.body?.error || err.message || 'Не удалось сменить пароль')
    } finally {
      setPasswordSaving(false)
    }
  }

  if (authLoading) {
    return <div className="auth-screen">Проверка сессии...</div>
  }

  if (!user) {
    return (
      <div className="auth-screen">
        <form className="auth-card" onSubmit={onLogin}>
          <h1>VM Inventory</h1>
          <p className="empty-hint" style={{ padding: 0, margin: '0 0 1rem 0' }}>Выполните вход в систему</p>
          <div className="form-group">
            <label>Логин</label>
            <input
              value={login.username}
              onChange={(e) => setLogin((s) => ({ ...s, username: e.target.value }))}
              required
            />
          </div>
          <div className="form-group">
            <label>Пароль</label>
            <input
              type="password"
              value={login.password}
              onChange={(e) => setLogin((s) => ({ ...s, password: e.target.value }))}
              required
            />
          </div>
          {loginError && <p className="error-msg">{loginError}</p>}
          <button type="submit" className="btn">Войти</button>
        </form>
      </div>
    )
  }

  if (user.must_change_password) {
    return (
      <div className="auth-screen">
        <form className="auth-card" onSubmit={onForcePasswordChange}>
          <h1>Смена пароля</h1>
          <p className="empty-hint" style={{ padding: 0, margin: '0 0 1rem 0' }}>
            Для пользователя {user.username} требуется сменить пароль перед началом работы.
          </p>
          <div className="form-group">
            <label>Текущий пароль</label>
            <input
              type="password"
              value={passwordForm.current}
              onChange={(e) => setPasswordForm((s) => ({ ...s, current: e.target.value }))}
              required
            />
          </div>
          <div className="form-group">
            <label>Новый пароль</label>
            <input
              type="password"
              value={passwordForm.next}
              onChange={(e) => setPasswordForm((s) => ({ ...s, next: e.target.value }))}
              required
            />
          </div>
          <div className="form-group">
            <label>Подтверждение нового пароля</label>
            <input
              type="password"
              value={passwordForm.confirm}
              onChange={(e) => setPasswordForm((s) => ({ ...s, confirm: e.target.value }))}
              required
            />
          </div>
          {passwordError && <p className="error-msg">{passwordError}</p>}
          <button type="submit" className="btn" disabled={passwordSaving}>
            {passwordSaving ? 'Сохранение...' : 'Сменить пароль'}
          </button>
          <button type="button" className="btn btn-secondary" style={{ marginLeft: '0.5rem' }} onClick={onLogout}>
            Выйти
          </button>
        </form>
      </div>
    )
  }

  const canWrite = user.role === 'admin'

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
            <div className="sidebar-user-role">{user.role}</div>
            <button type="button" className="btn btn-secondary btn-sm" onClick={onLogout}>Выйти</button>
          </div>
        </aside>
        <main className="main">
          <Routes>
            <Route path="/" element={<VMs canWrite={canWrite} />} />
            <Route path="/pools" element={<Pools canWrite={canWrite} />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/admin" element={<Admin canWrite={canWrite} userRole={user.role} />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}

export default App
