import { useState, useEffect } from 'react'
import { api } from '../api'

const OS = ['LINUX', 'WINDOWS', 'MACOS']

export default function Admin() {
  const [departments, setDepartments] = useState([])
  const [streams, setStreams] = useState([])
  const [infoSystems, setInfoSystems] = useState([])
  const [tab, setTab] = useState('departments')
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ name: '', short_name: '', department: '', stream: '', code: '', is_id: '' })
  const [error, setError] = useState('')
  const [expandedDepts, setExpandedDepts] = useState(() => new Set())
  const [expandedStreams, setExpandedStreams] = useState(() => new Set())

  const toggleDept = (id) => setExpandedDepts((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const toggleStream = (id) => setExpandedStreams((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

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
        if (editing) await api.departments.update(editing.id, { name: form.name, short_name: form.short_name })
        else await api.departments.create({ name: form.name, short_name: form.short_name })
      } else if (tab === 'streams') {
        if (editing) await api.streams.update(editing.id, { name: form.name, department: form.department })
        else await api.streams.create({ name: form.name, department: form.department })
      } else {
        if (editing) await api.infoSystems.update(editing.id, { name: form.name, code: form.code, is_id: form.is_id, stream: form.stream })
        else await api.infoSystems.create({ name: form.name, code: form.code, is_id: form.is_id, stream: form.stream })
      }
      setEditing(null)
      setForm({ name: '', short_name: '', department: '', stream: '', code: '', is_id: '' })
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
    if (t === 'departments') setForm({ name: item.name, short_name: item.short_name || '', department: '', stream: '', code: '' })
    else if (t === 'streams') setForm({ name: item.name, short_name: '', department: item.department, stream: '', code: '' })
    else setForm({ name: item.name, short_name: '', department: '', stream: item.stream, code: item.code || '', is_id: item.is_id || '' })
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
              onClick={() => { setTab(t); setEditing(null); setForm({ name: '', short_name: '', department: '', stream: '', code: '', is_id: '' }); }}
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
          {tab === 'departments' && (
            <div className="form-group">
              <label>Краткое название</label>
              <input
                value={form.short_name}
                onChange={(e) => setForm((f) => ({ ...f, short_name: e.target.value }))}
              />
            </div>
          )}
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
            <>
              <div className="form-group">
                <label>Код ИС</label>
                <input
                  value={form.code}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                  placeholder="Код информационной системы"
                />
              </div>
              <div className="form-group">
                <label>IS ID</label>
                <input
                  value={form.is_id}
                  onChange={(e) => setForm((f) => ({ ...f, is_id: e.target.value }))}
                  placeholder="Идентификатор ИС"
                />
              </div>
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
            </>
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
          <div className="admin-tree">
            <p className="empty-hint" style={{ marginBottom: '0.75rem' }}>Дерево: Департамент → Стрим → ИС. Нажмите на строку для раскрытия/скрытия.</p>
            {departments.map((d) => (
              <div key={d.id} className="tree-node">
                <div
                  className="tree-row tree-row-dept"
                  onClick={() => toggleDept(d.id)}
                >
                  <span className="tree-toggle">{expandedDepts.has(d.id) ? '▼' : '▶'}</span>
                  <span>{d.name}</span>
                  {d.short_name && <span className="tree-muted"> ({d.short_name})</span>}
                  <span className="tree-actions" onClick={(e) => e.stopPropagation()}>
                    <button type="button" className="btn btn-sm btn-secondary" onClick={() => startEdit(d, 'departments')}>Изменить</button>
                    <button type="button" className="btn btn-sm btn-danger" style={{ marginLeft: '0.5rem' }} onClick={() => handleDelete('departments', d.id)}>Удалить</button>
                  </span>
                </div>
                {expandedDepts.has(d.id) && streams.filter((s) => s.department === d.id).map((s) => (
                  <div key={s.id} className="tree-child">
                    <div
                      className="tree-row tree-row-stream"
                      onClick={() => toggleStream(s.id)}
                    >
                      <span className="tree-toggle">{expandedStreams.has(s.id) ? '▼' : '▶'}</span>
                      <span>{s.name}</span>
                      <span className="tree-actions" onClick={(e) => e.stopPropagation()}>
                        <button type="button" className="btn btn-sm btn-secondary" onClick={() => startEdit(s, 'streams')}>Изменить</button>
                        <button type="button" className="btn btn-sm btn-danger" style={{ marginLeft: '0.5rem' }} onClick={() => handleDelete('streams', s.id)}>Удалить</button>
                      </span>
                    </div>
                    {expandedStreams.has(s.id) && infoSystems.filter((is) => is.stream === s.id).map((isys) => (
                      <div key={isys.id} className="tree-child tree-row tree-row-is">
                        <span className="tree-toggle tree-toggle-empty" />
                        <span>{isys.name}</span>
                        {isys.code && <span className="tree-muted"> [{isys.code}]</span>}
                        <span className="tree-actions">
                          <button type="button" className="btn btn-sm btn-secondary" onClick={() => startEdit(isys, 'info-systems')}>Изменить</button>
                          <button type="button" className="btn btn-sm btn-danger" style={{ marginLeft: '0.5rem' }} onClick={() => handleDelete('info-systems', isys.id)}>Удалить</button>
                        </span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
        {tab === 'streams' && (
          <div className="admin-tree">
            <p className="empty-hint" style={{ marginBottom: '0.75rem' }}>Дерево: Стрим → ИС. Нажмите на строку для раскрытия/скрытия.</p>
            {streams.map((s) => (
              <div key={s.id} className="tree-node">
                <div
                  className="tree-row tree-row-stream"
                  onClick={() => toggleStream(s.id)}
                >
                  <span className="tree-toggle">{expandedStreams.has(s.id) ? '▼' : '▶'}</span>
                  <span>{s.name}</span>
                  <span className="tree-muted"> — {departments.find((d) => d.id === s.department)?.name || ''}</span>
                  <span className="tree-actions" onClick={(e) => e.stopPropagation()}>
                    <button type="button" className="btn btn-sm btn-secondary" onClick={() => startEdit(s, 'streams')}>Изменить</button>
                    <button type="button" className="btn btn-sm btn-danger" style={{ marginLeft: '0.5rem' }} onClick={() => handleDelete('streams', s.id)}>Удалить</button>
                  </span>
                </div>
                {expandedStreams.has(s.id) && infoSystems.filter((is) => is.stream === s.id).map((isys) => (
                  <div key={isys.id} className="tree-child tree-row tree-row-is">
                    <span className="tree-toggle tree-toggle-empty" />
                    <span>{isys.name}</span>
                    {isys.code && <span className="tree-muted"> [{isys.code}]</span>}
                    <span className="tree-actions">
                      <button type="button" className="btn btn-sm btn-secondary" onClick={() => startEdit(isys, 'info-systems')}>Изменить</button>
                      <button type="button" className="btn btn-sm btn-danger" style={{ marginLeft: '0.5rem' }} onClick={() => handleDelete('info-systems', isys.id)}>Удалить</button>
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
        {tab === 'info-systems' && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Название</th><th>Код</th><th>IS ID</th><th>Стрим</th><th></th></tr>
              </thead>
              <tbody>
                {infoSystems.map((isys) => (
                  <tr key={isys.id}>
                    <td>{isys.name}</td>
                    <td>{isys.code || '—'}</td>
                    <td>{isys.is_id || '—'}</td>
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
