// Small fetch wrapper for the admin API.
const BASE = '/admin/api';

export function getToken() {
  return localStorage.getItem('dcms_token');
}
export function setToken(t) {
  if (t) localStorage.setItem('dcms_token', t);
  else localStorage.removeItem('dcms_token');
}

export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function request(method, path, body) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(BASE + path, { method, headers, body: payload });
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : null;
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/login')) {
      setToken(null);
      window.location.href = '/admin/login';
    }
    throw new ApiError(res.status, data?.error || `Request failed (${res.status})`, data?.details);
  }
  return data;
}

export const api = {
  get: (p) => request('GET', p),
  post: (p, b) => request('POST', p, b ?? {}),
  put: (p, b) => request('PUT', p, b ?? {}),
  del: (p) => request('DELETE', p),
};

/** Helper bound to one site: s(id).get('/pages') -> /sites/:id/pages */
export const siteApi = (siteId) => ({
  get: (p) => api.get(`/sites/${siteId}${p}`),
  post: (p, b) => api.post(`/sites/${siteId}${p}`, b),
  put: (p, b) => api.put(`/sites/${siteId}${p}`, b),
  del: (p) => api.del(`/sites/${siteId}${p}`),
});

export function errorText(err) {
  if (!err) return '';
  return err.details?.length ? `${err.message}:\n• ${err.details.join('\n• ')}` : err.message;
}

export function slugify(s = '') {
  return s.toString().normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
export const keyify = (s) => slugify(s).replace(/-/g, '_');
export const uid = () => Math.random().toString(36).slice(2, 10);
