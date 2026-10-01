// Field engine: validates field definitions (from the admin field builder),
// cleans submitted data against them, and expands IDs into full objects for the public API.
import { many } from '../db/index.js';
import { badRequest, keyify } from './util.js';

export const FIELD_TYPES = {
  text:       { label: 'Text' },
  textarea:   { label: 'Long text' },
  richtext:   { label: 'Rich text (editor)' },
  number:     { label: 'Number' },
  boolean:    { label: 'Yes / No' },
  date:       { label: 'Date' },
  select:     { label: 'Dropdown', needs: ['options'] },
  color:      { label: 'Colour' },
  link:       { label: 'Link / Button' },
  image:      { label: 'Image' },
  gallery:    { label: 'Gallery (multiple images)' },
  file:       { label: 'File / Video upload' },
  video:      { label: 'Video URL (YouTube/Vimeo/MP4)' },
  repeater:   { label: 'Repeater (list of items)', needs: ['fields'] },
  relation:   { label: 'Link to other content', needs: ['contentType'] },
  collection: { label: 'Auto list of content (latest N)', needs: ['contentType'] },
  taxonomy:   { label: 'Categories / Tags', needs: ['taxonomy'] },
};

/** Validate + normalise a field-definition array coming from the admin builder. */
export function normalizeFieldDefs(defs, path = 'fields') {
  if (!Array.isArray(defs)) throw badRequest(`${path} must be a list`);
  const seen = new Set();
  return defs.map((f, i) => {
    const where = `${path}[${i}]`;
    if (!f || typeof f !== 'object') throw badRequest(`${where} is invalid`);
    const label = String(f.label || '').trim();
    const key = keyify(f.key || label);
    if (!label) throw badRequest(`${where}: label is required`);
    if (!key) throw badRequest(`${where}: key is required`);
    if (seen.has(key)) throw badRequest(`Duplicate field key "${key}" in ${path}`);
    seen.add(key);
    const type = f.type;
    if (!FIELD_TYPES[type]) throw badRequest(`${where}: unknown field type "${type}"`);

    const out = { key, label, type };
    if (f.required) out.required = true;
    if (f.help) out.help = String(f.help);
    if (f.placeholder) out.placeholder = String(f.placeholder);
    if (f.default !== undefined && f.default !== '') out.default = f.default;
    if (f.width && ['full', 'half', 'third'].includes(f.width)) out.width = f.width;

    if (type === 'select') {
      const opts = (f.options || [])
        .map((o) => (typeof o === 'string' ? { label: o, value: keyify(o) || o } : { label: String(o.label ?? o.value), value: String(o.value ?? o.label) }))
        .filter((o) => o.label);
      if (!opts.length) throw badRequest(`${where}: dropdown needs at least one option`);
      out.options = opts;
      if (f.multiple) out.multiple = true;
    }
    if (type === 'repeater') {
      out.fields = normalizeFieldDefs(f.fields || [], `${where}.fields`);
      if (!out.fields.length) throw badRequest(`${where}: repeater needs at least one sub-field`);
      if (f.itemLabel) out.itemLabel = String(f.itemLabel);
      if (f.max) out.max = Number(f.max);
    }
    if (type === 'relation' || type === 'collection') {
      if (!f.contentType) throw badRequest(`${where}: choose which content type to link to`);
      out.contentType = String(f.contentType);
      if (type === 'relation' && f.multiple) out.multiple = true;
    }
    if (type === 'taxonomy') {
      if (!f.taxonomy) throw badRequest(`${where}: choose a taxonomy`);
      out.taxonomy = String(f.taxonomy);
    }
    if (type === 'file' && f.accept) out.accept = String(f.accept);
    return out;
  });
}

const toId = (v) => {
  if (v && typeof v === 'object' && v.id != null) v = v.id;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
};
const toIds = (v) => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v]).map(toId).filter((n) => n != null);

function isEmpty(v) {
  return v == null || v === '' || (Array.isArray(v) && v.length === 0);
}

/**
 * Cleans submitted data to match the field definitions (drops unknown keys, coerces types).
 * When `strict` is true, required fields are enforced (used when publishing).
 */
