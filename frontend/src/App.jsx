import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import Admin from './pages/Admin'
import VMs from './pages/VMs'
import Pools from './pages/Pools'
import Reports from './pages/Reports'

function App() {
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
            <a href="/swagger/" target="_blank" rel="noopener noreferrer">API Swagger</a>
          </nav>
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
