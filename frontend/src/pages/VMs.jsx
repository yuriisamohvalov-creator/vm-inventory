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
  const [departments, setDepartments] = useState([])
  const [streams, setStreams] = useState([])
  const [infoSystems, setInfoSystems] = useState([])
  const [editing, setEditing] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(defaultForm)
  const [customInput, setCustomInput] = useState('')
  const [error, setError] = useState('')
  const [ipWarning, setIpWarning] = useState('')
  const [expandedDepartments, setExpandedDepartments] = useState({})
  const [expandedStreams, setExpandedStreams] = useState({})

  const load = () => {
    api.vms.list().then((r) => setVms(r.results || r)).catch(() => setVms([]))
    api.departments.list().then((r) => setDepartments(r.results || r)).catch(() => setDepartments([]))
    api.streams.list().then((r) => setStreams(r.results || r)).catch(() => setStreams([]))
    api.infoSystems.list().then((r) => setInfoSystems(r.results || r)).catch(() => setInfoSystems([]))
  }

  useEffect(() => { load() }, [])


  const toggleDepartment = (departmentId) => {
    setExpandedDepartments(prev => ({ ...prev, [departmentId]: !prev[departmentId] }))
  }

  const toggleStream = (streamId) => {
    setExpandedStreams(prev => ({ ...prev, [streamId]: !prev[streamId] }))
  }

  // Group VMs by Department -> Stream
  const groupVmsByDepartmentAndStream = () => {
    const grouped = {}

    // First, get department and stream info for each VM
    const vmsWithInfo = vms.map(vm => {
      let departmentId = null
      let streamId = null
      let departmentName = 'Без департамента'
      let streamName = 'Без стрима'

      if (vm.info_system) {
        const infoSystem = infoSystems.find(is => is.id === vm.info_system)
        if (infoSystem) {
          streamId = infoSystem.stream
          const stream = streams.find(s => s.id === streamId)
          if (stream) {
            streamName = stream.name
            departmentId = stream.department
            const department = departments.find(d => d.id === departmentId)
            if (department) {
              departmentName = department.name
            }
          }
        }
      }

      return {
        ...vm,
        departmentId,
        streamId,
        departmentName,
        streamName
      }
    })

    // Group by department
    vmsWithInfo.forEach(vm => {
      if (!grouped[vm.departmentId]) {
        grouped[vm.departmentId] = {
          departmentName: vm.departmentName,
          streams: {}
        }
      }

      if (!grouped[vm.departmentId].streams[vm.streamId]) {
        grouped[vm.departmentId].streams[vm.streamId] = {
          streamName: vm.streamName,
          vms: []
        }
      }

      grouped[vm.departmentId].streams[vm.streamId].vms.push(vm)
    })

    return grouped
  }

  const groupedVms = groupVmsByDepartmentAndStream()
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
      ba_pfm_zak: form.ba_pfm_zak,
      ba_pfm_isp: form.ba_pfm_isp,
      ba_programma_byudzheta: form.ba_programma_byudzheta || null,
      ba_finansovaya_pozitsiya: form.ba_finansovaya_pozitsiya,
      ba_mir_kod: form.ba_mir_kod,
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
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
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
          </div>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
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
          </div>

          <h4 style={{ margin: '1.5rem 0 0.5rem 0', color: '#666' }}>Бюджетный учет</h4>

          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <div className="form-group">
              <label>БА.ПФМ_зак</label>
              <input
                value={form.ba_pfm_zak}
                onChange={(e) => setForm((f) => ({ ...f, ba_pfm_zak: e.target.value }))}
                placeholder="Z662908"
                required
              />
            </div>
            <div className="form-group">
              <label>БА.ПФМ_исп</label>
              <input
                value={form.ba_pfm_isp}
                onChange={(e) => setForm((f) => ({ ...f, ba_pfm_isp: e.target.value }))}
                placeholder="Z662906"
                required
              />
            </div>
            <div className="form-group">
              <label>БА.Программа_бюджета</label>
              <input
                value={form.ba_programma_byudzheta}
                onChange={(e) => setForm((f) => ({ ...f, ba_programma_byudzheta: e.target.value }))}
                placeholder="Необязательное поле"
              />
            </div>
            <div className="form-group">
              <label>БА.Финансовая_позиция</label>
              <input
                value={form.ba_finansovaya_pozitsiya}
                onChange={(e) => setForm((f) => ({ ...f, ba_finansovaya_pozitsiya: e.target.value }))}
                placeholder="05.03.03.01"
                required
              />
            </div>
            <div className="form-group">
              <label>БА.Mir-код</label>
              <input
                value={form.ba_mir_kod}
                onChange={(e) => setForm((f) => ({ ...f, ba_mir_kod: e.target.value }))}
                placeholder="ITI_075_1505"
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
        <div className="vms-hierarchy">
          {Object.entries(groupedVms).map(([departmentId, departmentData]) => (
            <div key={departmentId} className="department-section">
              <div
                className="department-header"
                onClick={() => toggleDepartment(departmentId)}
              >
                <span className="tree-toggle">
                  {expandedDepartments[departmentId] ? '▼' : '▶'}
                </span>
                <h3 style={{ margin: 0 }}>{departmentData.departmentName}</h3>
              </div>

              {expandedDepartments[departmentId] && (
                <div className="streams-container">
                  {Object.entries(departmentData.streams).map(([streamId, streamData]) => (
                    <div key={streamId} className="stream-section">
                      <div
                        className="stream-header"
                        onClick={() => toggleStream(streamId)}
                      >
                        <span className="tree-toggle">
                          {expandedStreams[streamId] ? '▼' : '▶'}
                        </span>
                        <h4 style={{ margin: 0 }}>{streamData.streamName}</h4>
                      </div>

                      {expandedStreams[streamId] && (
                        <div className="vms-container">
                          {streamData.vms.map((vm) => (
                            <div key={vm.id} className="vm-card">
                              <div className="vm-card-header">
                                <h4 style={{ margin: 0 }}>{vm.fqdn}</h4>
                                <div>
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
                                </div>
                              </div>

                              <div className="vm-details">
                                <table>
                                  <tbody>
                                    <tr>
                                      <td>IP адрес:</td>
                                      <td>{vm.ip || '000.000.000.000'}</td>
                                    </tr>
                                    <tr>
                                      <td>CPU:</td>
                                      <td>{vm.cpu} ядер</td>
                                    </tr>
                                    <tr>
                                      <td>RAM:</td>
                                      <td>{vm.ram} ГБ</td>
                                    </tr>
                                    <tr>
                                      <td>Диск:</td>
                                      <td>{vm.disk} ГБ</td>
                                    </tr>
                                    <tr>
                                      <td>Instance:</td>
                                      <td>{vm.instance}</td>
                                    </tr>
                                    <tr>
                                      <td>Информационная система:</td>
                                      <td>{vm.info_system_name || '—'}</td>
                                    </tr>
                                    <tr>
                                      <td>Теги:</td>
                                      <td>
                                                        <div className="tags-row">
                                                          {(vm.tags || []).map((t) => (
                                                            <span key={t} className="badge">{t}</span>
                                                          ))}
                                                        </div>
                                                      </td>
                                    </tr>
                                    <tr>
                                      <td>БА.ПФМ_зак:</td>
                                      <td>{vm.ba_pfm_zak}</td>
                                    </tr>
                                    <tr>
                                      <td>БА.ПФМ_исп:</td>
                                      <td>{vm.ba_pfm_isp}</td>
                                    </tr>
                                    <tr>
                                      <td>БА.Программа_бюджета:</td>
                                      <td>{vm.ba_programma_byudzheta || '—'}</td>
                                    </tr>
                                    <tr>
                                      <td>БА.Финансовая_позиция:</td>
                                      <td>{vm.ba_finansovaya_pozitsiya}</td>
                                    </tr>
                                    <tr>
                                      <td>БА.Mir-код:</td>
                                      <td>{vm.ba_mir_kod}</td>
                                    </tr>
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
