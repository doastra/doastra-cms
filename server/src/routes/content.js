// Entries (items of a content type) and Pages (stacks of sections), with revision history.
import { Router } from 'express';
import { one, many, query, tx } from '../db/index.js';
import { ah, badRequest, notFound, forbidden, intOr, uniqueSlug } from '../lib/util.js';
import { requireRole, hasRole } from '../lib/auth.js';
import { cleanData, SEO_FIELDS } from '../lib/fields.js';
import { sectionTypesForSite } from './structure.js';

const r = Router({ mergeParams: true });
const MAX_REVISIONS = 30;

async function saveRevision(db, type, row, userId) {
  await db.query('INSERT INTO revisions (entity_type, entity_id, snapshot, user_id) VALUES ($1,$2,$3,$4)', [type, row.id, row, userId]);
  await db.query(
    `DELETE FROM revisions WHERE entity_type = $1 AND entity_id = $2 AND id NOT IN (
       SELECT id FROM revisions WHERE entity_type = $1 AND entity_id = $2 ORDER BY created_at DESC LIMIT $3)`,
    [type, row.id, MAX_REVISIONS]
  );
}

const cleanSeo = (seo) => cleanData(SEO_FIELDS, seo).data;

function publishTime(status, requested, current) {
  if (status !== 'published') return current || null;
  return requested ? new Date(requested) : current || new Date();
}

// ============================================================================
// Entries
// ============================================================================

async function getCt(req, idOrSlug) {
  const ct = /^\d+$/.test(String(idOrSlug))
    ? await one('SELECT * FROM content_types WHERE id = $1 AND site_id = $2', [idOrSlug, req.site.id])
    : await one('SELECT * FROM content_types WHERE slug = $1 AND site_id = $2', [idOrSlug, req.site.id]);
  if (!ct) throw notFound('Content type not found');
  return ct;
}