export function cleanData(fields, data = {}, { strict = false, path = '' } = {}) {
  const out = {};
  const errors = [];
  data = data && typeof data === 'object' ? data : {};
  for (const f of fields) {
    let v = data[f.key];
    switch (f.type) {
      case 'text': case 'textarea': case 'richtext': case 'color': case 'video':
        v = v == null ? '' : String(v); break;
      case 'number':
        v = v === '' || v == null ? null : Number(v);
        if (Number.isNaN(v)) v = null; break;
      case 'boolean':
        v = v === true || v === 'true' || v === 1 || v === '1'; break;
      case 'date':
        v = v ? String(v) : null; break;
      case 'select':
        if (f.multiple) v = (Array.isArray(v) ? v : v ? [v] : []).map(String);
        else v = v == null ? '' : String(v);
        break;
      case 'link':
        v = v && typeof v === 'object'
          ? { label: String(v.label || ''), url: String(v.url || ''), target: v.target === '_blank' ? '_blank' : '_self' }
          : { label: '', url: '', target: '_self' };
        break;
      case 'image': case 'file':
        v = toId(v); break;
      case 'gallery': case 'taxonomy':
        v = toIds(v); break;
      case 'relation':
        v = f.multiple ? toIds(v) : toId(v); break;
      case 'collection':
        v = { limit: Math.min(Math.max(parseInt(v?.limit, 10) || 6, 1), 100), sort: v?.sort === 'oldest' ? 'oldest' : v?.sort === 'order' ? 'order' : 'latest', terms: toIds(v?.terms) };
        break;
      case 'repeater': {
        const items = Array.isArray(v) ? v : [];
        v = items.map((item, i) => {
          const r = cleanData(f.fields, item, { strict, path: `${path}${f.label} #${i + 1} › ` });
          errors.push(...r.errors);
          return { _id: item?._id || Math.random().toString(36).slice(2, 10), ...r.data };
        });
        break;
      }
    }
    if (strict && f.required && (isEmpty(v) || (f.type === 'link' && !v.url))) {
      errors.push(`${path}${f.label} is required`);
    }
    out[f.key] = v;
  }
  return { data: out, errors };
}

// ---------------------------------------------------------------------------
// Expansion for the public API
// ---------------------------------------------------------------------------

export function publicMedia(m) {
  if (!m) return null;
  return { id: m.id, url: m.url, alt: m.alt, mime: m.mime, width: m.width, height: m.height, size: m.size, sizes: m.sizes, name: m.original_name };
}

/** Walk data by schema, calling visit(field, value) for every field (recursing into repeaters). */
function walk(fields, data, visit) {
  if (!data) return;
  for (const f of fields) {
    const v = data[f.key];
    if (f.type === 'repeater' && Array.isArray(v)) v.forEach((item) => walk(f.fields, item, visit));
    else visit(f, v);
  }
}

function mapData(fields, data, fn) {
  if (!data) return data;
  const out = { ...data };
  for (const f of fields) {
    const v = data[f.key];
    if (f.type === 'repeater' && Array.isArray(v)) {
      out[f.key] = v.map(({ _id, ...item }) => mapData(f.fields, item, fn));
    } else {
      out[f.key] = fn(f, v);
    }
  }
  return out;
}

/**
 * Expands a batch of { fields, data } items for one site:
 *   image/file/gallery → media objects
 *   taxonomy           → [{ id, name, slug }]
 *   relation           → entry objects (one level deep)
 *   collection         → { items: [...entries] }
 * ctx = { siteId, contentTypes (array), depth }
 */
