// The "field builder": admins design the fields of a section type or content type here.
import { useState } from 'react';
import { useSite } from '../context.jsx';
import { keyify, uid } from '../api.js';
import { move } from './ui.jsx';

export const FIELD_TYPES = [
  ['text', 'Text', 'Short text – titles, names'],
  ['textarea', 'Long text', 'Plain paragraph'],
  ['richtext', 'Rich text', 'Editor with headings, bold, lists, links'],
  ['image', 'Image', 'One image'],
  ['gallery', 'Gallery', 'Multiple images'],
  ['file', 'File / Video', 'Upload a PDF, video, etc.'],
  ['video', 'Video URL', 'YouTube / Vimeo / MP4 link'],
  ['link', 'Link / Button', 'Text + URL'],
  ['repeater', 'Repeater', 'A list of items, each with its own fields'],
  ['select', 'Dropdown', 'Pick from options'],
  ['boolean', 'Yes / No', 'Checkbox'],
  ['number', 'Number', ''],
  ['date', 'Date', ''],
  ['color', 'Colour', 'Colour picker'],
  ['relation', 'Link to content', 'Pick items from another content type'],
  ['collection', 'Auto list of content', 'Latest N items of a content type'],
  ['taxonomy', 'Categories / Tags', 'Pick terms of a taxonomy'],
];
const TYPE_LABEL = Object.fromEntries(FIELD_TYPES.map(([t, l]) => [t, l]));

const optionsToText = (opts = []) => opts.map((o) => (o.value === keyify(o.label) ? o.label : `${o.value} : ${o.label}`)).join('\n');
const textToOptions = (txt) => txt.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
  const m = l.match(/^(.+?)\s*:\s*(.+)$/);
  return m ? { value: m[1].trim(), label: m[2].trim() } : { value: keyify(l) || l, label: l };
});

function FieldEditor({ field, onChange, depth }) {
  const { contentTypes, taxonomies } = useSite();
  const set = (patch) => onChange({ ...field, ...patch });
  const [optText, setOptText] = useState(optionsToText(field.options));
  const t = field.type;

  return (
    <div className="block-body">
      <div className="fields-grid">
        <div className="field w-half">
          <label>Label<span className="req">*</span></label>
          <input className="input" value={field.label} autoFocus={!field.label}
            onChange={(e) => set({ label: e.target.value, ...(field._autoKey !== false ? { key: keyify(e.target.value) } : {}) })} />
        </div>
        <div className="field w-half">
          <label>Key (used in the API)</label>
          <input className="input" value={field.key} disabled={field._locked}
            onChange={(e) => set({ key: keyify(e.target.value), _autoKey: false })} />
          {field._locked && <div className="help">Saved keys can’t be changed – it would break the frontend.</div>}
        </div>
        <div className="field w-half">
          <label>Field type</label>
          <select className="input" value={t} onChange={(e) => set({ type: e.target.value })}>
            {FIELD_TYPES.filter(([x]) => depth < 2 || x !== 'repeater').map(([x, l, d]) => <option key={x} value={x}>{l}{d ? ` – ${d}` : ''}</option>)}
          </select>
        </div>
        <div className="field w-half">
          <label>Width in the form</label>
          <select className="input" value={field.width || 'full'} onChange={(e) => set({ width: e.target.value })}>
            <option value="full">Full width</option><option value="half">Half</option><option value="third">One third</option>
          </select>
        </div>
        <div className="field">
          <label>Help text for editors</label>
          <input className="input" value={field.help || ''} placeholder="Optional hint shown under the field" onChange={(e) => set({ help: e.target.value })} />
        </div>

        {t === 'select' && (
          <div className="field">
            <label>Options (one per line)</label>
            <textarea className="input" value={optText} placeholder={'Small\nMedium\nLarge'}
              onChange={(e) => { setOptText(e.target.value); set({ options: textToOptions(e.target.value) }); }} />
            <div className="help">Optionally write <code>value : Label</code>. </div>
            <label className="check" style={{ marginTop: 8 }}><input type="checkbox" checked={!!field.multiple} onChange={(e) => set({ multiple: e.target.checked })} />Allow choosing several</label>
          </div>
        )}
        {(t === 'relation' || t === 'collection') && (
          <div className="field">
            <label>Content type</label>
            <select className="input" value={field.contentType || ''} onChange={(e) => set({ contentType: e.target.value })}>
              <option value="">Choose…</option>
              {contentTypes.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}
              {field.contentType && !contentTypes.find((c) => c.slug === field.contentType) && <option value={field.contentType}>{field.contentType} (not on this site)</option>}
            </select>
            {t === 'relation' && <label className="check" style={{ marginTop: 8 }}><input type="checkbox" checked={!!field.multiple} onChange={(e) => set({ multiple: e.target.checked })} />Allow several items</label>}
          </div>
        )}
        {t === 'taxonomy' && (
          <div className="field">
            <label>Taxonomy</label>
            <select className="input" value={field.taxonomy || ''} onChange={(e) => set({ taxonomy: e.target.value })}>
              <option value="">Choose…</option>
              {taxonomies.map((x) => <option key={x.id} value={x.slug}>{x.name}</option>)}
            </select>
            {!taxonomies.length && <div className="help">Create one first under “Categories &amp; Tags”.</div>}
          </div>
        )}
        {t === 'file' && (
          <div className="field w-half">
            <label>Allowed files</label>
            <select className="input" value={field.accept || ''} onChange={(e) => set({ accept: e.target.value })}>
              <option value="">Any file</option><option value="video/*">Videos only</option><option value="image/*">Images only</option><option value="application/pdf">PDF only</option>
            </select>
          </div>
        )}
        {(t === 'text' || t === 'textarea') && (
          <div className="field w-half">
            <label>Placeholder</label>
            <input className="input" value={field.placeholder || ''} onChange={(e) => set({ placeholder: e.target.value })} />
          </div>
        )}
        {t === 'repeater' && (
          <>
            <div className="field w-half">
              <label>Item name</label>
              <input className="input" value={field.itemLabel || ''} placeholder="e.g. Slide, Card, Member" onChange={(e) => set({ itemLabel: e.target.value })} />
            </div>
            <div className="field w-half">
              <label>Max items (optional)</label>
              <input className="input" type="number" value={field.max || ''} onChange={(e) => set({ max: e.target.value ? Number(e.target.value) : undefined })} />
            </div>
            <div className="field">
              <label>Fields of each item</label>
              <FieldBuilder value={field.fields || []} onChange={(fields) => set({ fields })} depth={depth + 1} />
            </div>
          </>
        )}
        <div className="field">
          <label className="check"><input type="checkbox" checked={!!field.required} onChange={(e) => set({ required: e.target.checked })} />Required (must be filled before publishing)</label>
        </div>
      </div>
    </div>
  );
}

