// Tiny CMS client – copy this into any website.
// Set your CMS URL and the website's API key (Admin → API & frontend).
export const CMS_URL = window.CMS_URL || 'http://localhost:4000/api';
export const CMS_KEY = window.CMS_KEY || 'PASTE_YOUR_SITE_API_KEY';

export async function cms(path) {
  const res = await fetch(CMS_URL + path, { headers: { 'x-api-key': CMS_KEY } });
  if (!res.ok) throw new Error(`CMS ${res.status}: ${(await res.json().catch(() => ({}))).error || res.statusText}`);
  return res.json();
}

export async function sendForm(form, data) {
  const res = await fetch(`${CMS_URL}/forms/${form}`, {
    method: 'POST',
    headers: { 'x-api-key': CMS_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

/** Escape text before putting it into HTML. (Rich text fields are already HTML.) */
export const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** <img> with responsive srcset from the CMS image sizes */
export function img(m, { size = 'large', cls = '', sizes = '100vw' } = {}) {
  if (!m) return '';
  const s = m.sizes || {};
  const srcset = [['thumb', 320], ['medium', 960], ['large', 1920]].filter(([k]) => s[k]).map(([k, w]) => `${s[k]} ${w}w`).join(', ');
  return `<img class="${cls}" src="${esc(s[size] || m.url)}" ${srcset ? `srcset="${srcset}" sizes="${sizes}"` : ''} alt="${esc(m.alt)}" loading="lazy" width="${m.width || ''}" height="${m.height || ''}">`;
}

export function link(l, cls = 'btn') {
  if (!l?.url) return '';
  return `<a class="${cls}" href="${esc(l.url)}" ${l.target === '_blank' ? 'target="_blank" rel="noopener"' : ''}>${esc(l.label || 'Learn more')}</a>`;
}
