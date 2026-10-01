// Media library, taxonomies/terms, menus, site settings and form submissions.
import { Router } from 'express';
import multer from 'multer';
import { one, many, query, tx } from '../db/index.js';
import { ah, badRequest, notFound, intOr, slugify, uniqueSlug } from '../lib/util.js';
import { requireRole } from '../lib/auth.js';
import { storeUpload, removeStored } from '../lib/storage.js';
import { publicMedia } from '../lib/fields.js';

const r = Router({ mergeParams: true });

// ============================================================================
// Media
// ============================================================================

const MAX_MB = Number(process.env.MAX_UPLOAD_MB || 50);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_MB * 1024 * 1024, files: 30 } });

r.get('/media', ah(async (req, res) => {
  const page = Math.max(intOr(req.query.page, 1), 1);
  const limit = Math.min(Math.max(intOr(req.query.limit, 48), 1), 200);
  const params = [req.site.id];
  let where = 'site_id = $1';
  if (req.query.search) { params.push(`%${req.query.search}%`); where += ` AND (original_name ILIKE $2 OR alt ILIKE $2)`; }
  if (req.query.kind === 'image') where += ` AND mime LIKE 'image/%'`;
  if (req.query.kind === 'video') where += ` AND mime LIKE 'video/%'`;
  if (req.query.kind === 'document') where += ` AND mime NOT LIKE 'image/%' AND mime NOT LIKE 'video/%'`;
  const total = (await one(`SELECT count(*)::int AS n FROM media WHERE ${where}`, params)).n;
  params.push(limit, (page - 1) * limit);
  const rows = await many(`SELECT * FROM media WHERE ${where} ORDER BY created_at DESC, id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
  res.json({ items: rows.map(publicMedia), total, page, pages: Math.ceil(total / limit) });
}));

/** Fetch several media items by id: ?ids=1,2,3 (used by image/gallery fields to show previews) */
r.get('/media/by-ids', ah(async (req, res) => {
  const ids = String(req.query.ids || '').split(',').map(Number).filter(Boolean);
  if (!ids.length) return res.json([]);
  const rows = await many('SELECT * FROM media WHERE site_id = $1 AND id = ANY($2)', [req.site.id, ids]);
  res.json(rows.map(publicMedia));
}));

r.post('/media', requireRole('author'), upload.array('files', 30), ah(async (req, res) => {
  if (!req.files?.length) throw badRequest('No files uploaded (use the "files" field)');
  const out = [];
  for (const f of req.files) {
    const stored = await storeUpload(req.site, f);
    const m = await one(
      `INSERT INTO media (site_id, storage_key, original_name, mime, size, width, height, alt, url, sizes, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [req.site.id, stored.storage_key, f.originalname, f.mimetype, f.size, stored.width, stored.height,
        f.originalname.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '), stored.url, stored.sizes, req.user.id]
    );
    out.push(publicMedia(m));
  }
  res.status(201).json(out);
}));

r.put('/media/:id', requireRole('author'), ah(async (req, res) => {
  const m = await one('UPDATE media SET alt = $3 WHERE id = $1 AND site_id = $2 RETURNING *', [req.params.id, req.site.id, String(req.body?.alt ?? '')]);
  if (!m) throw notFound('File not found');
  res.json(publicMedia(m));
}));

r.delete('/media/:id', requireRole('editor'), ah(async (req, res) => {
  const m = await one('DELETE FROM media WHERE id = $1 AND site_id = $2 RETURNING *', [req.params.id, req.site.id]);
  if (!m) throw notFound('File not found');
  await removeStored(m);
  res.json({ ok: true });
}));

// ============================================================================
// Taxonomies & terms
// ============================================================================

r.get('/taxonomies', ah(async (req, res) => {
  res.json(await many(
    `SELECT t.*, COALESCE(json_agg(json_build_object('id', x.id, 'name', x.name, 'slug', x.slug, 'parent_id', x.parent_id, 'description', x.description)
       ORDER BY x.sort_order, x.name) FILTER (WHERE x.id IS NOT NULL), '[]') AS terms
     FROM taxonomies t LEFT JOIN terms x ON x.taxonomy_id = t.id WHERE t.site_id = $1 GROUP BY t.id ORDER BY t.name`, [req.site.id]));
}));

r.post('/taxonomies', requireRole('admin'), ah(async (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) throw badRequest('Name is required');
  const slug = slugify(req.body.slug || name);
  if (await one('SELECT 1 FROM taxonomies WHERE site_id = $1 AND slug = $2', [req.site.id, slug])) throw badRequest('That taxonomy already exists');
  res.status(201).json(await one('INSERT INTO taxonomies (site_id, name, slug) VALUES ($1,$2,$3) RETURNING *', [req.site.id, name, slug]));
}));

