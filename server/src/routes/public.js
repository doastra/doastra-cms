// Public, read-only API used by the websites. Authenticated by the site's API key.
//   Header:  x-api-key: dcms_xxx      (or ?key=dcms_xxx)
import { Router } from 'express';
import { one, many, query } from '../db/index.js';
import { ah, HttpError, notFound, intOr, badRequest } from '../lib/util.js';
import { getCached, setCached } from '../lib/cache.js';
import { userFromToken, roleOnSite } from '../lib/auth.js';
import { expandItems, publicEntry, SEO_FIELDS, publicMedia } from '../lib/fields.js';
import { sectionTypesForSite } from './structure.js';
import { config } from '../config.js';

const r = Router();

// ---- Resolve site from API key; enable draft preview for logged-in editors ----
r.use(ah(async (req, res, next) => {
  const key = req.headers['x-api-key'] || req.query.key;
  if (!key) throw new HttpError(401, 'Missing API key. Send it in the "x-api-key" header.');
  const site = await one('SELECT * FROM sites WHERE api_key = $1', [String(key)]);
  if (!site) throw new HttpError(401, 'Invalid API key');
  req.site = site;
  req.preview = false;
  if (req.query.preview && req.headers.authorization?.startsWith('Bearer ')) {
    const user = await userFromToken(req.headers.authorization.slice(7));
    if (user && (await roleOnSite(user, site.id))) req.preview = true;
  }
  res.set('Cache-Control', req.preview ? 'no-store' : `public, max-age=${config.publicCacheTtl}`);
  next();
}));

/** Serve from cache when possible. */
const cached = (fn) => ah(async (req, res) => {
  const key = req.originalUrl.replace(/([?&])key=[^&]*/, '$1');
  if (!req.preview && req.method === 'GET') {
    const hit = getCached(req.site.id, key);
    if (hit) { res.set('X-Cache', 'HIT'); return res.json(hit); }
  }
  const body = await fn(req, res);
  if (body === undefined) return;
  if (!req.preview) setCached(req.site.id, key, body);
  res.set('X-Cache', 'MISS');
  res.json(body);
});

const statusFilter = (req, alias = '') => (req.preview ? 'TRUE' : `${alias}status = 'published'`);
const contentTypes = (siteId) => many('SELECT * FROM content_types WHERE site_id = $1', [siteId]);

async function expandSeo(seo, ctx) {
  const [out] = await expandItems([{ fields: SEO_FIELDS, data: seo || {} }], ctx);
  return out;
}

// ---- Site: settings + menus (load once for header/footer) ---------------------
r.get('/site', cached(async (req) => {
  const s = { ...req.site.settings };
  delete s.webhook_url;
  const mediaIds = [s.logo, s.logo_dark, s.favicon, s.default_seo?.og_image].filter(Boolean);
  const media = mediaIds.length ? await many('SELECT * FROM media WHERE site_id = $1 AND id = ANY($2)', [req.site.id, mediaIds]) : [];
  const m = new Map(media.map((x) => [x.id, publicMedia(x)]));
  for (const k of ['logo', 'logo_dark', 'favicon']) s[k] = s[k] ? m.get(Number(s[k])) || null : null;
  if (s.default_seo?.og_image) s.default_seo = { ...s.default_seo, og_image: m.get(Number(s.default_seo.og_image)) || null };
  if (Array.isArray(s.extra)) s.extra = Object.fromEntries(s.extra.map((x) => [x.key, x.value]));
  delete s.logo_url;
  const menus = await many('SELECT slug, name, items FROM menus WHERE site_id = $1', [req.site.id]);
  return {
    name: req.site.name,
    domain: req.site.domain,
    settings: s,
    menus: Object.fromEntries(menus.map((x) => [x.slug, x.items])),
  };
}));

// ---- Pages ------------------------------------------------------------------
r.get('/pages', cached(async (req) => {
  const rows = await many(
    `SELECT id, title, slug, seo, published_at, updated_at FROM pages WHERE site_id = $1 AND ${statusFilter(req)} ORDER BY sort_order, title`,
    [req.site.id]);
  return rows.map(({ seo, ...p }) => ({ ...p, meta_title: seo?.meta_title || p.title }));
}));

