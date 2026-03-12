import { useState, useEffect } from 'react'
import { api } from '../api'

const OS_OPTIONS = [
  { value: 'LINUX', label: 'Linux' },
  { value: 'WINDOWS', label: 'Windows' },
  { value: 'MACOS', label: 'MacOS' },
]

const defaultForm = {
  fqdn: '',
  ip: '000.000.000.000',
  cpu: 1,
  ram: 1,
  disk: 10,
  instance: 1,
  info_system: '',
  osTag: 'LINUX',
  customTags: [],
  ba_pfm_zak: 'Z000000',
  ba_pfm_isp: 'Z000000',
  ba_programma_byudzheta: '',
  ba_finansovaya_pozitsiya: '00.00.00.00',
  ba_mir_kod: 'ITI_000_0000',
}

export default function VMs() {
  const [vms, setVms] = useState([])
  const [infoSystems, setInfoSystems] = useState([])
  const [editing, setEditing] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(defaultForm)
  const [customInput, setCustomInput] = useState('')
  const [error, setError] = useState('')
  const [ipWarning, setIpWarning] = useState('')

  const load = () => {
    api.vms.list().then((r) => setVms(r.results || r)).catch(() => setVms([]))
    api.infoSystems.list().then((r) => setInfoSystems(r.results || r)).catch(() => setInfoSystems([]))
  }

  useEffect(() => { load() }, [])

  const list = Array.isArray(vms) ? vms : (vms.results || [])

  const buildTags = () => {
    const isCode = form.info_system
      ? (infoSystems.find((is) => is.id === form.info_system)?.code || '').toString().trim().toUpperCase().replace(/\s/g, '_')
      : ''
    return [form.osTag, isCode, ...form.customTags]
  }

  const validateIP = (ip) => {
    if (!ip || ip.trim() === '') {
      return 'IP адрес обязателен.'
    }
    const ipPattern = /^(\d{1,3}\.){3}\d{1,3}$/
    if (!ipPattern.test(ip)) {
      return 'Неверный формат IP адреса. Ожидается формат: xxx.xxx.xxx.xxx'
    }
    if (ip === '000.000.000.000') {
      return null // Значение по умолчанию допустимо
    }
    const parts = ip.split('.')
    for (const part of parts) {
      const num = parseInt(part, 10)
      if (isNaN(num) || num < 0 || num > 255) {
        return 'Каждый октет IP адреса должен быть от 0 до 255.'
      }
    }
    return null
  }

  const checkIpDuplicate = async (ip) => {
    if (!ip || ip === '000.000.000.000') {
      setIpWarning('')
      return
    }
    try {
      const allVms = await api.vms.list()
      const vmsList = Array.isArray(allVms) ? allVms : (allVms.results || [])
      const duplicate = vmsList.find(vm => vm.ip === ip && (!editing || vm.id !== editing.id))
      if (duplicate) {
        setIpWarning(`ВМ с IP адресом ${ip} уже существует: ${duplicate.fqdn}`)
      } else {
        setIpWarning('')
      }
    } catch (_) {
      setIpWarning('')
    }
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setError('')
    setIpWarning('')
    
    const ipError = validateIP(form.ip)
    if (ipError) {
      setError(ipError)
      return
    }
    
    const payload = {
      fqdn: form.fqdn.trim(),
      ip: form.ip.trim(),
      cpu: Number(form.cpu) || 1,
      ram: Number(form.ram) || 1,
      disk: Number(form.disk) || 10,
      instance: Number(form.instance) || 1,
      info_system: form.info_system || null,
      tags: buildTags(),
      ba_pfm_zak: form.ba_pfm_zak.trim(),
      ba_pfm_isp: form.ba_pfm_isp.trim(),
      ba_programma_byudzheta: form.ba_programma_byudzheta.trim() || null,
      ba_finansovaya_pozitsiya: form.ba_finansovaya_pozitsiya.trim(),
      ba_mir_kod: form.ba_mir_kod.trim(),
    }
    try {
      if (editing) {
        await api.vms.update(editing.id, payload)
      } else {
        await api.vms.create(payload)
      }
      setEditing(null)
      setShowForm(false)
      setForm(defaultForm)
      setCustomInput('')
      setIpWarning('')
      load()
    } catch (err) {
      const errorMsg = err.body?.ip?.[0] || err.body?.fqdn?.[0] || err.body?.tags?.[0] || err.body?.instance?.[0] || err.body?.detail || err.message || 'Ошибка'
      setError(errorMsg)
      if (err.body?.ip?.[0]) {
        setIpWarning(err.body.ip[0])
      }
    }
  }

  const startEdit = (vm) => {
    setEditing(vm)
    setShowForm(true)
    const custom = (vm.tags || []).slice(2)
    const isId = vm.info_system || ''
    setForm({
      fqdn: vm.fqdn,
      ip: vm.ip || '000.000.000.000',
      cpu: vm.cpu,
      ram: vm.ram,
      disk: vm.disk,
      instance: vm.instance,
      info_system: isId,
      osTag: (vm.tags && vm.tags[0]) || 'LINUX',
      customTags: custom,
      ba_pfm_zak: vm.ba_pfm_zak || 'Z000000',
      ba_pfm_isp: vm.ba_pfm_isp || 'Z000000',
      ba_programma_byudzheta: vm.ba_programma_byudzheta || '',
      ba_finansovaya_pozitsiya: vm.ba_finansovaya_pozitsiya || '00.00.00.00',
      ba_mir_kod: vm.ba_mir_kod || 'ITI_000_0000',
    })
    setCustomInput('')
    setIpWarning('')
    checkIpDuplicate(vm.ip || '000.000.000.000')
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

      {!showForm && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="button" className="btn" onClick={() => { setEditing(null); setForm(defaultForm); setCustomInput(''); setShowForm(true); }}>
              Добавить ВМ
            </button>
          </div>
        </div>
      )}

      {showForm && (
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
          <div className="form-group">
            <label>IP адрес</label>
            <input
              value={form.ip}
              onChange={(e) => {
                const newIp = e.target.value
                setForm((f) => ({ ...f, ip: newIp }))
                checkIpDuplicate(newIp)
              }}
              placeholder="000.000.000.000"
              required
            />
            {ipWarning && <p className="error-msg" style={{ marginTop: '0.25rem', fontSize: '0.9rem' }}>{ipWarning}</p>}
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
                <option key={is.id} value={is.id}>{is.name}{is.code ? ` [${is.code}]` : ''} ({is.stream_name})</option>
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
            <label>Тег ИС (код, авто)</label>
            <input
              value={
                form.info_system
                  ? (infoSystems.find((is) => is.id === form.info_system)?.code || '').toString().trim().toUpperCase().replace(/\s/g, '_') || '—'
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

          <h4 style={{ marginTop: '1.5rem', marginBottom: '1rem' }}>Бюджетный учет</h4>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <div className="form-group">
              <label>БА.ПФМ_зак</label>
              <input
                value={form.ba_pfm_zak}
                onChange={(e) => setForm((f) => ({ ...f, ba_pfm_zak: e.target.value }))}
                placeholder="Z000000"
                required
              />
            </div>
            <div className="form-group">
              <label>БА.ПФМ_исп</label>
              <input
                value={form.ba_pfm_isp}
                onChange={(e) => setForm((f) => ({ ...f, ba_pfm_isp: e.target.value }))}
                placeholder="Z000000"
                required
              />
            </div>
            <div className="form-group">
              <label>БА.Программа_бюджета</label>
              <input
                value={form.ba_programma_byudzheta}
                onChange={(e) => setForm((f) => ({ ...f, ba_programma_byudzheta: e.target.value }))}
                placeholder="Необязательно"
              />
            </div>
            <div className="form-group">
              <label>БА.Финансовая_позиция</label>
              <input
                value={form.ba_finansovaya_pozitsiya}
                onChange={(e) => setForm((f) => ({ ...f, ba_finansovaya_pozitsiya: e.target.value }))}
                placeholder="00.00.00.00"
                required
              />
            </div>
            <div className="form-group">
              <label>БА.Mir-код</label>
              <input
                value={form.ba_mir_kod}
                onChange={(e) => setForm((f) => ({ ...f, ba_mir_kod: e.target.value }))}
                placeholder="ITI_000_0000"
                required
              />
            </div>
          </div>
          {error && <p className="error-msg">{error}</p>}
          <button type="submit" className="btn">{editing ? 'Сохранить' : 'Создать'}</button>
          <button type="button" className="btn btn-secondary" style={{ marginLeft: '0.5rem' }} onClick={() => { setEditing(null); setForm(defaultForm); setShowForm(false); }}>
            Отмена
          </button>
        </form>
      </div>
      )}

      <div className="card">
        <div className="table-wrap">
          <div style={{ overflowX: 'auto' }}>
            <table style={{ minWidth: '1000px', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ position: 'sticky', left: 0, background: 'white', zIndex: 1, minWidth: '250px' }}>FQDN</th>
                  <th style={{ minWidth: '150px' }}>Департамент</th>
                  <th style={{ minWidth: '150px' }}>Стрим</th>
                  <th style={{ minWidth: '150px' }}>IP</th>
                  <th style={{ minWidth: '100px' }}>CPU</th>
                  <th style={{ minWidth: '100px' }}>RAM</th>
                  <th style={{ minWidth: '100px' }}>Диск</th>
                  <th style={{ minWidth: '100px' }}>Instance</th>
                  <th style={{ minWidth: '150px' }}>ИС</th>
                  <th style={{ minWidth: '200px' }}>Код ИС</th>
                  <th style={{ minWidth: '150px' }}>БА.ПФМ_зак</th>
                  <th style={{ minWidth: '150px' }}>БА.ПФМ_исп</th>
                  <th style={{ minWidth: '200px' }}>БА.Программа_бюджета</th>
                  <th style={{ minWidth: '180px' }}>БА.Финансовая_позиция</th>
                  <th style={{ minWidth: '180px' }}>БА.Mir-код</th>
                  <th style={{ minWidth: '250px' }}>Теги</th>
                  <th style={{ position: 'sticky', right: 0, background: 'white', zIndex: 1, minWidth: '150px' }}>Действия</th>
                </tr>
              </thead>
              <tbody>
                {list
                  .sort((a, b) => {
                    // Sort by department first
                    const deptA = a.department_name || 'ZZZ'
                    const deptB = b.department_name || 'ZZZ'
                    if (deptA !== deptB) return deptA.localeCompare(deptB)

                    // Then by stream
                    const streamA = a.stream_name || 'ZZZ'
                    const streamB = b.stream_name || 'ZZZ'
                    return streamA.localeCompare(streamB)
                  })
                  .map((vm) => (
                    <tr key={vm.id}>
                      <td style={{ position: 'sticky', left: 0, background: 'white', minWidth: '250px' }}>{vm.fqdn}</td>
                      <td style={{ minWidth: '150px' }}>{vm.department_name || '—'}</td>
                      <td style={{ minWidth: '150px' }}>{vm.stream_name || '—'}</td>
                      <td style={{ minWidth: '150px' }}>{vm.ip || '000.000.000.000'}</td>
                      <td style={{ minWidth: '100px' }}>{vm.cpu}</td>
                      <td style={{ minWidth: '100px' }}>{vm.ram}</td>
                      <td style={{ minWidth: '100px' }}>{vm.disk}</td>
                      <td style={{ minWidth: '100px' }}>{vm.instance}</td>
                      <td style={{ minWidth: '150px' }}>{vm.info_system_name || '—'}</td>
                      <td style={{ minWidth: '200px' }}>{vm.info_system_code || '—'}</td>
                      <td style={{ minWidth: '150px' }}>{vm.ba_pfm_zak || 'Z000000'}</td>
                      <td style={{ minWidth: '150px' }}>{vm.ba_pfm_isp || 'Z000000'}</td>
                      <td style={{ minWidth: '200px' }}>{vm.ba_programma_byudzheta || '—'}</td>
                      <td style={{ minWidth: '180px' }}>{vm.ba_finansovaya_pozitsiya || '00.00.00.00'}</td>
                      <td style={{ minWidth: '180px' }}>{vm.ba_mir_kod || 'ITI_000_0000'}</td>
                      <td style={{ minWidth: '250px' }}>
                        <div className="tags-row">
                          {(vm.tags || []).map((t) => (
                            <span key={t} className="badge">{t}</span>
                          ))}
                        </div>
                      </td>
                      <td style={{ position: 'sticky', right: 0, background: 'white', minWidth: '150px' }}>
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
      </div>
    </>
  )
}
