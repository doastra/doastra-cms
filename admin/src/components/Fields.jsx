// Renders a form automatically from a list of field definitions.
// This is what makes every section type / content type editable without writing code.
import { useEffect, useState } from 'react';
import { useSite } from '../context.jsx';
import { MediaField } from './Media.jsx';
import RichText from './RichText.jsx';
import { uid, slugify } from '../api.js';
import { move, useToast } from './ui.jsx';

/** Empty value for a field type (used when adding a section or repeater item). */
export function emptyValue(f) {
  if (f.default !== undefined) return f.default;
  switch (f.type) {
    case 'boolean': return false;
    case 'number': case 'image': case 'file': case 'date': return null;
    case 'gallery': case 'taxonomy': case 'repeater': return [];
    case 'relation': return f.multiple ? [] : null;
    case 'select': return f.multiple ? [] : (f.options?.[0]?.value ?? '');
    case 'link': return { label: '', url: '', target: '_self' };
    case 'collection': return { limit: 6, sort: 'latest', terms: [] };
    default: return '';
  }
}
export function emptyData(fields) {
  return Object.fromEntries(fields.map((f) => [f.key, emptyValue(f)]));
}

/** A short text summary of an item (used in collapsed headers). */
export function summarize(fields, data) {
  for (const f of fields) {
    const v = data?.[f.key];
    if (['text', 'textarea'].includes(f.type) && v) return String(v).slice(0, 80);
    if (f.type === 'link' && v?.label) return v.label;
  }
  return '';
}

export function DynamicFields({ fields, value, onChange }) {
  const data = value || {};
  const set = (key, v) => onChange({ ...data, [key]: v });
  return (
    <div className="fields-grid">
      {fields.map((f) => (
        <div key={f.key} className={`field ${f.width === 'half' ? 'w-half' : f.width === 'third' ? 'w-third' : ''}`}>
          {f.type !== 'boolean' && <label>{f.label}{f.required && <span className="req">*</span>}</label>}
          <FieldInput field={f} value={data[f.key]} onChange={(v) => set(f.key, v)} />
          {f.help && <div className="help">{f.help}</div>}
        </div>
      ))}
    </div>
  );
}

