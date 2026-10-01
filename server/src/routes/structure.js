// Section types (page-builder blocks) and content types (collections) – the "structure" of a site.
import { Router } from 'express';
import { one, many, query } from '../db/index.js';
import { ah, badRequest, notFound, forbidden, keyify, slugify } from '../lib/util.js';
import { requireRole } from '../lib/auth.js';
import { normalizeFieldDefs, FIELD_TYPES } from '../lib/fields.js';

const r = Router({ mergeParams: true });

r.get('/field-types', (_req, res) => {
  res.json(Object.entries(FIELD_TYPES).map(([type, d]) => ({ type, ...d })));
});

// ---- Section types ----------------------------------------------------------

/** Site sections + shared library. A site-specific section overrides a shared one with the same key. */
export async function sectionTypesForSite(siteId) {
  return many(
    `SELECT *, (site_id IS NULL) AS shared FROM section_types
     WHERE site_id = $1 OR site_id IS NULL ORDER BY (site_id IS NULL), name`, [siteId]);
}

r.get('/section-types', ah(async (req, res) => {
  const rows = await sectionTypesForSite(req.site.id);
  const usage = await many(
    `SELECT s->>'type' AS key, count(*)::int AS n FROM pages p, jsonb_array_elements(p.sections) s
     WHERE p.site_id = $1 GROUP BY 1`, [req.site.id]);
  const used = Object.fromEntries(usage.map((u) => [u.key, u.n]));
  const siteKeys = new Set(rows.filter((r) => !r.shared).map((r) => r.key));
  res.json(rows.map((s) => ({ ...s, used_count: used[s.key] || 0, overridden: s.shared && siteKeys.has(s.key) })));
}));

r.get('/section-types/:id', ah(async (req, res) => {
  const s = await one('SELECT *, (site_id IS NULL) AS shared FROM section_types WHERE id = $1 AND (site_id = $2 OR site_id IS NULL)', [req.params.id, req.site.id]);
  if (!s) throw notFound('Section type not found');
  res.json(s);
}));

function canEditSection(req, shared) {
  if (shared && !req.user.is_super_admin) throw forbidden('Only super admins can edit shared sections');
  if (req.role !== 'admin') throw forbidden('Only site admins can edit section types');
}

r.post('/section-types', ah(async (req, res) => {
  const b = req.body || {};
  const shared = !!b.shared;
  canEditSection(req, shared);
  const name = String(b.name || '').trim();
  if (!name) throw badRequest('Section name is required');
  const key = keyify(b.key || name);
  const fields = normalizeFieldDefs(b.fields || []);
  const exists = await one('SELECT 1 FROM section_types WHERE COALESCE(site_id,0) = $1 AND key = $2', [shared ? 0 : req.site.id, key]);
  if (exists) throw badRequest(`A section with key "${key}" already exists`);
  const s = await one(
    `INSERT INTO section_types (site_id, name, key, description, icon, fields) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *, (site_id IS NULL) AS shared`,
    [shared ? null : req.site.id, name, key, b.description || null, b.icon || null, JSON.stringify(fields)]
  );
  res.status(201).json(s);
}));

r.put('/section-types/:id', ah(async (req, res) => {
  const cur = await one('SELECT * FROM section_types WHERE id = $1 AND (site_id = $2 OR site_id IS NULL)', [req.params.id, req.site.id]);
  if (!cur) throw notFound('Section type not found');
  canEditSection(req, cur.site_id === null);
  const b = req.body || {};
  const fields = b.fields ? normalizeFieldDefs(b.fields) : cur.fields;
  // Key is kept stable – changing it would break pages and frontends that use it.
  const s = await one(
    `UPDATE section_types SET name = $2, description = $3, icon = $4, fields = $5, updated_at = now()
     WHERE id = $1 RETURNING *, (site_id IS NULL) AS shared`,
    [cur.id, String(b.name ?? cur.name).trim(), b.description ?? cur.description, b.icon ?? cur.icon, JSON.stringify(fields)]
  );
  res.json(s);
}));

