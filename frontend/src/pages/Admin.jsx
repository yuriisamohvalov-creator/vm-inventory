import { useState, useEffect } from 'react'
import { api } from '../api'
const INITIAL_FORM = {
  name: '',
  short_name: '',
  department: '',
  stream: '',
  code: '',
  is_id: '',
  cpu_quota: 0,
  ram_quota: 0,
  disk_quota: 0,
}
const INITIAL_USER_FORM = {
  username: '',
  password: '',
  role: 'analyst',
  is_active: true,
  must_change_password: false,
}

export default function Admin({ canWrite = false, userRole = '' }) {
  const [departments, setDepartments] = useState([])
  const [streams, setStreams] = useState([])
  const [infoSystems, setInfoSystems] = useState([])
  const [tab, setTab] = useState('departments')
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ ...INITIAL_FORM })
  const [error, setError] = useState('')
  const [importFile, setImportFile] = useState(null)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState('')
  const [importResult, setImportResult] = useState(null)
  const [expandedDepts, setExpandedDepts] = useState(() => new Set())
  const [expandedStreams, setExpandedStreams] = useState(() => new Set())
  const [users, setUsers] = useState([])
  const [userEditing, setUserEditing] = useState(null)
  const [userForm, setUserForm] = useState({ ...INITIAL_USER_FORM })

  const toggleDept = (id) => setExpandedDepts((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const toggleStream = (id) => setExpandedStreams((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  const toList = (r) => (Array.isArray(r?.results) ? r.results : Array.isArray(r) ? r : [])
  const toNum = (value) => Number(value) || 0

  const getStreamQuotaSums = (departmentId) => streams
    .filter((s) => s.department === departmentId)
    .reduce((acc, s) => ({
      cpu: acc.cpu + toNum(s.cpu_quota),
      ram: acc.ram + toNum(s.ram_quota),
      disk: acc.disk + toNum(s.disk_quota),
    }), { cpu: 0, ram: 0, disk: 0 })

  const getDepartmentStreamSums = (department) => ({
    cpu: toNum(department.streams_cpu_quota_sum ?? getStreamQuotaSums(department.id).cpu),
    ram: toNum(department.streams_ram_quota_sum ?? getStreamQuotaSums(department.id).ram),
    disk: toNum(department.streams_disk_quota_sum ?? getStreamQuotaSums(department.id).disk),
  })

  const selectedDepartmentSums = tab === 'departments' && editing
    ? getDepartmentStreamSums(editing)
    : { cpu: 0, ram: 0, disk: 0 }
  const hasDepartmentQuotaWarning = tab === 'departments' && editing && (
    selectedDepartmentSums.cpu > toNum(form.cpu_quota) ||
    selectedDepartmentSums.ram > toNum(form.ram_quota) ||
    selectedDepartmentSums.disk > toNum(form.disk_quota)
  )

  const load = () => {
    api.departments.list().then((r) => setDepartments(toList(r))).catch(() => setDepartments([]))
    api.streams.list().then((r) => setStreams(toList(r))).catch(() => setStreams([]))
    api.infoSystems.list().then((r) => setInfoSystems(toList(r))).catch(() => setInfoSystems([]))
    if (canWrite) {
      api.auth.users.list().then((r) => setUsers(Array.isArray(r) ? r : [])).catch(() => setUsers([]))
    }
  }

  useEffect(() => { load() }, [])

  const handleSave = async (e) => {
    e.preventDefault()
    if (!canWrite) return
    if (tab === 'users') {
      return handleUserSave()
    }
    setError('')
    try {
      if (tab === 'departments') {
        const payload = {
          name: form.name,
          short_name: form.short_name,
          cpu_quota: Number(form.cpu_quota) || 0,
          ram_quota: Number(form.ram_quota) || 0,
          disk_quota: Number(form.disk_quota) || 0,
        }
        if (editing) await api.departments.update(editing.id, payload)
        else await api.departments.create(payload)
      } else if (tab === 'streams') {
        const payload = {
          name: form.name,
          department: form.department,
          cpu_quota: toNum(form.cpu_quota),
          ram_quota: toNum(form.ram_quota),
          disk_quota: toNum(form.disk_quota),
        }
        if (editing) await api.streams.update(editing.id, payload)
        else await api.streams.create(payload)
      } else {
        if (editing) await api.infoSystems.update(editing.id, { name: form.name, code: form.code, is_id: form.is_id, stream: form.stream })
        else await api.infoSystems.create({ name: form.name, code: form.code, is_id: form.is_id, stream: form.stream })
      }
      setEditing(null)
      setForm({ ...INITIAL_FORM })
      load()
    } catch (err) {
      setError(err.body?.name?.[0] || err.body?.detail || err.message || 'Ошибка')
    }
  }

  const handleBulkImport = async () => {
    setImportError('')
    setImportResult(null)
    if (!importFile) {
      setImportError('Выберите файл импорта (.json)')
      return
    }
    setImporting(true)
    try {
      const r = await api.import.bulkFromFile(importFile)
      setImportResult(r)
      load()
    } catch (err) {
      setImportError(err.body?.error || err.body?.detail || err.message || 'Ошибка импорта')
    } finally {
      setImporting(false)
    }
  }

  const handleDelete = async (tabName, id) => {
    if (!canWrite) return
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
    if (t === 'departments') setForm({
      name: item.name,
      short_name: item.short_name || '',
      department: '',
      stream: '',
      code: '',
      is_id: '',
      cpu_quota: item.cpu_quota || 0,
      ram_quota: item.ram_quota || 0,
      disk_quota: item.disk_quota || 0,
    })
    else if (t === 'streams') setForm({
      name: item.name,
      short_name: '',
      department: item.department,
      stream: '',
      code: '',
      is_id: '',
      cpu_quota: item.cpu_quota || 0,
      ram_quota: item.ram_quota || 0,
      disk_quota: item.disk_quota || 0,
    })
    else setForm({ name: item.name, short_name: '', department: '', stream: item.stream, code: item.code || '', is_id: item.is_id || '', cpu_quota: 0, ram_quota: 0, disk_quota: 0 })
  }

  const startUserEdit = (user) => {
    setTab('users')
    setUserEditing(user)
    setUserForm({
      username: user.username,
      password: '',
      role: user.role || 'analyst',
      is_active: user.is_active !== false,
      must_change_password: user.must_change_password === true,
    })
    setError('')
  }

  const handleUserSave = async () => {
    setError('')
    try {
      if (!userEditing) {
        if (!userForm.username.trim()) {
          setError('Логин обязателен.')
          return
        }
        if (!userForm.password.trim()) {
          setError('Пароль обязателен.')
          return
        }
        await api.auth.users.create({
          username: userForm.username.trim(),
          password: userForm.password,
          role: userForm.role,
          is_active: userForm.is_active,
          must_change_password: userForm.must_change_password,
        })
      } else {
        const payload = {
          role: userForm.role,
          is_active: userForm.is_active,
          must_change_password: userForm.must_change_password,
        }
        if (userForm.password.trim()) {
          payload.password = userForm.password
        }
        await api.auth.users.update(userEditing.id, payload)
      }
      setUserEditing(null)
      setUserForm({ ...INITIAL_USER_FORM })
      load()
    } catch (err) {
      setError(err.body?.error || err.body?.detail || err.message || 'Ошибка при сохранении пользователя')
    }
  }

  return (
    <>
      <h1 className="page-title">Администрирование</h1>
      {!canWrite && (
        <p className="empty-hint" style={{ padding: 0, marginTop: '-1rem' }}>
          Роль {userRole}: доступ только на чтение.
        </p>
      )}
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Массовый импорт (JSON)</h3>

        <div className="form-group">
          <label>Файл импорта</label>
          <input
            type="file"
            accept="application/json,.json"
            onChange={(e) => setImportFile(e.target.files?.[0] || null)}
          />
          <p className="empty-hint" style={{ marginTop: '0.5rem' }}>
            Ожидается JSON-объект с ключами `departments`, `streams`, `info_systems`, `vms` (необязательно все).
            Для VМ: обязательно поле `fqdn` и привязка к ИС через `info_system` (nested) или `info_system_id`.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="btn" disabled={importing} onClick={handleBulkImport}>
            {importing ? 'Импортирую...' : 'Импортировать'}
          </button>
          {importFile && <span className="empty-hint">Файл: {importFile.name}</span>}
        </div>

        {importError && <p className="error-msg" style={{ marginTop: '0.75rem' }}>{importError}</p>}

        {importResult && (
          <div style={{ marginTop: '0.75rem' }}>
            <p className="empty-hint" style={{ margin: 0 }}>Результат импорта:</p>
            <pre style={{ background: '#111', color: '#eee', padding: '0.75rem', overflow: 'auto', borderRadius: 8 }}>
              {JSON.stringify(importResult, null, 2)}
            </pre>
          </div>
        )}
      </div>

      <div className="card">
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
          {['departments', 'streams', 'info-systems', ...(canWrite ? ['users'] : [])].map((t) => (
            <button
              key={t}
              type="button"
              className={tab === t ? 'btn' : 'btn btn-secondary'}
              onClick={() => {
                setTab(t)
                setEditing(null)
                setUserEditing(null)
                setForm({ ...INITIAL_FORM })
                setUserForm({ ...INITIAL_USER_FORM })
                setError('')
              }}
            >
              {t === 'departments' && 'Департаменты'}
              {t === 'streams' && 'Стримы'}
              {t === 'info-systems' && 'ИС'}
              {t === 'users' && 'Пользователи'}
            </button>
          ))}
        </div>

        {canWrite && (
          <form onSubmit={handleSave}>
            {tab !== 'users' && (
              <div className="form-group">
                <label>Название</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  required
                />
              </div>
            )}
            {tab === 'departments' && (
              <>
                <div className="form-group">
                  <label>Краткое название</label>
                  <input
                    value={form.short_name}
                    onChange={(e) => setForm((f) => ({ ...f, short_name: e.target.value }))}
                  />
                </div>
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                  <div className="form-group">
                    <label>Квота CPU</label>
                    <input
                      type="number"
                      min={0}
                      value={form.cpu_quota}
                      onChange={(e) => setForm((f) => ({ ...f, cpu_quota: e.target.value }))}
                    />
                  </div>
                  <div className="form-group">
                    <label>Квота RAM (ГБ)</label>
                    <input
                      type="number"
                      min={0}
                      value={form.ram_quota}
                      onChange={(e) => setForm((f) => ({ ...f, ram_quota: e.target.value }))}
                    />
                  </div>
                  <div className="form-group">
                    <label>Квота DISK (ГБ)</label>
                    <input
                      type="number"
                      min={0}
                      value={form.disk_quota}
                      onChange={(e) => setForm((f) => ({ ...f, disk_quota: e.target.value }))}
                    />
                  </div>
                </div>
                {editing && (
                  <>
                    <p className="empty-hint" style={{ marginTop: 0 }}>
                      Сумма квот входящих стримов: CPU {selectedDepartmentSums.cpu}, RAM {selectedDepartmentSums.ram}, DISK {selectedDepartmentSums.disk}
                    </p>
                    {hasDepartmentQuotaWarning && (
                      <p className="warning-msg">
                        Сумма квот стримов превышает введённую квоту департамента. Сохранение разрешено.
                      </p>
                    )}
                  </>
                )}
              </>
            )}
            {tab === 'streams' && (
              <>
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
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                  <div className="form-group">
                    <label>Квота CPU</label>
                    <input
                      type="number"
                      min={0}
                      value={form.cpu_quota}
                      onChange={(e) => setForm((f) => ({ ...f, cpu_quota: e.target.value }))}
                    />
                  </div>
                  <div className="form-group">
                    <label>Квота RAM (ГБ)</label>
                    <input
                      type="number"
                      min={0}
                      value={form.ram_quota}
                      onChange={(e) => setForm((f) => ({ ...f, ram_quota: e.target.value }))}
                    />
                  </div>
                  <div className="form-group">
                    <label>Квота DISK (ГБ)</label>
                    <input
                      type="number"
                      min={0}
                      value={form.disk_quota}
                      onChange={(e) => setForm((f) => ({ ...f, disk_quota: e.target.value }))}
                    />
                  </div>
                </div>
              </>
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
            {tab === 'users' && (
              <>
                <div className="form-group">
                  <label>Логин</label>
                  <input
                    value={userForm.username}
                    onChange={(e) => setUserForm((f) => ({ ...f, username: e.target.value }))}
                    disabled={Boolean(userEditing)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>{userEditing ? 'Новый пароль (опционально)' : 'Пароль'}</label>
                  <input
                    type="password"
                    value={userForm.password}
                    onChange={(e) => setUserForm((f) => ({ ...f, password: e.target.value }))}
                    placeholder={userEditing ? 'Оставьте пустым, чтобы не менять' : 'Минимум 8 символов'}
                    required={!userEditing}
                  />
                </div>
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                  <div className="form-group">
                    <label>Роль</label>
                    <select
                      value={userForm.role}
                      onChange={(e) => setUserForm((f) => ({ ...f, role: e.target.value }))}
                    >
                      <option value="admin">admin</option>
                      <option value="analyst">analyst</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Статус</label>
                    <select
                      value={userForm.is_active ? 'active' : 'inactive'}
                      onChange={(e) => setUserForm((f) => ({ ...f, is_active: e.target.value === 'active' }))}
                    >
                      <option value="active">active</option>
                      <option value="inactive">inactive</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Смена пароля при входе</label>
                    <select
                      value={userForm.must_change_password ? 'yes' : 'no'}
                      onChange={(e) => setUserForm((f) => ({ ...f, must_change_password: e.target.value === 'yes' }))}
                    >
                      <option value="yes">да</option>
                      <option value="no">нет</option>
                    </select>
                  </div>
                </div>
              </>
            )}
            {error && <p className="error-msg">{error}</p>}
            <button type="submit" className="btn">
              {tab === 'users' ? (userEditing ? 'Сохранить пользователя' : 'Создать пользователя') : (editing ? 'Сохранить' : 'Создать')}
            </button>
            {(editing || userEditing) && (
              <button
                type="button"
                className="btn btn-secondary"
                style={{ marginLeft: '0.5rem' }}
                onClick={() => {
                  setEditing(null)
                  setUserEditing(null)
                  setForm({ ...INITIAL_FORM })
                  setUserForm({ ...INITIAL_USER_FORM })
                }}
              >
                Отмена
              </button>
            )}
          </form>
        )}
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
                  <span className="tree-muted">
                    {' '}| Квота D: CPU {toNum(d.cpu_quota)}, RAM {toNum(d.ram_quota)}, DISK {toNum(d.disk_quota)}
                  </span>
                  <span className="tree-muted">
                    {' '}| Квота стримов: CPU {getDepartmentStreamSums(d).cpu}, RAM {getDepartmentStreamSums(d).ram}, DISK {getDepartmentStreamSums(d).disk}
                  </span>
                  {(d.quota_exceeded || (
                    getDepartmentStreamSums(d).cpu > toNum(d.cpu_quota) ||
                    getDepartmentStreamSums(d).ram > toNum(d.ram_quota) ||
                    getDepartmentStreamSums(d).disk > toNum(d.disk_quota)
                  )) && <span className="warning-msg-inline"> Превышение квот департамента</span>}
                  {canWrite && (
                    <span className="tree-actions" onClick={(e) => e.stopPropagation()}>
                      <button type="button" className="btn btn-sm btn-secondary" onClick={() => startEdit(d, 'departments')}>Изменить</button>
                      <button type="button" className="btn btn-sm btn-danger" style={{ marginLeft: '0.5rem' }} onClick={() => handleDelete('departments', d.id)}>Удалить</button>
                    </span>
                  )}
                </div>
                {expandedDepts.has(d.id) && streams.filter((s) => s.department === d.id).map((s) => (
                  <div key={s.id} className="tree-child">
                    <div
                      className="tree-row tree-row-stream"
                      onClick={() => toggleStream(s.id)}
                    >
                      <span className="tree-toggle">{expandedStreams.has(s.id) ? '▼' : '▶'}</span>
                      <span>{s.name}</span>
                      <span className="tree-muted">
                        {' '}| Квота: CPU {toNum(s.cpu_quota)}, RAM {toNum(s.ram_quota)}, DISK {toNum(s.disk_quota)}
                      </span>
                      {canWrite && (
                        <span className="tree-actions" onClick={(e) => e.stopPropagation()}>
                          <button type="button" className="btn btn-sm btn-secondary" onClick={() => startEdit(s, 'streams')}>Изменить</button>
                          <button type="button" className="btn btn-sm btn-danger" style={{ marginLeft: '0.5rem' }} onClick={() => handleDelete('streams', s.id)}>Удалить</button>
                        </span>
                      )}
                    </div>
                    {expandedStreams.has(s.id) && infoSystems.filter((is) => is.stream === s.id).map((isys) => (
                      <div key={isys.id} className="tree-child tree-row tree-row-is">
                        <span className="tree-toggle tree-toggle-empty" />
                        <span>{isys.name}</span>
                        {isys.code && <span className="tree-muted"> [{isys.code}]</span>}
                        {canWrite && (
                          <span className="tree-actions">
                            <button type="button" className="btn btn-sm btn-secondary" onClick={() => startEdit(isys, 'info-systems')}>Изменить</button>
                            <button type="button" className="btn btn-sm btn-danger" style={{ marginLeft: '0.5rem' }} onClick={() => handleDelete('info-systems', isys.id)}>Удалить</button>
                          </span>
                        )}
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
                  <span className="tree-muted"> | Квота: CPU {toNum(s.cpu_quota)}, RAM {toNum(s.ram_quota)}, DISK {toNum(s.disk_quota)}</span>
                  {canWrite && (
                    <span className="tree-actions" onClick={(e) => e.stopPropagation()}>
                      <button type="button" className="btn btn-sm btn-secondary" onClick={() => startEdit(s, 'streams')}>Изменить</button>
                      <button type="button" className="btn btn-sm btn-danger" style={{ marginLeft: '0.5rem' }} onClick={() => handleDelete('streams', s.id)}>Удалить</button>
                    </span>
                  )}
                </div>
                {expandedStreams.has(s.id) && infoSystems.filter((is) => is.stream === s.id).map((isys) => (
                  <div key={isys.id} className="tree-child tree-row tree-row-is">
                    <span className="tree-toggle tree-toggle-empty" />
                    <span>{isys.name}</span>
                    {isys.code && <span className="tree-muted"> [{isys.code}]</span>}
                    {canWrite && (
                      <span className="tree-actions">
                        <button type="button" className="btn btn-sm btn-secondary" onClick={() => startEdit(isys, 'info-systems')}>Изменить</button>
                        <button type="button" className="btn btn-sm btn-danger" style={{ marginLeft: '0.5rem' }} onClick={() => handleDelete('info-systems', isys.id)}>Удалить</button>
                      </span>
                    )}
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
                      {canWrite ? (
                        <>
                          <button className="btn btn-sm btn-secondary" onClick={() => startEdit(isys, 'info-systems')}>Изменить</button>
                          <button className="btn btn-sm btn-danger" style={{ marginLeft: '0.5rem' }} onClick={() => handleDelete('info-systems', isys.id)}>Удалить</button>
                        </>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {tab === 'users' && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Логин</th><th>Роль</th><th>Статус</th><th>Смена пароля</th><th></th></tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.username}</td>
                    <td>{u.role}</td>
                    <td>{u.is_active ? 'active' : 'inactive'}</td>
                    <td>{u.must_change_password ? 'да' : 'нет'}</td>
                    <td>
                      <button className="btn btn-sm btn-secondary" onClick={() => startUserEdit(u)}>
                        Изменить
                      </button>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={5} className="empty-hint">Пользователи не найдены</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
