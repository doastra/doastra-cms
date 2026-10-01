import { Router } from 'express';
import { one, many, query } from '../db/index.js';
import { ah, badRequest, HttpError } from '../lib/util.js';
import { checkPassword, hashPassword, requireAuth, signToken } from '../lib/auth.js';

const r = Router();

r.post('/login', ah(async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) throw badRequest('Email and password are required');
  const user = await one('SELECT * FROM users WHERE lower(email) = lower($1)', [String(email).trim()]);
  if (!user || !user.is_active || !(await checkPassword(password, user.password_hash))) {
    throw new HttpError(401, 'Wrong email or password');
  }
  await query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);
  res.json({ token: signToken(user), user: await meFor(user.id) });
}));

r.get('/me', requireAuth, ah(async (req, res) => {
  res.json({ user: await meFor(req.user.id) });
}));

r.put('/me', requireAuth, ah(async (req, res) => {
  const { name, current_password, new_password } = req.body || {};
  if (name) await query('UPDATE users SET name = $1 WHERE id = $2', [String(name).trim(), req.user.id]);
  if (new_password) {
    if (String(new_password).length < 8) throw badRequest('New password must be at least 8 characters');
    const u = await one('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    if (!(await checkPassword(current_password || '', u.password_hash))) throw badRequest('Current password is wrong');
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [await hashPassword(new_password), req.user.id]);
  }
  res.json({ user: await meFor(req.user.id) });
}));

/** Current user + the sites they can access with their role on each. */
async function meFor(userId) {
  const user = await one('SELECT id, name, email, is_super_admin FROM users WHERE id = $1', [userId]);
  const sites = user.is_super_admin
    ? await many(`SELECT id, name, slug, domain, settings->>'logo_url' AS logo_url, 'admin' AS role FROM sites ORDER BY name`)
    : await many(
        `SELECT s.id, s.name, s.slug, s.domain, s.settings->>'logo_url' AS logo_url, su.role
         FROM site_users su JOIN sites s ON s.id = su.site_id WHERE su.user_id = $1 ORDER BY s.name`,
        [userId]
      );
  return { ...user, sites };
}

export default r;
