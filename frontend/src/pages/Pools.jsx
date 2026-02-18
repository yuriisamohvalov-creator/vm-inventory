import { useState, useEffect } from 'react'
import { api } from '../api'

export default function Pools() {
  const [pools, setPools] = useState([])
  const [composition, setComposition] = useState(null)
  const [availableVms, setAvailableVms] = useState([])
  const [poolDetail, setPoolDetail] = useState(null)
  const [newPoolName, setNewPoolName] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [error, setError] = useState('')

  const loadPools = () => {
    api.pools.list().then((r) => setPools(r.results || r)).catch(() => setPools([]))
  }

  useEffect(() => { loadPools() }, [])

  const openComposition = async (pool) => {
    setError('')
    setComposition(pool)
    const [detail, available] = await Promise.all([
      api.pools.get(pool.id),
      api.pools.availableVms(pool.id),
    ]).catch(() => [null, []])
    setPoolDetail(detail)
    setAvailableVms(Array.isArray(available) ? available : (available.results || available || []))
  }

  const closeComposition = () => {
    setComposition(null)
    setPoolDetail(null)
    setAvailableVms([])
    loadPools()
  }

  const addVm = async (vmId) => {
    setError('')
    try {
      await api.pools.addVm(composition.id, vmId)
      const [detail, available] = await Promise.all([
        api.pools.get(composition.id),
        api.pools.availableVms(composition.id),
      ])
      setPoolDetail(detail)
      setAvailableVms(Array.isArray(available) ? available : [])
    } catch (err) {
      setError(err.body?.error || err.message || 'Ошибка')
    }
  }

  const removeVm = async (vmId) => {
    setError('')
    try {
      await api.pools.removeVm(composition.id, vmId)
      const [detail, available] = await Promise.all([
        api.pools.get(composition.id),
        api.pools.availableVms(composition.id),
      ])
      setPoolDetail(detail)
      setAvailableVms(Array.isArray(available) ? available : [])
    } catch (err) {
      setError(err.body?.error || err.message || 'Ошибка')
    }
  }

  const createPool = async (e) => {
    e.preventDefault()
    if (!newPoolName.trim()) return
    setError('')
    try {
      await api.pools.create({ name: newPoolName.trim() })
      setNewPoolName('')
      setShowCreate(false)
      loadPools()
    } catch (err) {
      setError(err.body?.name?.[0] || err.message || 'Ошибка')
    }
  }

  const deletePool = async (pool) => {
    if (!confirm(`Удалить пул «${pool.name}»?`)) return
    try {
      await api.pools.delete(pool.id)
      if (composition?.id === pool.id) closeComposition()
      loadPools()
    } catch (_) {}
  }

  const poolList = Array.isArray(pools) ? pools : (pools.results || [])

  return (
    <>
      <h1 className="page-title">Общие пулы</h1>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <span>Список пулов</span>
          <button className="btn" onClick={() => setShowCreate(true)}>Создать пул</button>
        </div>

        {showCreate && (
          <div className="modal-overlay" onClick={() => setShowCreate(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h3>Новый пул</h3>
              <form onSubmit={createPool}>
                <div className="form-group">
                  <label>Название</label>
                  <input value={newPoolName} onChange={(e) => setNewPoolName(e.target.value)} required />
                </div>
                {error && <p className="error-msg">{error}</p>}
                <button type="submit" className="btn">Создать</button>
                <button type="button" className="btn btn-secondary" style={{ marginLeft: '0.5rem' }} onClick={() => setShowCreate(false)}>Отмена</button>
              </form>
            </div>
          </div>
        )}

        <div className="table-wrap" style={{ marginTop: '1rem' }}>
          <table>
            <thead>
              <tr><th>Название</th><th>Теги пула</th><th>Создан</th><th></th></tr>
            </thead>
            <tbody>
              {poolList.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>
                    <div className="tags-row">
                      {(p.pool_tags || []).map((t) => (
                        <span key={t} className="badge">{t}</span>
                      ))}
                      {(!p.pool_tags || p.pool_tags.length === 0) && <span className="empty-hint">—</span>}
                    </div>
                  </td>
                  <td>{p.created_at ? new Date(p.created_at).toLocaleString() : '—'}</td>
                  <td>
                    <button className="btn btn-sm btn-secondary" onClick={() => openComposition(p)}>Состав</button>
                    <button className="btn btn-sm btn-danger" style={{ marginLeft: '0.5rem' }} onClick={() => deletePool(p)}>Удалить</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {composition && (
        <div className="modal-overlay" onClick={closeComposition}>
          <div className="modal" style={{ maxWidth: 900 }} onClick={(e) => e.stopPropagation()}>
            <h3>Состав пула: {composition.name}</h3>
            {poolDetail?.instance_value != null && (
              <p className="empty-hint" style={{ marginBottom: '1rem' }}>
                В пул можно добавлять только ВМ с instance = {poolDetail.instance_value}.
              </p>
            )}
            {error && <p className="error-msg">{error}</p>}
            <div className="pool-layout">
              <div className="pool-list">
                <h4>Доступные ВМ</h4>
                <ul>
                  {availableVms.length === 0 ? (
                    <li className="empty-hint">Нет доступных ВМ с подходящим instance</li>
                  ) : (
                    availableVms.map((vm) => (
                      <li key={vm.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span>{vm.fqdn} (instance {vm.instance})</span>
                          <button type="button" className="btn btn-sm" onClick={() => addVm(vm.id)}>Добавить →</button>
                        </div>
                        <div className="tags-row" style={{ fontSize: '0.8rem' }}>
                          {(vm.tags || []).map((t) => (
                            <span key={t} className="badge">{t}</span>
                          ))}
                        </div>
                      </li>
                    ))
                  )}
                </ul>
              </div>
              <div className="pool-buttons" />
              <div className="pool-list">
                <h4>ВМ в пуле</h4>
                <ul>
                  {(poolDetail?.vms_in_pool || []).length === 0 ? (
                    <li className="empty-hint">Пул пуст</li>
                  ) : (
                    (poolDetail?.vms_in_pool || []).map((v) => (
                      <li key={v.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span>{v.fqdn}</span>
                          <button type="button" className="btn btn-sm btn-danger" onClick={() => removeVm(v.id)}>Убрать</button>
                        </div>
                        {poolDetail?.pool_tags && (
                          <div className="tags-row" style={{ fontSize: '0.8rem' }}>
                            {poolDetail.pool_tags.map((t) => (
                              <span key={t} className="badge">{t}</span>
                            ))}
                          </div>
                        )}
                      </li>
                    ))
                  )}
                </ul>
              </div>
            </div>
            <button type="button" className="btn btn-secondary" style={{ marginTop: '1rem' }} onClick={closeComposition}>Закрыть</button>
          </div>
        </div>
      )}
    </>
  )
}