export function FieldInput({ field: f, value, onChange }) {
  switch (f.type) {
    case 'text':
      return <input className="input" value={value ?? ''} placeholder={f.placeholder} onChange={(e) => onChange(e.target.value)} />;
    case 'textarea':
      return <textarea className="input" value={value ?? ''} placeholder={f.placeholder} onChange={(e) => onChange(e.target.value)} />;
    case 'richtext':
      return <RichText value={value ?? ''} onChange={onChange} />;
    case 'number':
      return <input className="input" type="number" value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))} />;
    case 'boolean':
      return <label className="check"><input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />{f.label}</label>;
    case 'date':
      return <input className="input" type="date" value={value ? String(value).slice(0, 10) : ''} onChange={(e) => onChange(e.target.value || null)} />;
    case 'color':
      return (
        <div className="color-input">
          <input type="color" value={/^#[0-9a-f]{6}$/i.test(value || '') ? value : '#000000'} onChange={(e) => onChange(e.target.value)} />
          <input className="input" value={value ?? ''} placeholder="#ff4d2e" onChange={(e) => onChange(e.target.value)} />
        </div>
      );
    case 'video':
      return <input className="input" value={value ?? ''} placeholder="https://youtube.com/watch?v=… or https://…/video.mp4" onChange={(e) => onChange(e.target.value)} />;
    case 'select':
      if (f.multiple) {
        const arr = Array.isArray(value) ? value : [];
        return (
          <div className="multi-select">
            {f.options.map((o) => {
              const on = arr.includes(o.value);
              return <span key={o.value} className={`chip ${on ? 'on' : ''}`} onClick={() => onChange(on ? arr.filter((x) => x !== o.value) : [...arr, o.value])}>{on ? '✓ ' : ''}{o.label}</span>;
            })}
          </div>
        );
      }
      return (
        <select className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
          {!f.required && <option value="">—</option>}
          {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
    case 'link': {
      const v = value || { label: '', url: '', target: '_self' };
      return (
        <div className="row wrap">
          <input className="input grow" style={{ minWidth: 140 }} placeholder="Button text" value={v.label} onChange={(e) => onChange({ ...v, label: e.target.value })} />
          <input className="input grow" style={{ minWidth: 180 }} placeholder="URL e.g. /contact or https://…" value={v.url} onChange={(e) => onChange({ ...v, url: e.target.value })} />
          <label className="check small"><input type="checkbox" checked={v.target === '_blank'} onChange={(e) => onChange({ ...v, target: e.target.checked ? '_blank' : '_self' })} />New tab</label>
        </div>
      );
    }
    case 'image':
      return <MediaField value={value} onChange={onChange} accept="image/*" />;
    case 'gallery':
      return <MediaField value={value} onChange={onChange} multiple accept="image/*" />;
    case 'file':
      return <MediaField value={value} onChange={onChange} accept={f.accept} />;
    case 'repeater':
      return <Repeater field={f} value={value} onChange={onChange} />;
    case 'relation':
      return <RelationInput field={f} value={value} onChange={onChange} />;
    case 'taxonomy':
      return <TaxonomyInput field={f} value={value} onChange={onChange} />;
    case 'collection':
      return <CollectionInput field={f} value={value} onChange={onChange} />;
    default:
      return <div className="alert error">Unknown field type: {f.type}</div>;
  }
}

function Repeater({ field: f, value, onChange }) {
  const items = Array.isArray(value) ? value : [];
  const [open, setOpen] = useState(() => new Set(items.length <= 2 ? items.map((i) => i._id) : []));
  const toggle = (id) => setOpen((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const add = () => {
    const item = { _id: uid(), ...emptyData(f.fields) };
    onChange([...items, item]);
    setOpen((s) => new Set(s).add(item._id));
  };
  const label = f.itemLabel || 'Item';
  return (
    <div>
      {items.map((item, i) => {
        const id = item._id || (item._id = uid());
        const isOpen = open.has(id);
        return (
          <div key={id} className="block">
            <div className="block-head" onClick={() => toggle(id)}>
              <span className="muted">{isOpen ? '▾' : '▸'}</span>
              <span className="title">{label} {i + 1}<span className="sub">{summarize(f.fields, item)}</span></span>
              <span onClick={(e) => e.stopPropagation()} className="row" style={{ gap: 0 }}>
                <button type="button" className="icon-btn" disabled={i === 0} onClick={() => onChange(move(items, i, i - 1))} title="Move up">↑</button>
                <button type="button" className="icon-btn" disabled={i === items.length - 1} onClick={() => onChange(move(items, i, i + 1))} title="Move down">↓</button>
                <button type="button" className="icon-btn" title="Duplicate" onClick={() => { const c = { ...structuredClone(item), _id: uid() }; const n = [...items]; n.splice(i + 1, 0, c); onChange(n); }}>⧉</button>
                <button type="button" className="icon-btn" title="Remove" onClick={() => onChange(items.filter((_, x) => x !== i))}>🗑</button>
              </span>
            </div>
            {isOpen && (
              <div className="block-body">
                <DynamicFields fields={f.fields} value={item} onChange={(v) => onChange(items.map((x, xi) => (xi === i ? { ...v, _id: id } : x)))} />
              </div>
            )}
          </div>
        );
      })}
      {(!f.max || items.length < f.max) && <button type="button" className="btn sm" onClick={add}>＋ Add {label.toLowerCase()}</button>}
    </div>
  );
}

function useEntryOptions(typeSlug) {
  const { api } = useSite();
  const [opts, setOpts] = useState(null);
  useEffect(() => {
    api.get(`/entries?type=${encodeURIComponent(typeSlug)}&limit=200`).then((r) => setOpts(r.items)).catch(() => setOpts([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeSlug]);
  return opts;
}

function RelationInput({ field: f, value, onChange }) {
  const opts = useEntryOptions(f.contentType);
  if (!opts) return <div className="muted small">Loading…</div>;
  if (!opts.length) return <div className="muted small">No items in “{f.contentType}” yet.</div>;
  if (!f.multiple) {
    return (
      <select className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
        <option value="">— None —</option>
        {opts.map((o) => <option key={o.id} value={o.id}>{o.title}{o.status === 'draft' ? ' (draft)' : ''}</option>)}
      </select>
    );
  }
  const arr = Array.isArray(value) ? value : [];
  const byId = new Map(opts.map((o) => [o.id, o]));
  return (
    <div className="stack" style={{ '--gap': 8 }}>
      {arr.length > 0 && (
        <div>
          {arr.map((id, i) => (
            <div key={id} className="row" style={{ padding: '6px 10px', border: '1px solid var(--line)', borderRadius: 8, marginBottom: 6, background: '#fff' }}>
              <span className="grow">{byId.get(id)?.title || `#${id} (deleted)`}</span>
              <button type="button" className="icon-btn" disabled={i === 0} onClick={() => onChange(move(arr, i, i - 1))}>↑</button>
              <button type="button" className="icon-btn" disabled={i === arr.length - 1} onClick={() => onChange(move(arr, i, i + 1))}>↓</button>
              <button type="button" className="icon-btn" onClick={() => onChange(arr.filter((x) => x !== id))}>✕</button>
            </div>
          ))}
        </div>
      )}
      <select className="input" value="" onChange={(e) => e.target.value && onChange([...arr, Number(e.target.value)])}>
        <option value="">＋ Add…</option>
        {opts.filter((o) => !arr.includes(o.id)).map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
      </select>
    </div>
  );
}

function TaxonomyInput({ field: f, value, onChange }) {
  const { taxonomies, api, reload } = useSite();
  const toast = useToast();
  const [adding, setAdding] = useState('');
  const tax = taxonomies.find((t) => t.slug === f.taxonomy);
  if (!tax) return <div className="alert error small">Taxonomy “{f.taxonomy}” does not exist. Create it under Categories &amp; Tags.</div>;
  const arr = Array.isArray(value) ? value : [];
  const addTerm = async () => {
    if (!adding.trim()) return;
    try {
      const t = await api.post(`/taxonomies/${tax.id}/terms`, { name: adding.trim(), slug: slugify(adding) });
      await reload();
      onChange([...arr, t.id]);
      setAdding('');
    } catch (e) { toast.error(e); }
  };
  return (
    <div>
      <div className="multi-select">
        {tax.terms.map((t) => {
          const on = arr.includes(t.id);
          return <span key={t.id} className={`chip ${on ? 'on' : ''}`} onClick={() => onChange(on ? arr.filter((x) => x !== t.id) : [...arr, t.id])}>{on ? '✓ ' : ''}{t.name}</span>;
        })}
      </div>
      <div className="input-group" style={{ marginTop: 8, maxWidth: 320 }}>
        <input className="input sm" placeholder={`New ${tax.name.toLowerCase()}…`} value={adding} onChange={(e) => setAdding(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTerm())} />
        <button type="button" className="btn sm" onClick={addTerm}>Add</button>
      </div>
    </div>
  );
}

function CollectionInput({ field: f, value, onChange }) {
  const { contentTypes, taxonomies } = useSite();
  const v = value || { limit: 6, sort: 'latest', terms: [] };
  const ct = contentTypes.find((c) => c.slug === f.contentType);
  if (!ct) return <div className="alert error small">Content type “{f.contentType}” does not exist on this site. Create it under Content types.</div>;
  const taxFields = ct.fields.filter((x) => x.type === 'taxonomy');
  const terms = taxFields.flatMap((tf) => taxonomies.find((t) => t.slug === tf.taxonomy)?.terms || []);
  const set = (k, x) => onChange({ ...v, [k]: x });
  return (
    <div className="card card-pad" style={{ background: '#fff' }}>
      <div className="muted small" style={{ marginBottom: 10 }}>Shows {ct.name} automatically – new items appear without editing this page.</div>
      <div className="row wrap">
        <label className="small">How many
          <input className="input sm" type="number" min={1} max={100} style={{ width: 90, display: 'block' }} value={v.limit} onChange={(e) => set('limit', Number(e.target.value))} />
        </label>
        <label className="small">Order
          <select className="input sm" style={{ display: 'block' }} value={v.sort} onChange={(e) => set('sort', e.target.value)}>
            <option value="latest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="order">Manual order</option>
          </select>
        </label>
      </div>
      {terms.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div className="small muted" style={{ marginBottom: 6 }}>Only show these categories (optional)</div>
          <div className="multi-select">
            {terms.map((t) => {
              const on = v.terms?.includes(t.id);
              return <span key={t.id} className={`chip ${on ? 'on' : ''}`} onClick={() => set('terms', on ? v.terms.filter((x) => x !== t.id) : [...(v.terms || []), t.id])}>{t.name}</span>;
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export const SEO_FIELDS = [
  { key: 'meta_title', label: 'Meta title', type: 'text', help: 'Shown in Google results and the browser tab. Leave empty to use the title.' },
  { key: 'meta_description', label: 'Meta description', type: 'textarea', help: 'About 150 characters.' },
  { key: 'og_image', label: 'Social share image', type: 'image', help: 'Shown when the link is shared on WhatsApp, LinkedIn, etc.' },
  { key: 'canonical_url', label: 'Canonical URL', type: 'text' },
  { key: 'noindex', label: 'Hide from search engines', type: 'boolean' },
];
