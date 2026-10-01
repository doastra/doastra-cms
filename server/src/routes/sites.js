import { Router } from 'express';
import { one, many, query, tx } from '../db/index.js';
import { ah, badRequest, notFound, newApiKey, slugify, pick } from '../lib/util.js';
import { hashPassword, requireSuperAdmin, loadSite, requireRole } from '../lib/auth.js';
import { invalidateSite } from '../lib/cache.js';

const r = Router();

const publicSite = (s, role) => ({
  id: s.id, name: s.name, slug: s.slug, domain: s.domain, settings: s.settings,
  created_at: s.created_at, updated_at: s.updated_at,
  ...(role === 'admin' ? { api_key: s.api_key } : {}),
});

// ---- Sites -----------------------------------------------------------------

r.get('/sites', ah(async (req, res) => {
  const rows = req.user.is_super_admin
    ? await many('SELECT s.*, (SELECT count(*) FROM pages p WHERE p.site_id = s.id)::int AS page_count FROM sites s ORDER BY name')
    : await many(
        `SELECT s.*, (SELECT count(*) FROM pages p WHERE p.site_id = s.id)::int AS page_count, su.role
         FROM sites s JOIN site_users su ON su.site_id = s.id WHERE su.user_id = $1 ORDER BY s.name`,
        [req.user.id]
      );
  res.json(rows.map((s) => ({ ...publicSite(s, req.user.is_super_admin ? 'admin' : s.role), page_count: s.page_count })));
}));