r.put('/taxonomies/:id', requireRole('admin'), ah(async (req, res) => {
  const t = await one('UPDATE taxonomies SET name = $3 WHERE id = $1 AND site_id = $2 RETURNING *', [req.params.id, req.site.id, String(req.body?.name || '').trim()]);
  if (!t) throw notFound();
  res.json(t);
}));

r.delete('/taxonomies/:id', requireRole('admin'), ah(async (req, res) => {
  await query('DELETE FROM taxonomies WHERE id = $1 AND site_id = $2', [req.params.id, req.site.id]);
  res.json({ ok: true });
}));

async function ownTaxonomy(req) {
  const t = await one('SELECT * FROM taxonomies WHERE id = $1 AND site_id = $2', [req.params.taxId, req.site.id]);
  if (!t) throw notFound('Taxonomy not found');
  return t;
}

r.post('/taxonomies/:taxId/terms', requireRole('editor'), ah(async (req, res) => {
  const t = await ownTaxonomy(req);
  const name = String(req.body?.name || '').trim();
  if (!name) throw badRequest('Name is required');
  const slug = await uniqueSlug({ query }, 'terms', 'taxonomy_id', t.id, req.body.slug || name);
  res.status(201).json(await one(
    'INSERT INTO terms (taxonomy_id, name, slug, description, parent_id) VALUES ($1,$2,$3,$4,$5) RETURNING *',
    [t.id, name, slug, req.body.description || null, req.body.parent_id || null]));
}));

r.put('/taxonomies/:taxId/terms/:id', requireRole('editor'), ah(async (req, res) => {
  const t = await ownTaxonomy(req);
  const cur = await one('SELECT * FROM terms WHERE id = $1 AND taxonomy_id = $2', [req.params.id, t.id]);
  if (!cur) throw notFound();
  const b = req.body || {};
  const slug = b.slug && b.slug !== cur.slug ? await uniqueSlug({ query }, 'terms', 'taxonomy_id', t.id, b.slug, cur.id) : cur.slug;
  res.json(await one('UPDATE terms SET name=$2, slug=$3, description=$4, parent_id=$5 WHERE id=$1 RETURNING *',
    [cur.id, String(b.name ?? cur.name).trim(), slug, b.description ?? cur.description, b.parent_id === undefined ? cur.parent_id : b.parent_id || null]));
}));

r.delete('/taxonomies/:taxId/terms/:id', requireRole('editor'), ah(async (req, res) => {
  const t = await ownTaxonomy(req);
  await query('DELETE FROM terms WHERE id = $1 AND taxonomy_id = $2', [req.params.id, t.id]);
  res.json({ ok: true });
}));

// ============================================================================
// Menus: items = [{ label, url, target, children: [...] }]
// ============================================================================

function cleanMenuItems(items, depth = 0) {
  if (!Array.isArray(items)) return [];
  return items.filter((i) => i && i.label).map((i) => ({
    label: String(i.label),
    url: String(i.url || '#'),
    target: i.target === '_blank' ? '_blank' : '_self',
    ...(depth < 2 ? { children: cleanMenuItems(i.children, depth + 1) } : {}),
  }));
}

r.get('/menus', ah(async (req, res) => {
  res.json(await many('SELECT * FROM menus WHERE site_id = $1 ORDER BY id', [req.site.id]));
}));

r.post('/menus', requireRole('admin'), ah(async (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) throw badRequest('Name is required');
  const slug = slugify(req.body.slug || name);
  if (await one('SELECT 1 FROM menus WHERE site_id = $1 AND slug = $2', [req.site.id, slug])) throw badRequest('That menu already exists');
  res.status(201).json(await one('INSERT INTO menus (site_id, name, slug, items) VALUES ($1,$2,$3,$4) RETURNING *',
    [req.site.id, name, slug, JSON.stringify(cleanMenuItems(req.body.items))]));
}));

r.put('/menus/:id', requireRole('editor'), ah(async (req, res) => {
  const m = await one('UPDATE menus SET name = COALESCE($3, name), items = $4, updated_at = now() WHERE id = $1 AND site_id = $2 RETURNING *',
    [req.params.id, req.site.id, req.body?.name || null, JSON.stringify(cleanMenuItems(req.body?.items))]);
  if (!m) throw notFound('Menu not found');
  res.json(m);
}));

