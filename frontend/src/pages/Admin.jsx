import { useState, useEffect } from 'react'
import { api } from '../api'

const OS = ['LINUX', 'WINDOWS', 'MACOS']

export default function Admin() {
  const [departments, setDepartments] = useState([])
  const [streams, setStreams] = useState([])
  const [infoSystems, setInfoSystems] = useState([])
  const [tab, setTab] = useState('departments')
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ name: '', department: '', stream: '' })
  const [error, setError] = useState('')

  const toList = (r) => (Array.isArray(r?.results) ? r.results : Array.isArray(r) ? r : [])

  const load = () => {
    api.departments.list().then((r) => setDepartments(toList(r))).catch(() => setDepartments([]))
    api.streams.list().then((r) => setStreams(toList(r))).catch(() => setStreams([]))
    api.infoSystems.list().then((r) => setInfoSystems(toList(r))).catch(() => setInfoSystems([]))
  }

  useEffect(() => { load() }, [])

  const handleSave = async (e) => {
    e.preventDefault()
    setError('')
    try {
      if (tab === 'departments') {
        if (editing) await api.departments.update(editing.id, { name: form.name })
        else await api.departments.create({ name: form.name })
      } else if (tab === 'streams') {
        if (editing) await api.streams.update(editing.id, { name: form.name, department: form.department })
        else await api.streams.create({ name: form.name, department: form.department })
      } else {
        if (editing) await api.infoSystems.update(editing.id, { name: form.name, stream: form.stream })
        else await api.infoSystems.create({ name: form.name, stream: form.stream })
      }
      setEditing(null)
      setForm({ name: '', department: '', stream: '' })
      load()
    } catch (err) {
      setError(err.body?.name?.[0] || err.body?.detail || err.message || 'Ошибка')
    }
  }

  const handleDelete = async (tabName, id) => {
    if (!confirm('Удалить?')) return
    setError('')
    try {
      if (tabName === 'departments') await api.departments.delete(id)
      else if (tabName === 'streams') await api.streams.delete(id)
      else await api.infoSystems.delete(id)
      load()
      if (editing?.id === id) setEditing(null)
    } catch (err) {
      setError(err.body?.detail || err.message || 'Не удалось удалить (возможно, есть зависимости)')
    }
  }

  const startEdit = (item, t) => {
    setTab(t)
    setEditing(item)
    if (t === 'departments') setForm({ name: item.name, department: '', stream: '' })
    else if (t === 'streams') setForm({ name: item.name, department: item.department, stream: '' })
    else setForm({ name: item.name, department: '', stream: item.stream })
  }

  return (
    <>
      <h1 className="page-title">Администрирование</h1>
      <div className="card">
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
          {['departments', 'streams', 'info-systems'].map((t) => (
            <button
              key={t}
              type="button"
              className={tab === t ? 'btn' : 'btn btn-secondary'}
              onClick={() => { setTab(t); setEditing(null); setForm({ name: '', department: '', stream: '' }); }}
            >
              {t === 'departments' && 'Департаменты'}
              {t === 'streams' && 'Стримы'}
              {t === 'info-systems' && 'ИС'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSave}>
          <div className="form-group">
            <label>Название</label>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
            />
          </div>
          {tab === 'streams' && (
            <div className="form-group">
              <label>Департамент</label>
              <select
                value={form.department}
                onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
                required
              >
                <option value="">—</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
          )}
          {tab === 'info-systems' && (
            <div className="form-group">
              <label>Стрим</label>
              <select
                value={form.stream}
                onChange={(e) => setForm((f) => ({ ...f, stream: e.target.value }))}
                required
              >
                <option value="">—</option>
                {streams.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          )}
          {error && <p className="error-msg">{error}</p>}
          <button type="submit" className="btn">{editing ? 'Сохранить' : 'Создать'}</button>
          {editing && (
            <button type="button" className="btn btn-secondary" style={{ marginLeft: '0.5rem' }} onClick={() => setEditing(null)}>
              Отмена
            </button>
          )}
        </form>
      </div>

      <div className="card">
        {tab === 'departments' && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Название</th><th></th></tr>
              </thead>
              <tbody>
                {departments.map((d) => (
                  <tr key={d.id}>
                    <td>{d.name}</td>
                    <td>
                      <button className="btn btn-sm btn-secondary" onClick={() => startEdit(d, 'departments')}>Изменить</button>
                      <button className="btn btn-sm btn-danger" style={{ marginLeft: '0.5rem' }} onClick={() => handleDelete('departments', d.id)}>Удалить</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {tab === 'streams' && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Название</th><th>Департамент</th><th></th></tr>
              </thead>
              <tbody>
                {streams.map((s) => (
                  <tr key={s.id}>
                    <td>{s.name}</td>
                    <td>{s.department_name}</td>
                    <td>
                      <button className="btn btn-sm btn-secondary" onClick={() => startEdit(s, 'streams')}>Изменить</button>
                      <button className="btn btn-sm btn-danger" style={{ marginLeft: '0.5rem' }} onClick={() => handleDelete('streams', s.id)}>Удалить</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {tab === 'info-systems' && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Название</th><th>Стрим</th><th></th></tr>
              </thead>
              <tbody>
                {infoSystems.map((isys) => (
                  <tr key={isys.id}>
                    <td>{isys.name}</td>
                    <td>{isys.stream_name}</td>
                    <td>
                      <button className="btn btn-sm btn-secondary" onClick={() => startEdit(isys, 'info-systems')}>Изменить</button>
                      <button className="btn btn-sm btn-danger" style={{ marginLeft: '0.5rem' }} onClick={() => handleDelete('info-systems', isys.id)}>Удалить</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
