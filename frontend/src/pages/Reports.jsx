import { useState, useEffect } from 'react'
import { api } from '../api'

export default function Reports() {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [pdfLoading, setPdfLoading] = useState(false)

  useEffect(() => {
    api.report.list()
      .then((r) => setData(Array.isArray(r) ? r : (r.results || [])))
      .catch(() => setData([]))
      .finally(() => setLoading(false))
  }, [])

  const downloadPdf = async () => {
    setPdfLoading(true)
    try {
      const blob = await api.report.pdf()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'vm-inventory-report.pdf'
      a.click()
      URL.revokeObjectURL(url)
    } catch (_) {}
    setPdfLoading(false)
  }

  if (loading) return <p className="empty-hint">Загрузка…</p>

  return (
    <>
      <h1 className="page-title">Отчеты</h1>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <span>Иерархический отчет: Департамент → Стрим → ИС → ВМ</span>
          <button className="btn" onClick={downloadPdf} disabled={pdfLoading}>
            {pdfLoading ? 'Выгрузка…' : 'Выгрузить в PDF'}
          </button>
        </div>
        <div className="report-tree">
          {data.map((dept) => (
            <div key={dept.id ?? 'orphan'}>
              <div className="dept">
                {dept.name}
                {(dept.vm_count !== undefined) && (
                  <span className="vm-count report-sums">
                    ({dept.vm_count} ВМ, CPU: {dept.sum_cpu ?? 0}, RAM: {dept.sum_ram ?? 0} ГБ, Диск: {dept.sum_disk ?? 0} ГБ)
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
