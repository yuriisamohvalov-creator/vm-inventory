import { useState, useEffect } from 'react'
import { api } from '../api'

export default function Reports() {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [exportLoading, setExportLoading] = useState(false)

  useEffect(() => {
    api.report.list()
      .then((r) => setData(Array.isArray(r) ? r : (r.results || [])))
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }, [])

  const downloadReportPdf = async () => {
    setExportLoading(true)
    try {
      const blob = await api.report.exportPdf()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'vm-inventory-report.pdf'
      a.click()
      URL.revokeObjectURL(url)
    } catch (_) {}
    setExportLoading(false)
  }

  if (loading) return <p className="empty-hint">Загрузка…</p>

  return (
    <>
      <h1 className="page-title">Отчеты</h1>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
          <span>Иерархический отчет: Департамент → Стрим → ИС → ВМ</span>
          <button className="btn" onClick={downloadReportPdf} disabled={exportLoading}>
            {exportLoading ? 'Выгрузка…' : 'Выгрузить PDF'}
          </button>
        </div>
        <div className="report-tree">
          {data.map((dept) => (
            <div key={dept.id ?? 'orphan'}>
              <div className="dept">
                {dept.has_exceeded && '🚨 '}
                {dept.name}
                {(dept.vm_count !== undefined) && (
                  <span className="vm-count report-sums">
                    (ВМ: {dept.vm_count}, CPU: {dept.sum_cpu ?? 0}
                    {dept.cpu_quota > 0 ? `/${dept.cpu_quota}` : ''}, RAM: {dept.sum_ram ?? 0}
                    {dept.ram_quota > 0 ? `/${dept.ram_quota}` : ''} ГБ, Диск: {dept.sum_disk ?? 0}
                    {dept.disk_quota > 0 ? `/${dept.disk_quota}` : ''} ГБ)
                  </span>
                )}
              </div>
              {(dept.streams || []).map((stream) => (
                <div key={stream.id ?? 's'}>
                  <div className="stream">
                    {stream.name}
                    {(stream.vm_count !== undefined) && (
                      <span className="vm-count report-sums">
                        ({stream.vm_count} ВМ, CPU: {stream.sum_cpu ?? 0}, RAM: {stream.sum_ram ?? 0} ГБ, Диск: {stream.sum_disk ?? 0} ГБ)
                      </span>
                    )}
                  </div>
                  {(stream.info_systems || []).map((isys) => (
                    <div key={isys.id ?? 'is'}>
                      <div className="is">
                        {isys.name}
                        <span className="vm-count">({isys.vm_count ?? (isys.vms?.length ?? 0)} ВМ)</span>
                      </div>
                      {(isys.vms || []).map((vm, i) => (
                        <div key={i} className="vm">
                          • {typeof vm === 'string' ? vm : vm.fqdn}
                          {typeof vm === 'object' && vm.info_system_deleted && (
                            <span className="vm-details" style={{ color: '#f44336', fontWeight: 'bold' }}> [ИС УДАЛЕНА]</span>
                          )}
                          {typeof vm === 'object' && vm.ip && (
                            <span className="vm-details"> (IP: {vm.ip})</span>
                          )}
                          {typeof vm === 'object' && vm.cpu !== undefined && (
                            <span className="vm-details"> (CPU: {vm.cpu}, RAM: {vm.ram} ГБ, Диск: {vm.disk} ГБ)</span>
                          )}
                        </div>
                      ))}
                      {(isys.vm_count > 0 || isys.sum_cpu !== undefined) && (
                        <div className="vm report-sums">
                          Итого ИС: {isys.vm_count ?? 0} ВМ, CPU: {isys.sum_cpu ?? 0}, RAM: {isys.sum_ram ?? 0} ГБ, Диск: {isys.sum_disk ?? 0} ГБ
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
