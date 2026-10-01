import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useSite } from '../context.jsx';
import { TopBar } from '../components/Layout.jsx';
import { Spinner, useConfirm, useToast, useUnsavedWarning, Field } from '../components/ui.jsx';
import FieldBuilder, { lockFields, stripFields } from '../components/FieldBuilder.jsx';
import { exampleJson } from './SectionTypeEdit.jsx';
import { slugify } from '../api.js';

const ICONS = ['📰', '💼', '👥', '🛠️', '⭐', '📦', '🎓', '🏢', '📅', '🎥', '💬', '📁', '🧪', '🏆', '🍽️', '🏠'];

export default function ContentTypeEdit() {
  const { id } = useParams();
  const isNew = id === 'new';
  const { api, siteId, reload } = useSite();
  const nav = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const [doc, setDocState] = useState(isNew ? { name: '', singular_name: '', slug: '', icon: '📁', fields: [], has_seo: true, sort_by: 'published_at' } : null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState('fields');
  useUnsavedWarning(dirty);

  useEffect(() => {
    if (isNew) return;
    api.get(`/content-types/${id}`).then((c) => setDocState({ ...c, fields: lockFields(c.fields) })).catch((e) => toast.error(e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  if (!doc) return <Spinner />;
  const set = (patch) => { setDocState({ ...doc, ...patch }); setDirty(true); };

  const save = async () => {
    setSaving(true);
    try {
      const body = { ...doc, slug: doc.slug || slugify(doc.name), fields: stripFields(doc.fields) };
      const saved = isNew ? await api.post('/content-types', body) : await api.put(`/content-types/${id}`, body);
      setDocState({ ...saved, fields: lockFields(saved.fields) }); setDirty(false);
      await reload();
      toast.success('Content type saved');
      if (isNew) nav(`/s/${siteId}/content-types/${saved.id}`, { replace: true });
    } catch (e) { toast.error(e); } finally { setSaving(false); }
  };

  const remove = async () => {
    if (!(await confirm(`Delete “${doc.name}” and ALL its items? This cannot be undone.`, { okText: 'Delete everything' }))) return;
    try { await api.del(`/content-types/${id}`); await reload(); toast.success('Deleted'); nav(`/s/${siteId}/content-types`); } catch (e) { toast.error(e); }
  };

  const fieldsClean = stripFields(doc.fields).filter((f) => f.key);
  const slug = doc.slug || slugify(doc.name) || 'slug';

  return (
    <>
      <TopBar title={isNew ? 'New content type' : doc.name} sub={!isNew && `/api/content/${doc.slug}`} back={`/s/${siteId}/content-types`}>
        {!isNew && <button className="btn" onClick={() => nav(`/s/${siteId}/content/${doc.slug}`)}>View items</button>}
        {!isNew && <button className="btn danger" onClick={remove}>Delete</button>}
        <button className="btn primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
      </TopBar>
      <div className="content">
        <div className="edit-layout">
          <div>
            <div className="tabs">
              <button className={tab === 'fields' ? 'on' : ''} onClick={() => setTab('fields')}>Fields ({doc.fields.length})</button>
              <button className={tab === 'api' ? 'on' : ''} onClick={() => setTab('api')}>API output</button>
            </div>
            {tab === 'fields' ? (
              <>
                <div className="muted small" style={{ marginBottom: 10 }}>Every item already has <b>Title</b>, <b>Slug</b>, <b>Status</b>{doc.has_seo ? <> and <b>SEO</b></> : null}. Add the extra fields you need.</div>
                <FieldBuilder value={doc.fields} onChange={(fields) => set({ fields })} />
              </>
            ) : (
              <div className="stack">
                <div className="muted small"><code>GET /api/content/{slug}?page=1&amp;limit=12</code> returns <code>{'{ items: [...], total, page, pages }'}</code>. Each item:</div>
                <pre>{JSON.stringify({ id: 1, type: slug, title: 'Title', slug: 'item-slug', data: exampleJson(fieldsClean), seo: doc.has_seo ? { meta_title: '', meta_description: '', og_image: null } : {}, published_at: '2026-01-01T00:00:00Z' }, null, 2)}</pre>
              </div>
            )}
          </div>
          <div className="edit-side stack">
            <div className="card card-pad">
              <Field label="Name (plural)" required><input className="input" value={doc.name} placeholder="e.g. Case Studies"
                onChange={(e) => set({ name: e.target.value, ...(isNew ? { slug: slugify(e.target.value), singular_name: e.target.value.replace(/s$/i, '') } : {}) })} /></Field>
              <Field label="Singular name"><input className="input" value={doc.singular_name} placeholder="e.g. Case Study" onChange={(e) => set({ singular_name: e.target.value })} /></Field>
              <Field label="API slug" help={isNew ? 'Used in the URL. Cannot be changed later.' : 'Cannot be changed.'}>
                <input className="input" value={doc.slug} disabled={!isNew} onChange={(e) => set({ slug: slugify(e.target.value) })} />
              </Field>
              <Field label="Default order">
                <select className="input" value={doc.sort_by} onChange={(e) => set({ sort_by: e.target.value })}>
                  <option value="published_at">Newest first (by publish date)</option>
                  <option value="sort_order">Manual (drag &amp; drop)</option>
                  <option value="title">Alphabetical</option>
                </select>
              </Field>
              <label className="check" style={{ marginBottom: 14 }}><input type="checkbox" checked={doc.has_seo} onChange={(e) => set({ has_seo: e.target.checked })} />Items have SEO fields (they have their own page)</label>
              <Field label="Icon">
                <div className="row wrap" style={{ gap: 4 }}>
                  {ICONS.map((ic) => <button key={ic} type="button" className={`chip ${doc.icon === ic ? 'on' : ''}`} style={{ padding: '3px 7px' }} onClick={() => set({ icon: ic })}>{ic}</button>)}
                </div>
              </Field>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
