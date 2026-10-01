import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { config } from '../config.js';
import { one } from '../db/index.js';
import { HttpError, forbidden, notFound, ah } from './util.js';

const ROLE_RANK = { author: 1, editor: 2, admin: 3 };

export const hashPassword = (pw) => bcrypt.hash(pw, 10);
export const checkPassword = (pw, hash) => bcrypt.compare(pw, hash);

export function signToken(user) {
  return jwt.sign({ uid: user.id }, config.jwtSecret, { expiresIn: '7d' });
}

export async function userFromToken(token) {
  try {
    const { uid } = jwt.verify(token, config.jwtSecret);
    return await one('SELECT id, name, email, is_super_admin, is_active FROM users WHERE id = $1', [uid]);
  } catch {
    return null;
  }
}

function bearer(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7) : null;
}

export const requireAuth = ah(async (req, _res, next) => {
  const token = bearer(req);
  const user = token && (await userFromToken(token));
  if (!user || !user.is_active) throw new HttpError(401, 'Please log in');
  req.user = user;
  next();
});

export const requireSuperAdmin = (req, _res, next) => {
  if (!req.user?.is_super_admin) return next(forbidden('Only super admins can do this'));
  next();
};

/** Resolve the role a user has on a site (super admins act as site admins everywhere). */
export async function roleOnSite(user, siteId) {
  if (user.is_super_admin) return 'admin';
  const row = await one('SELECT role FROM site_users WHERE site_id = $1 AND user_id = $2', [siteId, user.id]);
  return row?.role || null;
}

/** Loads req.site from :siteId and checks the user has access. */
export const loadSite = ah(async (req, _res, next) => {
  const site = await one('SELECT * FROM sites WHERE id = $1', [req.params.siteId]);
  if (!site) throw notFound('Site not found');
  const role = await roleOnSite(req.user, site.id);
  if (!role) throw forbidden('You do not have access to this site');
  req.site = site;
  req.role = role;
  next();
});

export const requireRole = (min) => (req, _res, next) => {
  if ((ROLE_RANK[req.role] || 0) < ROLE_RANK[min]) {
    return next(forbidden(`This needs the "${min}" role on this site`));
  }
  next();
};

export const hasRole = (req, min) => (ROLE_RANK[req.role] || 0) >= ROLE_RANK[min];
