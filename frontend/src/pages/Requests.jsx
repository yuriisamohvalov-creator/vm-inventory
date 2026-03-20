import { useEffect, useState } from 'react'
import { api } from '../api'

const REQUEST_LABELS = {
  CREATE: 'Создание',
  UPDATE: 'Изменение',
  DELETE: 'Удаление',
}

export default function Requests() {
  const [requests, setRequests] = useState([])
  const [error, setError] = useState('')

  const load = async () => {
    setError('')
    try {
      const data = await api.vms.requests.list()
      setRequests(Array.isArray(data) ? data : (data.results || []))
    } catch (err) {
      setError(err.body?.detail || err.message || 'Не удалось загрузить заявки')
      setRequests([])
    }
  }

  useEffect(() => {
    load()
  }, [])

  const formatDateTime = (value) => {
    if (!value) return '—'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '—'
    return date.toLocaleString('ru-RU')
  }

  return (
    <>
      <h1 className="page-title">Заявки по ВМ</h1>
      <div className="card">
        {error && <p className="error-msg">{error}</p>}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ВМ</th>
                <th>Заявка</th>
                <th>Задача</th>
                <th>Дата</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((item) => (
                <tr key={item.id}>
                  <td>{item.vm_fqdn || `VM #${item.vm}`}</td>
                  <td>{REQUEST_LABELS[item.request_type] || item.request_type || '—'} {item.request_number ? `(${item.request_number})` : ''}</td>
                  <td>{item.contractor_task_number || '—'}</td>
                  <td>{formatDateTime(item.created_at)}</td>
                </tr>
              ))}
              {requests.length === 0 && !error && (
                <tr>
                  <td colSpan={4} className="empty-hint">Заявки не найдены</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
