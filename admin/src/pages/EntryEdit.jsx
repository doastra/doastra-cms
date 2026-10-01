import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useSite } from '../context.jsx';
import { TopBar } from '../components/Layout.jsx';
import { Spinner, Empty, useToast, useUnsavedWarning } from '../components/ui.jsx';
import { DynamicFields, emptyData } from '../components/Fields.jsx';
import { PublishBox, SeoBox, RevisionsButton } from '../components/EditorSide.jsx';
import { slugify } from '../api.js';

export default function EntryEdit() {
  const { type, id } = useParams();
  const isNew = id === 'new';
  const { api, siteId, site, contentTypes, reload: reloadSite } = useSite();
  const ct = contentTypes.find((c) => c.slug === type);
  const nav = useNavigate();
  const toast = useToast();
  const [doc, setDocState] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  useUnsavedWarning(dirty);

  useEffect(() => {
    if (!ct) return;
    if (isNew) { setDocState({ title: '', slug: '', status: 'draft', data: emptyData(ct.fields), seo: {} }); return; }
    api.get(`/entries/${id}`).then((e) => { setDocState(e); setDirty(false); }).catch((e) => toast.error(e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, ct?.id]);

  if (!ct) return contentTypes.length ? <Empty icon="🤔" title="Content type not found" /> : <Spinner />;
  if (!doc || !site) return <Spinner />;
  const setDoc = (d) => { setDocState(d); setDirty(true); };

  const save = async () => {
    setSaving(true);
    try {
      const body = { type, title: doc.title, slug: doc.slug || slugify(doc.title), status: doc.status, data: doc.data, seo: doc.seo, published_at: doc.published_at };
      const saved = isNew ? await api.post('/entries', body) : await api.put(`/entries/${id}`, body);
      setDocState(saved); setDirty(false);
      toast.success(isNew ? `${ct.singular_name} created` : 'Saved');
      if (isNew) { reloadSite(); nav(`/s/${siteId}/content/${type}/${saved.id}`, { replace: true }); }
    } catch (e) {
      toast.error(e);
    } finally {
      setSaving(false);
    }
  };

  const apiUrl = site.api_key && !isNew && doc.status === 'published' ? `/api/content/${type}/${doc.slug}?key=${site.api_key}` : null;

  return (
    <>
      <TopBar title={isNew ? `New ${ct.singular_name}` : doc.title || 'Untitled'} sub={ct.name} back={`/s/${siteId}/content/${type}`}>
        {!isNew && <RevisionsButton kind="entries" id={id} onRestored={(d) => { setDocState(d); setDirty(false); }} />}
        <button className="btn primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
      </TopBar>
      <div className="content">
        <div className="edit-layout">
          <div className="stack">
            <div className="card card-pad">
              <input className="input" style={{ fontSize: 20, fontWeight: 600, padding: '10px 12px' }} placeholder={`${ct.singular_name} title`}
                value={doc.title} onChange={(e) => setDoc({ ...doc, title: e.target.value, ...(isNew ? { slug: slugify(e.target.value) } : {}) })} />
            </div>
            <div className="card card-pad">
              {ct.fields.length === 0
                ? <div className="muted">This content type has no fields yet. An admin can add them under Content types.</div>
                : <DynamicFields fields={ct.fields} value={doc.data} onChange={(data) => setDoc({ ...doc, data })} />}
            </div>
          </div>
          <div className="edit-side stack">
            <PublishBox doc={doc} setDoc={setDoc} onSave={save} saving={saving} dirty={dirty} isNew={isNew} previewUrl={apiUrl}>
              <div className="field" style={{ margin: 0 }}>
                <label>Publish date</label>
                <input className="input" type="datetime-local"
                  value={doc.published_at ? new Date(new Date(doc.published_at).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ''}
                  onChange={(e) => setDoc({ ...doc, published_at: e.target.value ? new Date(e.target.value).toISOString() : null })} />
                <div className="help">Leave empty to use the moment you publish.</div>
              </div>
            </PublishBox>
            {ct.has_seo && <SeoBox value={doc.seo} onChange={(seo) => setDoc({ ...doc, seo })} />}
          </div>
        </div>
      </div>
    </>
  );
}
