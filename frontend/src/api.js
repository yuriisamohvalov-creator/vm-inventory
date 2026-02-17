const API = '/api';

async function request(path, options = {}) {
  const url = path.startsWith('http') ? path : `${API}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!res.ok) {
    const err = new Error(res.statusText);
    err.status = res.status;
    try {
      err.body = await res.json();
    } catch (_) {
      err.body = await res.text();
    }
    throw err;
  }
  if (res.status === 204) return null;
  const contentType = res.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) return res.json();
  return res.blob();
}

export const api = {
  departments: {
    list: () => request('/departments/'),
    get: (id) => request(`/departments/${id}/`),
    create: (data) => request('/departments/', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => request(`/departments/${id}/`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id) => request(`/departments/${id}/`, { method: 'DELETE' }),
  },
  streams: {
    list: (departmentId) => request(departmentId ? `/streams/?department_id=${departmentId}` : '/streams/'),
    get: (id) => request(`/streams/${id}/`),
    create: (data) => request('/streams/', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => request(`/streams/${id}/`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id) => request(`/streams/${id}/`, { method: 'DELETE' }),
  },
  infoSystems: {
    list: (streamId) => request(streamId ? `/info-systems/?stream_id=${streamId}` : '/info-systems/'),
    get: (id) => request(`/info-systems/${id}/`),
    create: (data) => request('/info-systems/', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => request(`/info-systems/${id}/`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id) => request(`/info-systems/${id}/`, { method: 'DELETE' }),
  },
  vms: {
    list: () => request('/vms/'),
    get: (id) => request(`/vms/${id}/`),
    create: (data) => request('/vms/', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => request(`/vms/${id}/`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id) => request(`/vms/${id}/`, { method: 'DELETE' }),
  },
  pools: {
    list: () => request('/pools/'),
    get: (id) => request(`/pools/${id}/`),
    create: (data) => request('/pools/', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => request(`/pools/${id}/`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id) => request(`/pools/${id}/`, { method: 'DELETE' }),
    availableVms: (poolId) => request(`/pools/${poolId}/available_vms/`),
    addVm: (poolId, vmId) => request(`/pools/${poolId}/add-vm/${vmId}/`, { method: 'POST' }),
    removeVm: (poolId, vmId) => request(`/pools/${poolId}/remove-vm/${vmId}/`, { method: 'POST' }),
  },
  report: {
    list: () => request('/report/'),
    pdf: () => request('/report/pdf/'),
  },
};