r.post('/sites', requireSuperAdmin, ah(async (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) throw badRequest('Site name is required');
  const slug = slugify(req.body.slug || name);
  if (await one('SELECT 1 FROM sites WHERE slug = $1', [slug])) throw badRequest(`A site with slug "${slug}" already exists`);
  const site = await tx(async (db) => {
    const { rows: [s] } = await db.query(
      `INSERT INTO sites (name, slug, domain, api_key, settings) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [name, slug, req.body.domain || null, newApiKey(), { site_title: name }]
    );
    await db.query(`INSERT INTO menus (site_id, name, slug) VALUES ($1,'Main menu','main'),($1,'Footer menu','footer')`, [s.id]);
    return s;
  });
  res.status(201).json(publicSite(site, 'admin'));
}));

r.get('/sites/:siteId', loadSite, ah(async (req, res) => {
  res.json({ ...publicSite(req.site, req.role), role: req.role });
}));

r.put('/sites/:siteId', loadSite, requireRole('admin'), ah(async (req, res) => {
  const b = req.body || {};
  const site = await one(
    `UPDATE sites SET name = COALESCE($2, name), domain = $3, updated_at = now() WHERE id = $1 RETURNING *`,
    [req.site.id, b.name?.trim() || null, b.domain ?? req.site.domain]
  );
  invalidateSite(site.id);
  res.json(publicSite(site, req.role));
}));

r.post('/sites/:siteId/regenerate-key', loadSite, requireRole('admin'), ah(async (req, res) => {
  const site = await one('UPDATE sites SET api_key = $2 WHERE id = $1 RETURNING *', [req.site.id, newApiKey()]);
  invalidateSite(site.id);
  res.json(publicSite(site, 'admin'));
}));

r.delete('/sites/:siteId', requireSuperAdmin, ah(async (req, res) => {
  const s = await one('DELETE FROM sites WHERE id = $1 RETURNING id', [req.params.siteId]);
  if (!s) throw notFound('Site not found');
  invalidateSite(s.id);
  res.json({ ok: true });
}));

/**
 * Duplicate a site's structure as a starting point for a new website:
 * section types, content types, taxonomies(+terms), menus, settings and (optionally) pages.
 */
r.post('/sites/:siteId/duplicate', requireSuperAdmin, ah(async (req, res) => {
  const src = await one('SELECT * FROM sites WHERE id = $1', [req.params.siteId]);
  if (!src) throw notFound('Site not found');
  const name = String(req.body?.name || `${src.name} copy`).trim();
  const slug = slugify(req.body?.slug || name);
  if (await one('SELECT 1 FROM sites WHERE slug = $1', [slug])) throw badRequest(`A site with slug "${slug}" already exists`);
  const withPages = req.body?.include_pages !== false;

  const site = await tx(async (db) => {
    const { rows: [s] } = await db.query(
      `INSERT INTO sites (name, slug, domain, api_key, settings) VALUES ($1,$2,NULL,$3,$4) RETURNING *`,
      [name, slug, newApiKey(), { ...src.settings, site_title: name, webhook_url: '' }]
    );
    await db.query(`INSERT INTO section_types (site_id, name, key, description, icon, fields)
      SELECT $2, name, key, description, icon, fields FROM section_types WHERE site_id = $1`, [src.id, s.id]);

    // Content types (keep id map so relations in entries are not needed – entries are not copied)
    await db.query(`INSERT INTO content_types (site_id, name, singular_name, slug, icon, fields, has_seo, sort_by)
      SELECT $2, name, singular_name, slug, icon, fields, has_seo, sort_by FROM content_types WHERE site_id = $1`, [src.id, s.id]);

    const { rows: taxes } = await db.query('SELECT * FROM taxonomies WHERE site_id = $1', [src.id]);
    for (const t of taxes) {
      const { rows: [nt] } = await db.query('INSERT INTO taxonomies (site_id, name, slug) VALUES ($1,$2,$3) RETURNING id', [s.id, t.name, t.slug]);
      await db.query(`INSERT INTO terms (taxonomy_id, name, slug, description, sort_order)
        SELECT $2, name, slug, description, sort_order FROM terms WHERE taxonomy_id = $1`, [t.id, nt.id]);
    }
    await db.query(`INSERT INTO menus (site_id, name, slug, items) SELECT $2, name, slug, items FROM menus WHERE site_id = $1`, [src.id, s.id]);
    if (withPages) {
      await db.query(`INSERT INTO pages (site_id, title, slug, status, sections, seo, sort_order)
        SELECT $2, title, slug, 'draft', sections, '{}'::jsonb, sort_order FROM pages WHERE site_id = $1`, [src.id, s.id]);
    }
    return s;
  });
  res.status(201).json(publicSite(site, 'admin'));
}));

// ---- Site users (site admins manage who can edit their site) ---------------

r.get('/sites/:siteId/users', loadSite, requireRole('admin'), ah(async (req, res) => {
  res.json(await many(
    `SELECT u.id, u.name, u.email, su.role FROM site_users su JOIN users u ON u.id = su.user_id
     WHERE su.site_id = $1 ORDER BY u.name`, [req.site.id]));
}));

/** Add a user to the site by email. Creates the account if it does not exist (password required then). */
r.post('/sites/:siteId/users', loadSite, requireRole('admin'), ah(async (req, res) => {
  const { email, name, password, role } = req.body || {};
  if (!['admin', 'editor', 'author'].includes(role)) throw badRequest('Choose a role: admin, editor or author');
  if (!email) throw badRequest('Email is required');
  let user = await one('SELECT id FROM users WHERE lower(email) = lower($1)', [email.trim()]);
  if (!user) {
    if (!password || password.length < 8) throw badRequest('New user: set a password of at least 8 characters');
    user = await one('INSERT INTO users (name, email, password_hash) VALUES ($1,$2,$3) RETURNING id',
      [name?.trim() || email.split('@')[0], email.trim().toLowerCase(), await hashPassword(password)]);
  }
  await query(`INSERT INTO site_users (site_id, user_id, role) VALUES ($1,$2,$3)
    ON CONFLICT (site_id, user_id) DO UPDATE SET role = EXCLUDED.role`, [req.site.id, user.id, role]);
  res.status(201).json({ ok: true });
}));

r.put('/sites/:siteId/users/:userId', loadSite, requireRole('admin'), ah(async (req, res) => {
  if (!['admin', 'editor', 'author'].includes(req.body?.role)) throw badRequest('Invalid role');
  await query('UPDATE site_users SET role = $3 WHERE site_id = $1 AND user_id = $2', [req.site.id, req.params.userId, req.body.role]);
  res.json({ ok: true });
}));

r.delete('/sites/:siteId/users/:userId', loadSite, requireRole('admin'), ah(async (req, res) => {
  await query('DELETE FROM site_users WHERE site_id = $1 AND user_id = $2', [req.site.id, req.params.userId]);
  res.json({ ok: true });
}));

// ---- All users (super admin) ----------------------------------------------

r.get('/users', requireSuperAdmin, ah(async (_req, res) => {
  res.json(await many(
    `SELECT u.id, u.name, u.email, u.is_super_admin, u.is_active, u.last_login_at, u.created_at,
       COALESCE(json_agg(json_build_object('site_id', s.id, 'site', s.name, 'role', su.role)) FILTER (WHERE s.id IS NOT NULL), '[]') AS sites
     FROM users u LEFT JOIN site_users su ON su.user_id = u.id LEFT JOIN sites s ON s.id = su.site_id
     GROUP BY u.id ORDER BY u.name`));
}));

r.post('/users', requireSuperAdmin, ah(async (req, res) => {
  const b = req.body || {};
  if (!b.email || !b.name) throw badRequest('Name and email are required');
  if (!b.password || b.password.length < 8) throw badRequest('Password must be at least 8 characters');
  if (await one('SELECT 1 FROM users WHERE lower(email) = lower($1)', [b.email])) throw badRequest('That email is already used');
  const u = await one(`INSERT INTO users (name, email, password_hash, is_super_admin) VALUES ($1,$2,$3,$4)
    RETURNING id, name, email, is_super_admin, is_active`, [b.name.trim(), b.email.trim().toLowerCase(), await hashPassword(b.password), !!b.is_super_admin]);
  res.status(201).json(u);
}));

r.put('/users/:id', requireSuperAdmin, ah(async (req, res) => {
  const b = pick(req.body || {}, ['name', 'email', 'is_super_admin', 'is_active', 'password']);
  const u = await one('SELECT * FROM users WHERE id = $1', [req.params.id]);
  if (!u) throw notFound('User not found');
  if (u.id === req.user.id && (b.is_super_admin === false || b.is_active === false)) throw badRequest('You cannot remove your own super admin access');
  const hash = b.password ? (b.password.length >= 8 ? await hashPassword(b.password) : (() => { throw badRequest('Password must be at least 8 characters'); })()) : u.password_hash;
  const updated = await one(
    `UPDATE users SET name = $2, email = $3, is_super_admin = $4, is_active = $5, password_hash = $6 WHERE id = $1
     RETURNING id, name, email, is_super_admin, is_active`,
    [u.id, b.name ?? u.name, (b.email ?? u.email).toLowerCase(), b.is_super_admin ?? u.is_super_admin, b.is_active ?? u.is_active, hash]
  );
  res.json(updated);
}));

r.delete('/users/:id', requireSuperAdmin, ah(async (req, res) => {
  if (Number(req.params.id) === req.user.id) throw badRequest('You cannot delete yourself');
  await query('DELETE FROM users WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
}));

export default r;