r.delete('/menus/:id', requireRole('admin'), ah(async (req, res) => {
  await query('DELETE FROM menus WHERE id = $1 AND site_id = $2', [req.params.id, req.site.id]);
  res.json({ ok: true });
}));

// ============================================================================
// Site settings (logo, colours, social links, footer, analytics, webhook...)
// ============================================================================

const SETTING_KEYS = [
  'site_title', 'tagline', 'logo', 'logo_dark', 'favicon', 'primary_color', 'secondary_color',
  'email', 'phone', 'address', 'footer_text', 'copyright', 'social', 'analytics_id', 'custom_head',
  'default_seo', 'webhook_url', 'extra',
];

r.get('/settings', ah(async (req, res) => res.json(req.site.settings || {})));

r.put('/settings', requireRole('admin'), ah(async (req, res) => {
  const b = req.body || {};
  const next = { ...req.site.settings };
  for (const k of SETTING_KEYS) if (b[k] !== undefined) next[k] = b[k];
  if (Array.isArray(next.social)) next.social = next.social.filter((s) => s && s.url).map((s) => ({ platform: String(s.platform || ''), url: String(s.url) }));
  if (Array.isArray(next.extra)) next.extra = next.extra.filter((x) => x && x.key).map((x) => ({ key: slugify(x.key).replace(/-/g, '_'), value: String(x.value ?? '') }));
  // keep a plain logo_url for quick access in the site switcher
  if (next.logo) {
    const m = await one('SELECT url FROM media WHERE id = $1 AND site_id = $2', [next.logo, req.site.id]);
    next.logo_url = m?.url || null;
  } else next.logo_url = null;
  const s = await one('UPDATE sites SET settings = $2, updated_at = now() WHERE id = $1 RETURNING settings', [req.site.id, next]);
  res.json(s.settings);
}));

// ============================================================================
// Form submissions (posted from frontends via the public API)
// ============================================================================

r.get('/forms', requireRole('editor'), ah(async (req, res) => {
  const page = Math.max(intOr(req.query.page, 1), 1);
  const params = [req.site.id];
  let where = 'site_id = $1';
  if (req.query.form) { params.push(req.query.form); where += ' AND form = $2'; }
  const total = (await one(`SELECT count(*)::int AS n FROM form_submissions WHERE ${where}`, params)).n;
  params.push(50, (page - 1) * 50);
  const items = await many(`SELECT * FROM form_submissions WHERE ${where} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
  const forms = await many('SELECT form, count(*)::int AS n, count(*) FILTER (WHERE NOT is_read)::int AS unread FROM form_submissions WHERE site_id = $1 GROUP BY form', [req.site.id]);
  res.json({ items, total, page, pages: Math.ceil(total / 50), forms });
}));

r.put('/forms/:id', requireRole('editor'), ah(async (req, res) => {
  await query('UPDATE form_submissions SET is_read = $3 WHERE id = $1 AND site_id = $2', [req.params.id, req.site.id, !!req.body?.is_read]);
  res.json({ ok: true });
}));

r.delete('/forms/:id', requireRole('editor'), ah(async (req, res) => {
  await query('DELETE FROM form_submissions WHERE id = $1 AND site_id = $2', [req.params.id, req.site.id]);
  res.json({ ok: true });
}));

// ============================================================================
// Dashboard
// ============================================================================

r.get('/dashboard', ah(async (req, res) => {
  const id = req.site.id;
  const [counts, types, recent] = await Promise.all([
    one(`SELECT
      (SELECT count(*) FROM pages WHERE site_id = $1)::int AS pages,
      (SELECT count(*) FROM entries WHERE site_id = $1)::int AS entries,
      (SELECT count(*) FROM media WHERE site_id = $1)::int AS media,
      (SELECT count(*) FROM form_submissions WHERE site_id = $1 AND NOT is_read)::int AS unread_forms`, [id]),
    many(`SELECT ct.id, ct.name, ct.slug, count(e.id)::int AS n FROM content_types ct LEFT JOIN entries e ON e.content_type_id = ct.id
          WHERE ct.site_id = $1 GROUP BY ct.id ORDER BY ct.name`, [id]),
    many(`(SELECT 'page' AS kind, p.id, p.title, p.status, p.updated_at, NULL AS type_slug, NULL AS type_id FROM pages p WHERE site_id = $1)
          UNION ALL
          (SELECT 'entry', e.id, e.title, e.status, e.updated_at, ct.slug, ct.id FROM entries e JOIN content_types ct ON ct.id = e.content_type_id WHERE e.site_id = $1)
          ORDER BY updated_at DESC LIMIT 8`, [id]),
  ]);
  res.json({ counts, types, recent });
}));

export default r;