export async function expandItems(items, ctx) {
  const depth = ctx.depth || 0;
  const mediaIds = new Set();
  const termIds = new Set();
  const entryIds = new Set();
  const collections = []; // { field, value }

  for (const it of items) {
    walk(it.fields, it.data, (f, v) => {
      if (f.type === 'image' || f.type === 'file') { if (v) mediaIds.add(v); }
      else if (f.type === 'gallery') (v || []).forEach((id) => mediaIds.add(id));
      else if (f.type === 'taxonomy') (v || []).forEach((id) => termIds.add(id));
      else if (f.type === 'relation') (Array.isArray(v) ? v : v ? [v] : []).forEach((id) => entryIds.add(id));
      else if (f.type === 'collection' && depth === 0) collections.push({ f, v });
    });
  }

  const ctBySlug = new Map(ctx.contentTypes.map((c) => [c.slug, c]));
  const ctById = new Map(ctx.contentTypes.map((c) => [c.id, c]));

  const [mediaRows, termRows, relRows] = await Promise.all([
    mediaIds.size ? many('SELECT * FROM media WHERE site_id = $1 AND id = ANY($2)', [ctx.siteId, [...mediaIds]]) : [],
    termIds.size ? many('SELECT id, name, slug, parent_id FROM terms WHERE id = ANY($1)', [[...termIds]]) : [],
    entryIds.size
      ? many(`SELECT * FROM entries WHERE site_id = $1 AND id = ANY($2) ${ctx.includeDrafts ? '' : "AND status = 'published'"}`, [ctx.siteId, [...entryIds]])
      : [],
  ]);

  // Collections: query latest N entries of a type
  const collectionResults = new Map();
  for (const { f, v } of collections) {
    const ct = ctBySlug.get(f.contentType);
    if (!ct) continue;
    const cacheKey = JSON.stringify([f.contentType, v]);
    if (collectionResults.has(cacheKey)) continue;
    const params = [ct.id, v?.limit || 6];
    let where = `content_type_id = $1 ${ctx.includeDrafts ? '' : "AND status = 'published'"}`;
    if (v?.terms?.length) {
      const taxFields = ct.fields.filter((x) => x.type === 'taxonomy').map((x) => x.key);
      if (taxFields.length) {
        const conds = [];
        for (const key of taxFields) {
          for (const t of v.terms) {
            params.push(JSON.stringify({ [key]: [t] }));
            conds.push(`data @> $${params.length}::jsonb`);
          }
        }
        where += ` AND (${conds.join(' OR ')})`;
      }
    }
    const order = v?.sort === 'oldest' ? 'published_at ASC NULLS LAST' : v?.sort === 'order' ? 'sort_order ASC, id ASC' : 'published_at DESC NULLS LAST, id DESC';
    const rows = await many(`SELECT * FROM entries WHERE ${where} ORDER BY ${order} LIMIT $2`, params);
    collectionResults.set(cacheKey, rows);
  }

  // Expand related + collection entries one level deeper (so their images come through)
  const nestedEntries = [...relRows, ...[...collectionResults.values()].flat()];
  const nestedById = new Map();
  if (depth < 1 && nestedEntries.length) {
    const uniq = [...new Map(nestedEntries.map((e) => [e.id, e])).values()];
    const expanded = await expandItems(
      uniq.map((e) => ({ fields: ctById.get(e.content_type_id)?.fields || [], data: e.data })),
      { ...ctx, depth: depth + 1 }
    );
    uniq.forEach((e, i) => nestedById.set(e.id, publicEntry(e, ctById.get(e.content_type_id), expanded[i])));
  } else {
    nestedEntries.forEach((e) => nestedById.set(e.id, publicEntry(e, ctById.get(e.content_type_id), null)));
  }

  const mediaMap = new Map(mediaRows.map((m) => [m.id, publicMedia(m)]));
  const termMap = new Map(termRows.map((t) => [t.id, t]));

  return items.map((it) =>
    mapData(it.fields, it.data, (f, v) => {
      switch (f.type) {
        case 'image': case 'file': return v ? mediaMap.get(v) || null : null;
        case 'gallery': return (v || []).map((id) => mediaMap.get(id)).filter(Boolean);
        case 'taxonomy': return (v || []).map((id) => termMap.get(id)).filter(Boolean);
        case 'relation':
          return Array.isArray(v) ? v.map((id) => nestedById.get(id)).filter(Boolean) : v ? nestedById.get(v) || null : null;
        case 'collection': {
          if (depth > 0) return v;
          const rows = collectionResults.get(JSON.stringify([f.contentType, v])) || [];
          return { content_type: f.contentType, items: rows.map((r) => nestedById.get(r.id)).filter(Boolean) };
        }
        default: return v;
      }
    })
  );
}

export function publicEntry(e, ct, expandedData) {
  return {
    id: e.id,
    type: ct?.slug,
    title: e.title,
    slug: e.slug,
    data: expandedData ?? e.data,
    seo: e.seo,
    sort_order: e.sort_order,
    published_at: e.published_at,
    updated_at: e.updated_at,
  };
}

/** Built-in SEO fields available on pages and on content types with has_seo. */
export const SEO_FIELDS = [
  { key: 'meta_title', label: 'Meta title', type: 'text' },
  { key: 'meta_description', label: 'Meta description', type: 'textarea' },
  { key: 'og_image', label: 'Social share image', type: 'image' },
  { key: 'canonical_url', label: 'Canonical URL', type: 'text' },
  { key: 'noindex', label: 'Hide from search engines', type: 'boolean' },
];
