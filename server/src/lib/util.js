import crypto from 'node:crypto';

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (msg, details) => new HttpError(400, msg, details);
export const notFound = (msg = 'Not found') => new HttpError(404, msg);
export const forbidden = (msg = 'You do not have permission to do this') => new HttpError(403, msg);

/** Wrap async route handlers so thrown errors reach the error middleware. */
export const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function slugify(input = '') {
  return String(input)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

/** Field keys use snake_case so they are easy to use in JS/templating. */
export function keyify(input = '') {
  return slugify(input).replace(/-/g, '_');
}

export const newApiKey = () => 'dcms_' + crypto.randomBytes(24).toString('hex');

export function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}

export function intOr(v, fallback) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

/** Make a unique slug within a table/scope by appending -2, -3 ... */
export async function uniqueSlug(db, table, scopeCol, scopeVal, base, excludeId) {
  const root = slugify(base) || 'item';
  let candidate = root;
  for (let i = 2; i < 500; i++) {
    const { rows } = await db.query(
      `SELECT 1 FROM ${table} WHERE ${scopeCol} = $1 AND slug = $2 ${excludeId ? 'AND id <> $3' : ''} LIMIT 1`,
      excludeId ? [scopeVal, candidate, excludeId] : [scopeVal, candidate]
    );
    if (!rows.length) return candidate;
    candidate = `${root}-${i}`;
  }
  return `${root}-${Date.now()}`;
}
