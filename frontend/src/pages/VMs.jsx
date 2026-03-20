import { Fragment, useState, useEffect, useMemo } from 'react'
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
  request_number: '',
  contractor_task_number: '',
  request_date: '',
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
  const [deleteModal, setDeleteModal] = useState({ open: false, vm: null, request_number: '', contractor_task_number: '', request_date: '' })

  const toIsoDate = (ddmmyyyy) => {
    const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec((ddmmyyyy || '').trim())
    if (!m) return ''
    return `${m[3]}-${m[2]}-${m[1]}`
  }

  const toRuDate = (iso) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((iso || '').trim())
    if (!m) return ''
    return `${m[3]}.${m[2]}.${m[1]}`
  }

  const isValidRuDate = (value) => {
    if (!value) return true
    const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value.trim())
    if (!m) return false
    const day = Number(m[1])
    const month = Number(m[2])
    const year = Number(m[3])
    const date = new Date(year, month - 1, day)
    return date.getFullYear() === year && date.getMonth() === (month - 1) && date.getDate() === day
  }

  const formatDateTime = (value) => {
    if (!value) return '—'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '—'
    return date.toLocaleString('ru-RU')
  }

  const load = () => {
    api.vms.list().then((r) => setVms(r.results || r)).catch(() => setVms([]))
    api.departments.list().then((r) => setDepartments(r.results || r)).catch(() => setDepartments([]))
    api.streams.list().then((r) => setStreams(r.results || r)).catch(() => setStreams([]))
    api.infoSystems.list().then((r) => setInfoSystems(r.results || r)).catch(() => setInfoSystems([]))
  }

  useEffect(() => { load() }, [])


  const vmIpIndex = useMemo(() => {
    const index = new Map()
    for (const vm of (Array.isArray(vms) ? vms : [])) {
      if (vm?.ip) index.set(vm.ip, vm)
    }
    return index
  }, [vms])

  // Group VMs by Department -> Stream -> Info System
  const groupVmsForTable = useMemo(() => {
    const grouped = {}
    const infoSystemById = new Map(infoSystems.map((it) => [it.id, it]))
    const streamById = new Map(streams.map((it) => [it.id, it]))
    const departmentById = new Map(departments.map((it) => [it.id, it]))

    const vmsWithInfo = vms.map(vm => {
      let departmentId = null
      let streamId = null
      let infoSystemId = null
      let departmentName = 'Без департамента'
      let streamName = 'Без стрима'
      let infoSystemName = 'Без ИС'

      if (vm.info_system) {
        infoSystemId = vm.info_system
        const infoSystem = infoSystemById.get(vm.info_system)
        if (infoSystem) {
          infoSystemName = infoSystem.name
          streamId = infoSystem.stream
          const stream = streamById.get(streamId)
          if (stream) {
            streamName = stream.name
            departmentId = stream.department
            const department = departmentById.get(departmentId)
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
  }, [departments, infoSystems, streams, vms])

  const groupedVms = groupVmsForTable
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
      const duplicate = vmIpIndex.get(ip)
      if (duplicate && (!editing || duplicate.id !== editing.id)) {
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
    if (!isValidRuDate(form.request_date)) {
      setError('Дата заявки должна быть в формате dd.mm.yyyy')
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
      let savedVm
      if (editing) {
        savedVm = await api.vms.update(editing.id, payload)
      } else {
        savedVm = await api.vms.create(payload)
      }
      if (form.request_number || form.contractor_task_number || form.request_date) {
        await api.vms.requests.create({
          vm: savedVm.id,
          request_type: editing ? 'UPDATE' : 'CREATE',
          request_number: form.request_number || '',
          contractor_task_number: form.contractor_task_number || '',
          request_date: form.request_date || null,
        })
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
      request_number: '',
      contractor_task_number: '',
      request_date: '',
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

  const openDeleteModal = (vm) => {
    setDeleteModal({
      open: true,
      vm,
      request_number: '',
      contractor_task_number: '',
      request_date: '',
    })
  }

  const closeDeleteModal = () => {
    setDeleteModal({ open: false, vm: null, request_number: '', contractor_task_number: '', request_date: '' })
  }

  const confirmDeleteVm = async () => {
    if (!deleteModal.vm) return
    if (!isValidRuDate(deleteModal.request_date)) {
      setDeleteError('Дата заявки должна быть в формате dd.mm.yyyy')
      return
    }
    setDeleteError('')
    try {
      await api.vms.requests.create({
        vm: deleteModal.vm.id,
        request_type: 'DELETE',
        request_number: deleteModal.request_number || '',
        contractor_task_number: deleteModal.contractor_task_number || '',
        request_date: deleteModal.request_date || null,
      })
      await api.vms.delete(deleteModal.vm.id)
      closeDeleteModal()
      load()
    } catch (err) {
      const msg = err.body?.detail || err.body?.error || err.message || 'Не удалось удалить ВМ'
      setDeleteError(msg)
    }
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
          <h4 style={{ margin: '1.5rem 0 0.5rem 0', color: '#666' }}>Реквизиты заявки</h4>
          <div className="form-row">
            <div className="form-group">
              <label>Заявка</label>
              <input
                value={form.request_number}
                onChange={(e) => setForm((f) => ({ ...f, request_number: e.target.value }))}
                placeholder="Номер заявки"
              />
            </div>
            <div className="form-group">
              <label>Задача</label>
              <input
                value={form.contractor_task_number}
                onChange={(e) => setForm((f) => ({ ...f, contractor_task_number: e.target.value }))}
                placeholder="Номер задачи"
              />
            </div>
            <div className="form-group">
              <label>Дата (dd.mm.yyyy)</label>
              <input
                value={form.request_date}
                onChange={(e) => setForm((f) => ({ ...f, request_date: e.target.value }))}
                placeholder="31.12.2026"
              />
              <div style={{ marginTop: '0.4rem' }}>
                <input
                  type="date"
                  value={toIsoDate(form.request_date)}
                  onChange={(e) => setForm((f) => ({ ...f, request_date: toRuDate(e.target.value) }))}
                />
              </div>
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
                <th>Статус</th>
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
                <th>Создана</th>
                <th>Изменена</th>
                <th>Удалена</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(groupedVms).map(([departmentId, departmentData]) => (
                <Fragment key={`dept-${departmentId}`}>
                  <tr className="vm-group-row vm-group-row-department">
                    <td colSpan={17}>{departmentData.departmentName}</td>
                  </tr>
                  {Object.entries(departmentData.streams).map(([streamId, streamData]) => (
                    <Fragment key={`stream-${departmentId}-${streamId}`}>
                      <tr className="vm-group-row vm-group-row-stream">
                        <td colSpan={17}>{streamData.streamName}</td>
                      </tr>
                      {Object.entries(streamData.infoSystems).map(([infoSystemId, infoSystemData]) => (
                        <Fragment key={`is-${departmentId}-${streamId}-${infoSystemId}`}>
                          <tr className="vm-group-row vm-group-row-is">
                            <td colSpan={17}>{infoSystemData.infoSystemName}</td>
                          </tr>
                          {infoSystemData.vms.map((vm) => (
                            <tr key={vm.id}>
                              <td>{vm.fqdn}</td>
                              <td>{vm.ip || '000.000.000.000'}</td>
                              <td>{vm.is_active ? 'Активна' : 'Удалена'}</td>
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
                              <td>{formatDateTime(vm.created_at)}</td>
                              <td>{formatDateTime(vm.updated_at)}</td>
                              <td>{formatDateTime(vm.deleted_at)}</td>
                              <td>
                                <button className="btn btn-sm btn-secondary" disabled={!vm.is_active} onClick={() => startEdit(vm)}>Редактировать</button>
                                <button
                                  className="btn btn-sm btn-danger"
                                  style={{ marginLeft: '0.5rem' }}
                                  disabled={!vm.is_active}
                                  onClick={() => openDeleteModal(vm)}
                                >
                                  Удалить
                                </button>
                                <button
                                  className="btn btn-sm"
                                  style={{ marginLeft: '0.5rem' }}
                                  disabled={vm.is_active}
                                  onClick={async () => {
                                    if (!confirm('Восстановить ВМ?')) return
                                    setDeleteError('')
                                    try {
                                      await api.vms.restore(vm.id)
                                      load()
                                    } catch (err) {
                                      const msg = err.body?.detail || err.body?.error || err.message || 'Не удалось восстановить ВМ'
                                      setDeleteError(msg)
                                    }
                                  }}
                                >
                                  Восстановить
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
                  <td colSpan={17} className="empty-hint">Список ВМ пуст</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {deleteModal.open && (
        <div className="modal-overlay">
          <div className="modal">
            <h3 style={{ marginTop: 0 }}>Удаление ВМ: {deleteModal.vm?.fqdn}</h3>
            <div className="form-group">
              <label>Заявка</label>
              <input
                value={deleteModal.request_number}
                onChange={(e) => setDeleteModal((d) => ({ ...d, request_number: e.target.value }))}
                placeholder="Номер заявки"
              />
            </div>
            <div className="form-group">
              <label>Задача</label>
              <input
                value={deleteModal.contractor_task_number}
                onChange={(e) => setDeleteModal((d) => ({ ...d, contractor_task_number: e.target.value }))}
                placeholder="Номер задачи"
              />
            </div>
            <div className="form-group">
              <label>Дата (dd.mm.yyyy)</label>
              <input
                value={deleteModal.request_date}
                onChange={(e) => setDeleteModal((d) => ({ ...d, request_date: e.target.value }))}
                placeholder="31.12.2026"
              />
              <div style={{ marginTop: '0.4rem' }}>
                <input
                  type="date"
                  value={toIsoDate(deleteModal.request_date)}
                  onChange={(e) => setDeleteModal((d) => ({ ...d, request_date: toRuDate(e.target.value) }))}
                />
              </div>
            </div>
            {deleteError && <p className="error-msg">{deleteError}</p>}
            <button className="btn btn-danger" type="button" onClick={confirmDeleteVm}>Удалить</button>
            <button className="btn btn-secondary" type="button" style={{ marginLeft: '0.5rem' }} onClick={closeDeleteModal}>Отмена</button>
          </div>
        </div>
      )}
    </>
  )
}
