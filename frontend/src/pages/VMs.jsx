import { Fragment, useState, useEffect } from 'react'
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

export default function VMs({ canWrite = false }) {
  const [vms, setVms] = useState([])
  const [departments, setDepartments] = useState([])
  const [streams, setStreams] = useState([])
  const [infoSystems, setInfoSystems] = useState([])
  const [editing, setEditing] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(defaultForm)
  const [customInput, setCustomInput] = useState('')
  const [error, setError] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [ipWarning, setIpWarning] = useState('')

  const load = () => {
    api.vms.list().then((r) => setVms(r.results || r)).catch(() => setVms([]))
    api.departments.list().then((r) => setDepartments(r.results || r)).catch(() => setDepartments([]))
    api.streams.list().then((r) => setStreams(r.results || r)).catch(() => setStreams([]))
    api.infoSystems.list().then((r) => setInfoSystems(r.results || r)).catch(() => setInfoSystems([]))
  }

  useEffect(() => { load() }, [])


  // Group VMs by Department -> Stream -> Info System
  const groupVmsForTable = () => {
    const grouped = {}

    const vmsWithInfo = vms.map(vm => {
      let departmentId = null
      let streamId = null
      let infoSystemId = null
      let departmentName = 'Без департамента'
      let streamName = 'Без стрима'
      let infoSystemName = 'Без ИС'

      if (vm.info_system) {
        infoSystemId = vm.info_system
        const infoSystem = infoSystems.find(is => is.id === vm.info_system)
        if (infoSystem) {
          infoSystemName = infoSystem.name
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
        infoSystemId,
        departmentName,
        streamName,
        infoSystemName,
      }
    })

    vmsWithInfo.forEach(vm => {
      if (!grouped[vm.departmentId]) {
        grouped[vm.departmentId] = {
          departmentName: vm.departmentName,
          streams: {},
        }
      }

      if (!grouped[vm.departmentId].streams[vm.streamId]) {
        grouped[vm.departmentId].streams[vm.streamId] = {
          streamName: vm.streamName,
          infoSystems: {},
        }
      }

      if (!grouped[vm.departmentId].streams[vm.streamId].infoSystems[vm.infoSystemId]) {
        grouped[vm.departmentId].streams[vm.streamId].infoSystems[vm.infoSystemId] = {
          infoSystemName: vm.infoSystemName,
          vms: [],
        }
      }

      grouped[vm.departmentId].streams[vm.streamId].infoSystems[vm.infoSystemId].vms.push(vm)
    })

    return grouped
  }

  const groupedVms = groupVmsForTable()
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

      {!showForm && canWrite && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="button" className="btn" onClick={() => { setEditing(null); setForm(defaultForm); setCustomInput(''); setShowForm(true); }}>
              Добавить ВМ
            </button>
          </div>
        </div>
      )}

      {showForm && canWrite && (
      <div className="card">
        <h3 style={{ marginTop: 0 }}>{editing ? 'Редактировать ВМ' : 'Добавить ВМ'}</h3>
        <form onSubmit={handleSave}>
          <div className="form-row">
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
          <div className="form-row">
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

          <div className="form-row">
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
        {deleteError && <p className="error-msg">{deleteError}</p>}
        <div className="table-wrap">
          <table className="vm-grouped-table">
            <thead>
              <tr>
                <th>FQDN</th>
                <th>IP адрес</th>
                <th>CPU</th>
                <th>RAM</th>
                <th>Диск</th>
                <th>Instance</th>
                <th>Теги</th>
                <th>БА.ПФМ_зак</th>
                <th>БА.ПФМ_исп</th>
                <th>БА.Финансовая_позиция</th>
                <th>БА.Mir-код</th>
                <th>БА.Программа_бюджета</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(groupedVms).map(([departmentId, departmentData]) => (
                <Fragment key={`dept-${departmentId}`}>
                  <tr className="vm-group-row vm-group-row-department">
                    <td colSpan={13}>{departmentData.departmentName}</td>
                  </tr>
                  {Object.entries(departmentData.streams).map(([streamId, streamData]) => (
                    <Fragment key={`stream-${departmentId}-${streamId}`}>
                      <tr className="vm-group-row vm-group-row-stream">
                        <td colSpan={13}>{streamData.streamName}</td>
                      </tr>
                      {Object.entries(streamData.infoSystems).map(([infoSystemId, infoSystemData]) => (
                        <Fragment key={`is-${departmentId}-${streamId}-${infoSystemId}`}>
                          <tr className="vm-group-row vm-group-row-is">
                            <td colSpan={13}>{infoSystemData.infoSystemName}</td>
                          </tr>
                          {infoSystemData.vms.map((vm) => (
                            <tr key={vm.id}>
                              <td>{vm.fqdn}</td>
                              <td>{vm.ip || '000.000.000.000'}</td>
                              <td>{vm.cpu}</td>
                              <td>{vm.ram}</td>
                              <td>{vm.disk}</td>
                              <td>{vm.instance}</td>
                              <td>
                                <div className="tags-row">
                                  {(vm.tags || []).map((t) => (
                                    <span key={t} className="badge">{t}</span>
                                  ))}
                                </div>
                              </td>
                              <td>{vm.ba_pfm_zak || '—'}</td>
                              <td>{vm.ba_pfm_isp || '—'}</td>
                              <td>{vm.ba_finansovaya_pozitsiya || '—'}</td>
                              <td>{vm.ba_mir_kod || '—'}</td>
                              <td>{vm.ba_programma_byudzheta || '—'}</td>
                              <td>
                                <button className="btn btn-sm btn-secondary" onClick={() => startEdit(vm)}>Редактировать</button>
                                <button
                                  className="btn btn-sm btn-danger"
                                  style={{ marginLeft: '0.5rem' }}
                                  onClick={async () => {
                                    if (!confirm('Удалить ВМ?')) return
                                    setDeleteError('')
                                    try {
                                      await api.vms.delete(vm.id)
                                      load()
                                    } catch (err) {
                                      const msg = err.body?.detail || err.body?.error || err.message || 'Не удалось удалить ВМ'
                                      setDeleteError(msg)
                                    }
                                  }}
                                >
                                  Удалить
                                </button>
                              </td>
                            </tr>
                          ))}
                        </Fragment>
                      ))}
                    </Fragment>
                  ))}
                </Fragment>
              ))}
              {list.length === 0 && (
                <tr>
                  <td colSpan={13} className="empty-hint">Список ВМ пуст</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