r.get('/entries', ah(async (req, res) => {
  if (!req.query.type) throw badRequest('Pass ?type=<content type slug or id>');
  const ct = await getCt(req, req.query.type);
  const page = Math.max(intOr(req.query.page, 1), 1);
  const limit = Math.min(Math.max(intOr(req.query.limit, 25), 1), 200);
  const params = [ct.id];
  let where = 'e.content_type_id = $1';
  if (req.query.status) { params.push(req.query.status); where += ` AND e.status = $${params.length}`; }
  if (req.query.search) { params.push(`%${req.query.search}%`); where += ` AND (e.title ILIKE $${params.length} OR e.slug ILIKE $${params.length})`; }
  // Category column/filter: use the content type's taxonomy field (prefer one named like "categor*")
  const taxFields = (ct.fields || []).filter((f) => f.type === 'taxonomy');
  const catField = taxFields.find((f) => /categor/i.test(f.taxonomy + f.key)) || taxFields[0] || null;
  if (catField && req.query.term) {
    const termId = intOr(req.query.term, 0);
    if (termId) { params.push(JSON.stringify([termId])); where += ` AND COALESCE(e.data->'${catField.key.replace(/'/g, "''")}', '[]'::jsonb) @> $${params.length}::jsonb`; }
  }
  const order = ct.sort_by === 'sort_order' ? 'e.sort_order ASC, e.id DESC' : ct.sort_by === 'title' ? 'e.title ASC' : 'COALESCE(e.published_at, e.created_at) DESC, e.id DESC';
  const total = (await one(`SELECT count(*)::int AS n FROM entries e WHERE ${where}`, params)).n;
  params.push(limit, (page - 1) * limit);
  const items = await many(
    `SELECT e.id, e.title, e.slug, e.status, e.sort_order, e.published_at, e.updated_at, e.data, u.name AS author_name, e.author_id
     FROM entries e LEFT JOIN users u ON u.id = e.author_id WHERE ${where} ORDER BY ${order}
     LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
  let categories = null;
  if (catField) {
    const terms = await many(
      `SELECT x.id, x.name FROM terms x JOIN taxonomies t ON t.id = x.taxonomy_id
       WHERE t.site_id = $1 AND t.slug = $2 ORDER BY x.sort_order, x.name`, [req.site.id, catField.taxonomy]);
    const names = new Map(terms.map((t) => [t.id, t.name]));
    for (const it of items) it.categories = (it.data?.[catField.key] || []).map((id) => names.get(id)).filter(Boolean);
    categories = { label: catField.label || 'Category', terms };
  }
  res.json({ content_type: ct, items, total, page, pages: Math.ceil(total / limit), categories });
}));

r.get('/entries/:id', ah(async (req, res) => {
  const e = await one('SELECT * FROM entries WHERE id = $1 AND site_id = $2', [req.params.id, req.site.id]);
  if (!e) throw notFound('Entry not found');
  const ct = await one('SELECT * FROM content_types WHERE id = $1', [e.content_type_id]);
  res.json({ ...e, content_type: ct });
}));

function checkAuthorOwns(req, entry) {
  if (!hasRole(req, 'editor') && entry.author_id !== req.user.id) throw forbidden('Authors can only edit their own items');
}

function entryPayload(ct, b, cur = {}) {
  const status = b.status === 'published' ? 'published' : b.status === 'draft' ? 'draft' : cur.status || 'draft';
  const title = String(b.title ?? cur.title ?? '').trim();
  if (!title) throw badRequest('Title is required');
  const { data, errors } = cleanData(ct.fields, b.data ?? cur.data, { strict: status === 'published' });
  if (errors.length) throw badRequest('Please fill the required fields', errors);
  return {
    title, status, data,
    seo: cleanSeo(b.seo ?? cur.seo),
    sort_order: intOr(b.sort_order, cur.sort_order ?? 0),
    published_at: publishTime(status, b.published_at, cur.published_at),
  };
}

r.post('/entries', requireRole('author'), ah(async (req, res) => {
  const b = req.body || {};
  const ct = await getCt(req, b.content_type_id || b.type);
  const p = entryPayload(ct, b);
  const slug = await uniqueSlug({ query }, 'entries', 'content_type_id', ct.id, b.slug || p.title);
  const e = await one(
    `INSERT INTO entries (site_id, content_type_id, title, slug, status, data, seo, sort_order, published_at, author_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [req.site.id, ct.id, p.title, slug, p.status, p.data, p.seo, p.sort_order, p.published_at, req.user.id]
  );
  res.status(201).json(e);
}));

r.put('/entries/:id', requireRole('author'), ah(async (req, res) => {
  const cur = await one('SELECT * FROM entries WHERE id = $1 AND site_id = $2', [req.params.id, req.site.id]);
  if (!cur) throw notFound('Entry not found');
  checkAuthorOwns(req, cur);
  const ct = await one('SELECT * FROM content_types WHERE id = $1', [cur.content_type_id]);
  const b = req.body || {};
  const p = entryPayload(ct, b, cur);
  const slug = b.slug && b.slug !== cur.slug
    ? await uniqueSlug({ query }, 'entries', 'content_type_id', ct.id, b.slug, cur.id)
    : cur.slug;
  const e = await tx(async (db) => {
    await saveRevision(db, 'entry', cur, req.user.id);
    const { rows: [row] } = await db.query(
      `UPDATE entries SET title=$2, slug=$3, status=$4, data=$5, seo=$6, sort_order=$7, published_at=$8, updated_at=now()
       WHERE id = $1 RETURNING *`,
      [cur.id, p.title, slug, p.status, p.data, p.seo, p.sort_order, p.published_at]
    );
    return row;
  });
  res.json(e);
}));

r.delete('/entries/:id', requireRole('author'), ah(async (req, res) => {
  const cur = await one('SELECT * FROM entries WHERE id = $1 AND site_id = $2', [req.params.id, req.site.id]);
  if (!cur) throw notFound('Entry not found');
  checkAuthorOwns(req, cur);
  await query('DELETE FROM entries WHERE id = $1', [cur.id]);
  await query(`DELETE FROM revisions WHERE entity_type = 'entry' AND entity_id = $1`, [cur.id]);
  res.json({ ok: true });
}));

r.post('/entries/:id/duplicate', requireRole('author'), ah(async (req, res) => {
  const cur = await one('SELECT * FROM entries WHERE id = $1 AND site_id = $2', [req.params.id, req.site.id]);
  if (!cur) throw notFound('Entry not found');
  const slug = await uniqueSlug({ query }, 'entries', 'content_type_id', cur.content_type_id, cur.slug);
  const e = await one(
    `INSERT INTO entries (site_id, content_type_id, title, slug, status, data, seo, sort_order, author_id)
     VALUES ($1,$2,$3,$4,'draft',$5,$6,$7,$8) RETURNING *`,
    [req.site.id, cur.content_type_id, `${cur.title} (copy)`, slug, cur.data, cur.seo, cur.sort_order, req.user.id]
  );
  res.status(201).json(e);
}));

/** Save drag-and-drop order: body { ids: [3, 1, 2] } */
r.post('/entries/reorder', requireRole('editor'), ah(async (req, res) => {
  const ids = (req.body?.ids || []).map(Number);
  await tx(async (db) => {
    for (let i = 0; i < ids.length; i++) {
      await db.query('UPDATE entries SET sort_order = $1 WHERE id = $2 AND site_id = $3', [i, ids[i], req.site.id]);
    }
  });
  res.json({ ok: true });
}));

// ============================================================================
// Pages
// ============================================================================

async function sectionMap(siteId) {
  const rows = await sectionTypesForSite(siteId);
  const map = new Map();
  for (const s of rows) if (!map.has(s.key) || !s.shared) map.set(s.key, s); // site-specific wins
  return map;
}

function cleanSections(sections, map, strict) {
  if (!Array.isArray(sections)) throw badRequest('sections must be a list');
  const errors = [];
  const out = sections.map((s, i) => {
    const st = map.get(s?.type);
    if (!st) throw badRequest(`Section #${i + 1}: unknown section type "${s?.type}"`);
    const r = cleanData(st.fields, s.data, { strict: strict && !s.hidden, path: `${st.name} (section ${i + 1}) › ` });
    errors.push(...r.errors);
    return {
      id: s.id || Math.random().toString(36).slice(2, 10),
      type: st.key,
      ...(s.anchor ? { anchor: String(s.anchor) } : {}),
      ...(s.hidden ? { hidden: true } : {}),
      data: r.data,
    };
  });
  if (errors.length) throw badRequest('Please fill the required fields', errors);
  return out;
}

r.get('/pages', ah(async (req, res) => {
  res.json(await many(
    `SELECT p.id, p.title, p.slug, p.status, p.sort_order, p.published_at, p.updated_at,
       jsonb_array_length(p.sections) AS section_count, u.name AS author_name
     FROM pages p LEFT JOIN users u ON u.id = p.author_id WHERE p.site_id = $1 ORDER BY p.sort_order, p.title`, [req.site.id]));
}));

r.get('/pages/:id', ah(async (req, res) => {
  const p = await one('SELECT * FROM pages WHERE id = $1 AND site_id = $2', [req.params.id, req.site.id]);
  if (!p) throw notFound('Page not found');
  res.json(p);
}));

function pagePayload(b, cur = {}, map) {
  const status = b.status === 'published' ? 'published' : b.status === 'draft' ? 'draft' : cur.status || 'draft';
  const title = String(b.title ?? cur.title ?? '').trim();
  if (!title) throw badRequest('Title is required');
  return {
    title, status,
    sections: cleanSections(b.sections ?? cur.sections ?? [], map, status === 'published'),
    seo: cleanSeo(b.seo ?? cur.seo),
    sort_order: intOr(b.sort_order, cur.sort_order ?? 0),
    published_at: publishTime(status, b.published_at, cur.published_at),
  };
}

r.post('/pages', requireRole('editor'), ah(async (req, res) => {
  const b = req.body || {};
  const p = pagePayload(b, {}, await sectionMap(req.site.id));
  const slug = await uniqueSlug({ query }, 'pages', 'site_id', req.site.id, b.slug || p.title);
  const row = await one(
    `INSERT INTO pages (site_id, title, slug, status, sections, seo, sort_order, published_at, author_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [req.site.id, p.title, slug, p.status, JSON.stringify(p.sections), p.seo, p.sort_order, p.published_at, req.user.id]
  );
  res.status(201).json(row);
}));

r.put('/pages/:id', requireRole('editor'), ah(async (req, res) => {
  const cur = await one('SELECT * FROM pages WHERE id = $1 AND site_id = $2', [req.params.id, req.site.id]);
  if (!cur) throw notFound('Page not found');
  const b = req.body || {};
  const p = pagePayload(b, cur, await sectionMap(req.site.id));
  const slug = b.slug && b.slug !== cur.slug ? await uniqueSlug({ query }, 'pages', 'site_id', req.site.id, b.slug, cur.id) : cur.slug;
  const row = await tx(async (db) => {
    await saveRevision(db, 'page', cur, req.user.id);
    const { rows: [x] } = await db.query(
      `UPDATE pages SET title=$2, slug=$3, status=$4, sections=$5, seo=$6, sort_order=$7, published_at=$8, updated_at=now()
       WHERE id = $1 RETURNING *`,
      [cur.id, p.title, slug, p.status, JSON.stringify(p.sections), p.seo, p.sort_order, p.published_at]
    );
    return x;
  });
  res.json(row);
}));

r.delete('/pages/:id', requireRole('editor'), ah(async (req, res) => {
  const p = await one('DELETE FROM pages WHERE id = $1 AND site_id = $2 RETURNING id', [req.params.id, req.site.id]);
  if (!p) throw notFound('Page not found');
  await query(`DELETE FROM revisions WHERE entity_type = 'page' AND entity_id = $1`, [p.id]);
  res.json({ ok: true });
}));

r.post('/pages/:id/duplicate', requireRole('editor'), ah(async (req, res) => {
  const cur = await one('SELECT * FROM pages WHERE id = $1 AND site_id = $2', [req.params.id, req.site.id]);
  if (!cur) throw notFound('Page not found');
  const slug = await uniqueSlug({ query }, 'pages', 'site_id', req.site.id, cur.slug);
  const row = await one(
    `INSERT INTO pages (site_id, title, slug, status, sections, seo, sort_order, author_id)
     VALUES ($1,$2,$3,'draft',$4,$5,$6,$7) RETURNING *`,
    [req.site.id, `${cur.title} (copy)`, slug, JSON.stringify(cur.sections), cur.seo, cur.sort_order, req.user.id]
  );
  res.status(201).json(row);
}));

r.post('/pages/reorder', requireRole('editor'), ah(async (req, res) => {
  const ids = (req.body?.ids || []).map(Number);
  await tx(async (db) => {
    for (let i = 0; i < ids.length; i++) await db.query('UPDATE pages SET sort_order = $1 WHERE id = $2 AND site_id = $3', [i, ids[i], req.site.id]);
  });
  res.json({ ok: true });
}));

// ============================================================================
// Revisions
// ============================================================================

async function ownedEntity(req, type, id) {
  const table = type === 'page' ? 'pages' : 'entries';
  const row = await one(`SELECT * FROM ${table} WHERE id = $1 AND site_id = $2`, [id, req.site.id]);
  if (!row) throw notFound();
  return row;
}

r.get('/:type(pages|entries)/:id/revisions', ah(async (req, res) => {
  const type = req.params.type === 'pages' ? 'page' : 'entry';
  await ownedEntity(req, type, req.params.id);
  res.json(await many(
    `SELECT r.id, r.created_at, u.name AS user_name, r.snapshot->>'title' AS title, r.snapshot->>'status' AS status
     FROM revisions r LEFT JOIN users u ON u.id = r.user_id
     WHERE entity_type = $1 AND entity_id = $2 ORDER BY r.created_at DESC`, [type, req.params.id]));
}));

r.post('/:type(pages|entries)/:id/revisions/:revId/restore', requireRole('author'), ah(async (req, res) => {
  const type = req.params.type === 'pages' ? 'page' : 'entry';
  if (type === 'page' && !hasRole(req, 'editor')) throw forbidden();
  const cur = await ownedEntity(req, type, req.params.id);
  if (type === 'entry') checkAuthorOwns(req, cur);
  const rev = await one('SELECT * FROM revisions WHERE id = $1 AND entity_type = $2 AND entity_id = $3', [req.params.revId, type, cur.id]);
  if (!rev) throw notFound('Revision not found');
  const s = rev.snapshot;
  const row = await tx(async (db) => {
    await saveRevision(db, type, cur, req.user.id);
    const sql = type === 'page'
      ? `UPDATE pages SET title=$2, sections=$3, seo=$4, updated_at=now() WHERE id=$1 RETURNING *`
      : `UPDATE entries SET title=$2, data=$3, seo=$4, updated_at=now() WHERE id=$1 RETURNING *`;
    const { rows: [x] } = await db.query(sql, [cur.id, s.title, JSON.stringify(type === 'page' ? s.sections : s.data), s.seo || {}]);
    return x;
  });
  res.json(row);
}));

export default r;