/** Edits a list of field definitions. Marks fields loaded from the server as _locked (key not editable). */
export default function FieldBuilder({ value, onChange, depth = 0 }) {
  const [open, setOpen] = useState(null);
  const [dragIdx, setDragIdx] = useState(null);
  const fields = value || [];
  const update = (i, f) => onChange(fields.map((x, xi) => (xi === i ? f : x)));
  const add = () => {
    const f = { _uid: uid(), label: '', key: '', type: 'text' };
    onChange([...fields, f]);
    setOpen(f._uid);
  };

  return (
    <div>
      {fields.length === 0 && <div className="muted small" style={{ marginBottom: 10 }}>No fields yet.</div>}
      {fields.map((f, i) => {
        const id = f._uid || (f._uid = uid());
        const isOpen = open === id;
        return (
          <div key={id} className={`block ${dragIdx === i ? 'dragging' : ''}`}
            draggable={!isOpen}
            onDragStart={() => setDragIdx(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.stopPropagation(); if (dragIdx != null && dragIdx !== i) onChange(move(fields, dragIdx, i)); setDragIdx(null); }}
            onDragEnd={() => setDragIdx(null)}>
            <div className="block-head" onClick={() => setOpen(isOpen ? null : id)}>
              <span className="drag" title="Drag to reorder">⋮⋮</span>
              <span className="title">{f.label || <span className="muted">New field</span>}
                <span className="sub"><code>{f.key}</code></span></span>
              <span className="badge">{TYPE_LABEL[f.type] || f.type}</span>
              {f.required && <span className="badge brand">required</span>}
              <span onClick={(e) => e.stopPropagation()} className="row" style={{ gap: 0 }}>
                <button type="button" className="icon-btn" disabled={i === 0} onClick={() => onChange(move(fields, i, i - 1))}>↑</button>
                <button type="button" className="icon-btn" disabled={i === fields.length - 1} onClick={() => onChange(move(fields, i, i + 1))}>↓</button>
                <button type="button" className="icon-btn" title="Delete field" onClick={() => onChange(fields.filter((_, x) => x !== i))}>🗑</button>
              </span>
            </div>
            {isOpen && <FieldEditor field={f} depth={depth} onChange={(nf) => update(i, nf)} />}
          </div>
        );
      })}
      <button type="button" className="btn sm" onClick={add}>＋ Add field</button>
    </div>
  );
}

/** Mark saved fields as locked + strip UI-only props before sending to the server. */
export function lockFields(fields = []) {
  return fields.map((f) => ({ ...f, _uid: uid(), _locked: true, _autoKey: false, ...(f.fields ? { fields: lockFields(f.fields) } : {}) }));
}
export function stripFields(fields = []) {
  return fields.map(({ _uid, _locked, _autoKey, ...f }) => ({ ...f, ...(f.fields ? { fields: stripFields(f.fields) } : {}) }));
}
