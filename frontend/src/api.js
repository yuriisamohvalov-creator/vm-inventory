const API = '/api';
const TOKEN_KEY = 'vm_inventory_token';
const USER_KEY = 'vm_inventory_user';

export function getStoredToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function setStoredToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function getStoredUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

export function setStoredUser(user) {
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
  else localStorage.removeItem(USER_KEY);
}

async function request(path, options = {}) {
  const url = path.startsWith('http') ? path : `${API}${path}`;
  const auth = options.auth !== false;
  const token = getStoredToken();
  const headers = {
    ...(auth && token ? { Authorization: `Token ${token}` } : {}),
    ...options.headers,
  };
  if (!(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(url, {
    ...options,
    headers,
  });
  if (!res.ok) {
    const err = new Error(res.statusText);
    err.status = res.status;
    try {
      err.body = await res.json();
    } catch (_) {
      err.body = await res.text();
    }
    if (res.status === 401 && auth) {
      setStoredToken('');
      setStoredUser(null);
    }
    throw err;
  }
  if (res.status === 204) return null;
  const contentType = res.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) return res.json();
  return res.blob();
}

export const api = {
  auth: {
    login: async (username, password) => {
      const data = await request('/auth/login/', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
        auth: false,
      });
      setStoredToken(data.token);
      setStoredUser(data.user);
      return data;
    },
    me: async () => {
      const user = await request('/auth/me/');
      setStoredUser(user);
      return user;
    },
    logout: async () => {
      try {
        await request('/auth/logout/', { method: 'POST' });
      } catch (_) {
        // Ignore server-side logout errors; local logout still applies.
      }
      setStoredToken('');
      setStoredUser(null);
    },
    users: {
      list: () => request('/auth/users/'),
      create: (data) => request('/auth/users/', { method: 'POST', body: JSON.stringify(data) }),
      update: (id, data) => request(`/auth/users/${id}/`, { method: 'PATCH', body: JSON.stringify(data) }),
      delete: (id) => request(`/auth/users/${id}/`, { method: 'DELETE' }),
    },
  },
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
    list: (includeDeleted = true) => request(includeDeleted ? '/vms/?include_deleted=1' : '/vms/'),
    get: (id) => request(`/vms/${id}/`),
    create: (data) => request('/vms/', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => request(`/vms/${id}/`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id) => request(`/vms/${id}/`, { method: 'DELETE' }),
    restore: (id) => request(`/vms/${id}/restore/`, { method: 'POST' }),
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
  import: {
    /** Массовый импорт из единого JSON-файла (multipart/form-data, поле "file"). */
    bulkFromFile: async (file) => {
      const fd = new FormData()
      fd.append('file', file)
      return request('/v1/import/bulk', { method: 'POST', body: fd })
    },
  },
  report: {
    list: () => request('/report/'),
    /** Скачивание отчёта в PDF (возвращает Blob). */
    exportPdf: async () => {
      const url = `${API}/report/export/`;
      const token = getStoredToken();
      const res = await fetch(url, {
        credentials: 'same-origin',
        headers: token ? { Authorization: `Token ${token}` } : {},
      });
      if (!res.ok) throw Object.assign(new Error(res.statusText), { status: res.status });
      return res.blob();
    },
    /** Скачивание отчёта в XLSX (возвращает Blob). */
    exportXlsx: async () => {
      const url = `${API}/v1/report/xlsx`;
      const token = getStoredToken();
      const res = await fetch(url, {
        credentials: 'same-origin',
        headers: token ? { Authorization: `Token ${token}` } : {},
      });
      if (!res.ok) throw Object.assign(new Error(res.statusText), { status: res.status });
      return res.blob();
    },
    /** Скачивание отчёта в JSON (возвращает Blob). */
    exportJson: async () => {
      const url = `${API}/v1/report/json`;
      const token = getStoredToken();
      const res = await fetch(url, {
        credentials: 'same-origin',
        headers: token ? { Authorization: `Token ${token}` } : {},
      });
      if (!res.ok) throw Object.assign(new Error(res.statusText), { status: res.status });
      return res.blob();
    },
  },
};