r.delete('/section-types/:id', ah(async (req, res) => {
  const cur = await one('SELECT * FROM section_types WHERE id = $1 AND (site_id = $2 OR site_id IS NULL)', [req.params.id, req.site.id]);
  if (!cur) throw notFound('Section type not found');
  canEditSection(req, cur.site_id === null);
  await query('DELETE FROM section_types WHERE id = $1', [cur.id]);
  res.json({ ok: true });
}));

/** Copy a shared section into this site so it can be customised just for this site. */
r.post('/section-types/:id/copy-to-site', requireRole('admin'), ah(async (req, res) => {
  const cur = await one('SELECT * FROM section_types WHERE id = $1 AND site_id IS NULL', [req.params.id]);
  if (!cur) throw notFound('Shared section not found');
  if (await one('SELECT 1 FROM section_types WHERE site_id = $1 AND key = $2', [req.site.id, cur.key])) {
    throw badRequest('This site already has its own version of this section');
  }
  const s = await one(
    `INSERT INTO section_types (site_id, name, key, description, icon, fields) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *, false AS shared`,
    [req.site.id, cur.name, cur.key, cur.description, cur.icon, JSON.stringify(cur.fields)]
  );
  res.status(201).json(s);
}));

// ---- Content types ------------------------------------------------------------

r.get('/content-types', ah(async (req, res) => {
  res.json(await many(
    `SELECT ct.*, (SELECT count(*) FROM entries e WHERE e.content_type_id = ct.id)::int AS entry_count
     FROM content_types ct WHERE site_id = $1 ORDER BY name`, [req.site.id]));
}));

r.get('/content-types/:id', ah(async (req, res) => {
  const ct = await one('SELECT * FROM content_types WHERE id = $1 AND site_id = $2', [req.params.id, req.site.id]);
  if (!ct) throw notFound('Content type not found');
  res.json(ct);
}));

function ctBody(b, cur = {}) {
  const name = String(b.name ?? cur.name ?? '').trim();
  if (!name) throw badRequest('Name is required (e.g. "Case Studies")');
  return {
    name,
    singular_name: String(b.singular_name || cur.singular_name || name.replace(/s$/i, '')).trim(),
    icon: b.icon ?? cur.icon ?? null,
    fields: JSON.stringify(b.fields ? normalizeFieldDefs(b.fields) : cur.fields || []),
    has_seo: b.has_seo ?? cur.has_seo ?? true,
    sort_by: ['published_at', 'sort_order', 'title'].includes(b.sort_by) ? b.sort_by : cur.sort_by || 'published_at',
  };
}

r.post('/content-types', requireRole('admin'), ah(async (req, res) => {
  const b = req.body || {};
  const d = ctBody(b);
  const slug = slugify(b.slug || d.name);
  if (['pages', 'site', 'menus', 'taxonomies', 'forms', 'sitemap'].includes(slug)) throw badRequest(`"${slug}" is reserved, choose another name`);
  if (await one('SELECT 1 FROM content_types WHERE site_id = $1 AND slug = $2', [req.site.id, slug])) {
    throw badRequest(`A content type with slug "${slug}" already exists`);
  }
  const ct = await one(
    `INSERT INTO content_types (site_id, name, singular_name, slug, icon, fields, has_seo, sort_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [req.site.id, d.name, d.singular_name, slug, d.icon, d.fields, d.has_seo, d.sort_by]
  );
  res.status(201).json(ct);
}));

r.put('/content-types/:id', requireRole('admin'), ah(async (req, res) => {
  const cur = await one('SELECT * FROM content_types WHERE id = $1 AND site_id = $2', [req.params.id, req.site.id]);
  if (!cur) throw notFound('Content type not found');
  const d = ctBody(req.body || {}, cur);
  const ct = await one(
    `UPDATE content_types SET name=$2, singular_name=$3, icon=$4, fields=$5, has_seo=$6, sort_by=$7, updated_at=now()
     WHERE id = $1 RETURNING *`,
    [cur.id, d.name, d.singular_name, d.icon, d.fields, d.has_seo, d.sort_by]
  );
  res.json(ct);
}));

r.delete('/content-types/:id', requireRole('admin'), ah(async (req, res) => {
  const ct = await one('DELETE FROM content_types WHERE id = $1 AND site_id = $2 RETURNING id', [req.params.id, req.site.id]);
  if (!ct) throw notFound('Content type not found');
  res.json({ ok: true });
}));

export default r;