r.get('/pages/:slug', cached(async (req) => {
  const p = await one(`SELECT * FROM pages WHERE site_id = $1 AND slug = $2 AND ${statusFilter(req)}`, [req.site.id, req.params.slug]);
  if (!p) throw notFound(`Page "${req.params.slug}" not found`);
  const typeRows = await sectionTypesForSite(req.site.id);
  const types = new Map();
  for (const t of typeRows) if (!types.has(t.key) || !t.shared) types.set(t.key, t);

  const visible = p.sections.filter((s) => !s.hidden && types.has(s.type));
  const ctx = { siteId: req.site.id, contentTypes: await contentTypes(req.site.id), includeDrafts: req.preview };
  const expanded = await expandItems(visible.map((s) => ({ fields: types.get(s.type).fields, data: s.data })), ctx);
  return {
    id: p.id,
    title: p.title,
    slug: p.slug,
    seo: await expandSeo(p.seo, ctx),
    published_at: p.published_at,
    updated_at: p.updated_at,
    sections: visible.map((s, i) => ({ id: s.id, type: s.type, ...(s.anchor ? { anchor: s.anchor } : {}), data: expanded[i] })),
  };
}));

// ---- Content (collections) --------------------------------------------------
async function findType(req) {
  const ct = await one('SELECT * FROM content_types WHERE site_id = $1 AND slug = $2', [req.site.id, req.params.type]);
  if (!ct) throw notFound(`Content type "${req.params.type}" not found`);
  return ct;
}

/**
 * GET /api/content/:type
 *   ?page=1&limit=12
 *   ?sort=latest|oldest|title|order
 *   ?search=text
 *   ?<taxonomy-slug>=<term-slug>   e.g. ?category=branding  (comma separated for OR)
 *   ?exclude=<slug>                skip one item (e.g. "more case studies")
 */
