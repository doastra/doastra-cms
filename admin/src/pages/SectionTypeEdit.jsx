import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useSite, useAuth } from '../context.jsx';
import { TopBar } from '../components/Layout.jsx';
import { Spinner, useConfirm, useToast, useUnsavedWarning, Field } from '../components/ui.jsx';
import FieldBuilder, { lockFields, stripFields } from '../components/FieldBuilder.jsx';
import { DynamicFields, emptyData } from '../components/Fields.jsx';
import { keyify } from '../api.js';

const ICONS = ['🎬', '📝', '🖼️', '📊', '🏷️', '🧩', '💼', '💬', '▶️', '❓', '📣', '✉️', '〰️', '⭐', '🚀', '🧭', '👥', '📍', '🎯', '🛠️', '🧱', '✨'];

export function exampleJson(fields, depth = 0) {
  const o = {};
  for (const f of fields) {
    o[f.key] = {
      text: 'Text', textarea: 'Paragraph…', richtext: '<p>HTML…</p>', number: 0, boolean: true, date: '2026-01-01',
      select: f.multiple ? [f.options?.[0]?.value] : f.options?.[0]?.value, color: '#ff4d2e', video: 'https://…',
      link: { label: 'Button', url: '/page', target: '_self' },
      image: { id: 1, url: 'https://…/image.jpg', alt: '…', width: 1600, height: 900, sizes: { thumb: '…', medium: '…', large: '…' } },
      file: { id: 2, url: 'https://…/file.mp4', mime: 'video/mp4' },
      gallery: [{ id: 1, url: '…', sizes: {} }],
      taxonomy: [{ id: 1, name: 'Category', slug: 'category' }],
      relation: f.multiple ? [{ id: 1, title: '…', slug: '…', data: {} }] : { id: 1, title: '…', slug: '…', data: {} },
      collection: { content_type: f.contentType, items: [{ id: 1, title: '…', slug: '…', data: {} }] },
      repeater: depth < 2 ? [exampleJson(f.fields || [], depth + 1)] : [],
    }[f.type];
  }
  return o;
}

export default function SectionTypeEdit() {
  const { id } = useParams();
  const isNew = id === 'new';
  const { api, siteId, reload } = useSite();
  const { user } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const [doc, setDocState] = useState(isNew ? { name: '', key: '', description: '', icon: '🧩', fields: [], shared: false } : null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState('fields');
  const [preview, setPreview] = useState({});
  useUnsavedWarning(dirty);

  useEffect(() => {
    if (isNew) return;
    api.get(`/section-types/${id}`).then((s) => setDocState({ ...s, fields: lockFields(s.fields) })).catch((e) => toast.error(e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  if (!doc) return <Spinner />;
  const set = (patch) => { setDocState({ ...doc, ...patch }); setDirty(true); };

  const save = async () => {
    setSaving(true);
    try {
      const body = { ...doc, key: doc.key || keyify(doc.name), fields: stripFields(doc.fields) };
      const saved = isNew ? await api.post('/section-types', body) : await api.put(`/section-types/${id}`, body);
      setDocState({ ...saved, fields: lockFields(saved.fields) }); setDirty(false);
      await reload();
      toast.success('Section type saved');
      if (isNew) nav(`/s/${siteId}/sections/${saved.id}`, { replace: true });
    } catch (e) { toast.error(e); } finally { setSaving(false); }
  };

  const remove = async () => {
    const msg = doc.used_count ? `This section is used ${doc.used_count} time(s) on pages. Those sections will stop showing.` : 'Delete this section type?';
    if (!(await confirm(msg, { okText: 'Delete' }))) return;
    try { await api.del(`/section-types/${id}`); await reload(); toast.success('Deleted'); nav(`/s/${siteId}/sections`); } catch (e) { toast.error(e); }
  };

  const fieldsClean = stripFields(doc.fields).filter((f) => f.key);

  return (
    <>
      <TopBar title={isNew ? 'New section type' : doc.name} sub={doc.shared ? 'Shared library – used by all websites' : 'This site only'} back={`/s/${siteId}/sections`}>
        {!isNew && <button className="btn danger" onClick={remove}>Delete</button>}
        <button className="btn primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
      </TopBar>
      <div className="content">
        <div className="edit-layout">
          <div>
            <div className="tabs">
              <button className={tab === 'fields' ? 'on' : ''} onClick={() => setTab('fields')}>Fields ({doc.fields.length})</button>
              <button className={tab === 'preview' ? 'on' : ''} onClick={() => setTab('preview')}>Form preview</button>
              <button className={tab === 'api' ? 'on' : ''} onClick={() => setTab('api')}>API output</button>
            </div>
            {tab === 'fields' && <FieldBuilder value={doc.fields} onChange={(fields) => set({ fields })} />}
            {tab === 'preview' && (
              <div className="card card-pad">
                <div className="muted small" style={{ marginBottom: 12 }}>This is exactly what editors will see when they add this section to a page.</div>
                {fieldsClean.length ? <DynamicFields fields={fieldsClean} value={{ ...emptyData(fieldsClean), ...preview }} onChange={setPreview} /> : <div className="muted">Add fields first.</div>}
              </div>
            )}
            {tab === 'api' && (
              <div className="stack">
                <div className="muted small">Each section on a page comes out of <code>GET /api/pages/:slug</code> like this:</div>
                <pre>{JSON.stringify({ id: 'a1b2c3', type: doc.key || keyify(doc.name) || 'section_key', data: exampleJson(fieldsClean) }, null, 2)}</pre>
              </div>
            )}
          </div>
          <div className="edit-side stack">
            <div className="card card-pad">
              <Field label="Name" required><input className="input" value={doc.name} placeholder="e.g. Hero with video"
                onChange={(e) => set({ name: e.target.value, ...(isNew ? { key: keyify(e.target.value) } : {}) })} /></Field>
              <Field label="Key" help={isNew ? 'Used by the frontend to pick the component. Cannot be changed later.' : 'Cannot be changed.'}>
                <input className="input" value={doc.key} disabled={!isNew} onChange={(e) => set({ key: keyify(e.target.value) })} />
              </Field>
              <Field label="Description"><textarea className="input" style={{ minHeight: 60 }} value={doc.description || ''} onChange={(e) => set({ description: e.target.value })} /></Field>
              <Field label="Icon">
                <div className="row wrap" style={{ gap: 4 }}>
                  {ICONS.map((ic) => <button key={ic} type="button" className={`chip ${doc.icon === ic ? 'on' : ''}`} style={{ padding: '3px 7px' }} onClick={() => set({ icon: ic })}>{ic}</button>)}
                </div>
              </Field>
              {isNew && user.is_super_admin && (
                <label className="check"><input type="checkbox" checked={doc.shared} onChange={(e) => set({ shared: e.target.checked })} />Shared – available to all websites</label>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
