import { useState, useEffect } from 'react'
import { api } from '../api'

const OS_OPTIONS = [
  { value: 'LINUX', label: 'Linux' },
  { value: 'WINDOWS', label: 'Windows' },
  { value: 'MACOS', label: 'MacOS' },
]

const defaultForm = {
  fqdn: '',
  cpu: 1,
  ram: 1,
  disk: 10,
  instance: 1,
  info_system: '',
  osTag: 'LINUX',
  customTags: [],
}

export default function VMs() {
  const [vms, setVms] = useState([])
  const [infoSystems, setInfoSystems] = useState([])
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(defaultForm)
  const [customInput, setCustomInput] = useState('')
  const [error, setError] = useState('')

  const load = () => {
    api.vms.list().then((r) => setVms(r.results || r)).catch(() => setVms([]))
    api.infoSystems.list().then((r) => setInfoSystems(r.results || r)).catch(() => setInfoSystems([]))
  }

  useEffect(() => { load() }, [])

  const list = Array.isArray(vms) ? vms : (vms.results || [])

  const buildTags = () => {
    const isName = form.info_system
      ? (infoSystems.find((is) => is.id === form.info_system)?.name || '').toUpperCase().replace(/\s/g, '_')
      : ''
    return [form.osTag, isName, ...form.customTags]
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setError('')
    const payload = {
      fqdn: form.fqdn.trim(),
      cpu: Number(form.cpu) || 1,
      ram: Number(form.ram) || 1,
      disk: Number(form.disk) || 10,
      instance: Number(form.instance) || 1,
      info_system: form.info_system || null,
      tags: buildTags(),
    }
    try {
      if (editing) {
        await api.vms.update(editing.id, payload)
      } else {
        await api.vms.create(payload)
      }
      setEditing(null)
      setForm(defaultForm)
      setCustomInput('')
      load()
    } catch (err) {
      setError(err.body?.fqdn?.[0] || err.body?.tags?.[0] || err.body?.instance?.[0] || err.body?.detail || err.message || 'Ошибка')
    }
  }

  const startEdit = (vm) => {
    setEditing(vm)
    const custom = (vm.tags || []).slice(2)
    const isId = vm.info_system || ''
    setForm({
      fqdn: vm.fqdn,
      cpu: vm.cpu,
      ram: vm.ram,
      disk: vm.disk,
      instance: vm.instance,
      info_system: isId,
      osTag: (vm.tags && vm.tags[0]) || 'LINUX',
      customTags: custom,
    })
    setCustomInput('')
  }

  const addCustomTag = () => {
    const t = customInput.trim().toUpperCase().replace(/\s/g, '_')
    if (t && !form.customTags.includes(t)) setForm((f) => ({ ...f, customTags: [...f.customTags, t] }))
    setCustomInput('')
  }

  const removeCustomTag = (t) => {
    setForm((f) => ({ ...f, customTags: f.customTags.filter((x) => x !== t) }))
  }

  return (
    <>
      <h1 className="page-title">Виртуальные машины</h1>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>{editing ? 'Редактировать ВМ' : 'Добавить ВМ'}</h3>
        <form onSubmit={handleSave}>
          <div className="form-group">
            <label>FQDN</label>
            <input
              value={form.fqdn}
              onChange={(e) => setForm((f) => ({ ...f, fqdn: e.target.value }))}
              placeholder="p0ppor-agc001lk.inno.local"
              required
            />
          </div>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <div className="form-group">
              <label>CPU (ядра)</label>
              <input type="number" min={1} value={form.cpu} onChange={(e) => setForm((f) => ({ ...f, cpu: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>RAM (ГБ)</label>
              <input type="number" min={1} value={form.ram} onChange={(e) => setForm((f) => ({ ...f, ram: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Диск (ГБ)</label>
              <input type="number" min={1} value={form.disk} onChange={(e) => setForm((f) => ({ ...f, disk: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Instance (1–20)</label>
              <select value={form.instance} onChange={(e) => setForm((f) => ({ ...f, instance: Number(e.target.value) }))}>
                {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label>Информационная система</label>
            <select
              value={form.info_system}
              onChange={(e) => setForm((f) => ({ ...f, info_system: e.target.value || '' }))}
            >
              <option value="">— не выбрана —</option>
              {infoSystems.map((is) => (
                <option key={is.id} value={is.id}>{is.name} ({is.stream_name})</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>ОС (тег)</label>
            <div style={{ display: 'flex', gap: '1rem' }}>
              {OS_OPTIONS.map((o) => (
                <label key={o.value}>
                  <input
                    type="radio"
                    name="os"
                    value={o.value}
                    checked={form.osTag === o.value}
                    onChange={() => setForm((f) => ({ ...f, osTag: o.value }))}
                  /> {o.label}
                </label>
              ))}
            </div>
          </div>
          <div className="form-group">
            <label>Тег ИС (авто)</label>
            <input
              value={
                form.info_system
                  ? (infoSystems.find((is) => is.id === form.info_system)?.name || '').toUpperCase().replace(/\s/g, '_')
                  : '—'
              }
              disabled
            />
          </div>
          <div className="form-group">
            <label>Кастомные теги</label>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCustomTag())}
                placeholder="Введите тег и нажмите Добавить"
                style={{ maxWidth: 280 }}
              />
              <button type="button" className="btn btn-secondary" onClick={addCustomTag}>Добавить</button>
            </div>
            <div className="tags-row" style={{ marginTop: '0.5rem' }}>
              {form.customTags.map((t) => (
                <span key={t} className="badge">
                  {t}
                  <button type="button" onClick={() => removeCustomTag(t)} aria-label="Удалить">×</button>
                </span>
              ))}
            </div>
          </div>
          {error && <p className="error-msg">{error}</p>}
          <button type="submit" className="btn">{editing ? 'Сохранить' : 'Создать'}</button>
          {editing && (
            <button type="button" className="btn btn-secondary" style={{ marginLeft: '0.5rem' }} onClick={() => { setEditing(null); setForm(defaultForm); }}>
              Отмена
            </button>
          )}
        </form>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>FQDN</th>
                <th>CPU</th>
                <th>RAM</th>
                <th>Диск</th>
                <th>Instance</th>
                <th>ИС</th>
                <th>Теги</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.map((vm) => (
                <tr key={vm.id}>
                  <td>{vm.fqdn}</td>
                  <td>{vm.cpu}</td>
                  <td>{vm.ram}</td>
                  <td>{vm.disk}</td>
                  <td>{vm.instance}</td>
                  <td>{vm.info_system_name || '—'}</td>
                  <td>
                    <div className="tags-row">
                      {(vm.tags || []).map((t) => (
                        <span key={t} className="badge">{t}</span>
                      ))}
                    </div>
                  </td>
                  <td>
                    <button className="btn btn-sm btn-secondary" onClick={() => startEdit(vm)}>Редактировать</button>
                    <button
                      className="btn btn-sm btn-danger"
                      style={{ marginLeft: '0.5rem' }}
                      onClick={async () => {
                        if (!confirm('Удалить ВМ?')) return
                        try {
                          await api.vms.delete(vm.id)
                          load()
                        } catch (_) {}
                      }}
                    >
                      Удалить
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