r.get('/content/:type', cached(async (req) => {
  const ct = await findType(req);
  const page = Math.max(intOr(req.query.page, 1), 1);
  const limit = Math.min(Math.max(intOr(req.query.limit, 12), 1), 100);
  const params = [ct.id];
  let where = `content_type_id = $1 AND ${statusFilter(req)}`;

  if (req.query.search) {
    params.push(`%${req.query.search}%`);
    where += ` AND (title ILIKE $${params.length} OR data::text ILIKE $${params.length})`;
  }
  if (req.query.exclude) { params.push(String(req.query.exclude)); where += ` AND slug <> $${params.length}`; }

  // taxonomy filters
  const taxFields = ct.fields.filter((f) => f.type === 'taxonomy');
  for (const f of taxFields) {
    const want = req.query[f.taxonomy] || req.query[f.key];
    if (!want) continue;
    const slugs = String(want).split(',').map((s) => s.trim()).filter(Boolean);
    const terms = await many(
      `SELECT t.id FROM terms t JOIN taxonomies x ON x.id = t.taxonomy_id WHERE x.site_id = $1 AND x.slug = $2 AND t.slug = ANY($3)`,
      [req.site.id, f.taxonomy, slugs]);
    if (!terms.length) return { items: [], total: 0, page, pages: 0 };
    const conds = terms.map((t) => { params.push(JSON.stringify({ [f.key]: [t.id] })); return `data @> $${params.length}::jsonb`; });
    where += ` AND (${conds.join(' OR ')})`;
  }

  const sort = req.query.sort || (ct.sort_by === 'sort_order' ? 'order' : ct.sort_by === 'title' ? 'title' : 'latest');
  const order = { latest: 'published_at DESC NULLS LAST, id DESC', oldest: 'published_at ASC NULLS LAST, id ASC', title: 'title ASC', order: 'sort_order ASC, id ASC' }[sort];
  if (!order) throw badRequest('sort must be latest, oldest, title or order');

  const total = (await one(`SELECT count(*)::int AS n FROM entries WHERE ${where}`, params)).n;
  params.push(limit, (page - 1) * limit);
  const rows = await many(`SELECT * FROM entries WHERE ${where} ORDER BY ${order} LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
  const ctx = { siteId: req.site.id, contentTypes: await contentTypes(req.site.id), includeDrafts: req.preview };
  const expanded = await expandItems(rows.map((e) => ({ fields: ct.fields, data: e.data })), ctx);
  return {
    content_type: { name: ct.name, singular_name: ct.singular_name, slug: ct.slug },
    items: rows.map((e, i) => publicEntry(e, ct, expanded[i])),
    total, page, limit, pages: Math.ceil(total / limit),
  };
}));

r.get('/content/:type/:slug', cached(async (req) => {
  const ct = await findType(req);
  const e = await one(`SELECT * FROM entries WHERE content_type_id = $1 AND slug = $2 AND ${statusFilter(req)}`, [ct.id, req.params.slug]);
  if (!e) throw notFound(`"${req.params.slug}" not found`);
  const ctx = { siteId: req.site.id, contentTypes: await contentTypes(req.site.id), includeDrafts: req.preview };
  const [data] = await expandItems([{ fields: ct.fields, data: e.data }], ctx);

  // previous / next item (handy for "next case study" links)
  const orderCol = ct.sort_by === 'sort_order' ? 'sort_order' : 'published_at';
  const [prev, next] = await Promise.all([
    one(`SELECT title, slug FROM entries WHERE content_type_id = $1 AND ${statusFilter(req)} AND id <> $3 AND (${orderCol}, id) < ($2, $3) ORDER BY ${orderCol} DESC, id DESC LIMIT 1`, [ct.id, e[orderCol], e.id]),
    one(`SELECT title, slug FROM entries WHERE content_type_id = $1 AND ${statusFilter(req)} AND id <> $3 AND (${orderCol}, id) > ($2, $3) ORDER BY ${orderCol} ASC, id ASC LIMIT 1`, [ct.id, e[orderCol], e.id]),
  ]);
  return { ...publicEntry(e, ct, data), seo: await expandSeo(e.seo, ctx), prev, next };
}));

// ---- Taxonomies & menus -----------------------------------------------------
r.get('/taxonomies/:slug', cached(async (req) => {
  const t = await one('SELECT * FROM taxonomies WHERE site_id = $1 AND slug = $2', [req.site.id, req.params.slug]);
  if (!t) throw notFound('Taxonomy not found');
  const terms = await many('SELECT id, name, slug, description, parent_id FROM terms WHERE taxonomy_id = $1 ORDER BY sort_order, name', [t.id]);
  return { name: t.name, slug: t.slug, terms };
}));

r.get('/menus/:slug', cached(async (req) => {
  const m = await one('SELECT name, slug, items FROM menus WHERE site_id = $1 AND slug = $2', [req.site.id, req.params.slug]);
  if (!m) throw notFound('Menu not found');
  return m;
}));

// ---- Search & sitemap ----------------------------------------------------------
r.get('/search', cached(async (req) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return { items: [] };
  const like = `%${q}%`;
  const items = await many(
    `(SELECT 'page' AS kind, NULL AS type, title, slug, updated_at FROM pages WHERE site_id = $1 AND status = 'published' AND (title ILIKE $2 OR sections::text ILIKE $2))
     UNION ALL
     (SELECT 'entry', ct.slug, e.title, e.slug, e.updated_at FROM entries e JOIN content_types ct ON ct.id = e.content_type_id
      WHERE e.site_id = $1 AND e.status = 'published' AND (e.title ILIKE $2 OR e.data::text ILIKE $2))
     ORDER BY updated_at DESC LIMIT 30`, [req.site.id, like]);
  return { items };
}));

r.get('/sitemap', cached(async (req) => {
  const pages = await many(`SELECT slug, updated_at FROM pages WHERE site_id = $1 AND status = 'published' AND NOT COALESCE((seo->>'noindex')::boolean, false)`, [req.site.id]);
  const entries = await many(
    `SELECT ct.slug AS type, e.slug, e.updated_at FROM entries e JOIN content_types ct ON ct.id = e.content_type_id
     WHERE e.site_id = $1 AND e.status = 'published' AND NOT COALESCE((e.seo->>'noindex')::boolean, false)`, [req.site.id]);
  return { pages, entries };
}));

// ---- Forms: frontends POST contact forms here -----------------------------------
r.post('/forms/:form', ah(async (req, res) => {
  const body = req.body || {};
  if (body._gotcha) return res.json({ ok: true }); // honeypot field for bots
  const data = {};
  for (const [k, v] of Object.entries(body).slice(0, 40)) {
    if (k.startsWith('_')) continue;
    data[k] = typeof v === 'string' ? v.slice(0, 5000) : v;
  }
  if (!Object.keys(data).length) throw badRequest('Form is empty');
  await query('INSERT INTO form_submissions (site_id, form, data) VALUES ($1,$2,$3)', [req.site.id, String(req.params.form).slice(0, 60), data]);
  res.status(201).json({ ok: true, message: 'Thank you! We received your message.' });
}));

export default r;
