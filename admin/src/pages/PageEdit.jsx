// Page builder: stack sections, fill their fields, reorder, hide, duplicate.
import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useSite } from '../context.jsx';
import { TopBar } from '../components/Layout.jsx';
import { Modal, Spinner, Empty, useToast, useConfirm, useUnsavedWarning, move } from '../components/ui.jsx';
import { DynamicFields, emptyData, summarize } from '../components/Fields.jsx';
import { PublishBox, SeoBox, RevisionsButton } from '../components/EditorSide.jsx';
import { uid, slugify } from '../api.js';

function SectionPicker({ onPick, onClose }) {
  const { usableSections, siteId, can } = useSite();
  const [q, setQ] = useState('');
  const list = usableSections.filter((s) => `${s.name} ${s.description || ''}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <Modal wide title="Add a section" onClose={onClose}>
      <input className="input" placeholder="Search sections…" autoFocus value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 14 }} />
      {list.length === 0 ? (
        <Empty icon="🧱" title="No section types found">
          {can.structure && <Link to={`/s/${siteId}/sections/new`} className="btn primary" onClick={onClose}>Create a section type</Link>}
        </Empty>
      ) : (
        <div className="picker-grid">
          {list.map((s) => (
            <button key={s.id} className="picker-item" onClick={() => onPick(s)}>
              <div className="ico">{s.icon || '🧩'}</div>
              <div className="name">{s.name}</div>
              <div className="desc">{s.description || `${s.fields.length} fields`}</div>
              {!s.shared && <span className="badge brand" style={{ marginTop: 6 }}>This site only</span>}
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}

export default function PageEdit() {
  const { id } = useParams();
  const isNew = id === 'new';
  const { api, siteId, site, usableSections } = useSite();
  const nav = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const [doc, setDocState] = useState(isNew ? { title: '', slug: '', status: 'draft', sections: [], seo: {} } : null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(new Set());
  const [picker, setPicker] = useState(null); // insert index
  const [dragIdx, setDragIdx] = useState(null);
  const [overIdx, setOverIdx] = useState(null);
  useUnsavedWarning(dirty);

  useEffect(() => {
    if (isNew) return;
    api.get(`/pages/${id}`).then((p) => { setDocState(p); setDirty(false); }).catch((e) => toast.error(e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const setDoc = (d) => { setDocState(d); setDirty(true); };
  if (!doc || !site) return <Spinner />;

  const types = new Map(usableSections.map((s) => [s.key, s]));
  const sections = doc.sections;
  const setSections = (s) => setDoc({ ...doc, sections: s });
  const toggle = (sid) => setOpen((o) => { const n = new Set(o); n.has(sid) ? n.delete(sid) : n.add(sid); return n; });

  const addSection = (type) => {
    const s = { id: uid(), type: type.key, data: emptyData(type.fields) };
    const next = [...sections];
    next.splice(picker ?? sections.length, 0, s);
    setSections(next);
    setOpen(new Set([s.id]));
    setPicker(null);
    setTimeout(() => document.getElementById(`sec-${s.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  const save = async () => {
    setSaving(true);
    try {
      const body = { title: doc.title, slug: doc.slug || slugify(doc.title), status: doc.status, sections: doc.sections, seo: doc.seo };
      const saved = isNew ? await api.post('/pages', body) : await api.put(`/pages/${id}`, body);
      setDocState(saved); setDirty(false);
      toast.success(isNew ? 'Page created' : 'Saved');
      if (isNew) nav(`/s/${siteId}/pages/${saved.id}`, { replace: true });
    } catch (e) {
      toast.error(e);
    } finally {
      setSaving(false);
    }
  };

  const removeSection = async (i) => {
    const t = types.get(sections[i].type);
    if (!(await confirm(`Remove the “${t?.name || sections[i].type}” section from this page?`, { okText: 'Remove' }))) return;
    setSections(sections.filter((_, x) => x !== i));
  };

  const keyInfo = site.api_key ? `/api/pages/${doc.slug}?key=${site.api_key}` : null;

  return (
    <>
      <TopBar title={isNew ? 'New page' : doc.title || 'Untitled'} sub={!isNew && `/${doc.slug}`} back={`/s/${siteId}/pages`}>
        {!isNew && <RevisionsButton kind="pages" id={id} onRestored={(d) => { setDocState(d); setDirty(false); }} />}
        <button className="btn primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
      </TopBar>
      <div className="content">
        <div className="edit-layout">
          <div>
            <div className="card card-pad" style={{ marginBottom: 16 }}>
              <input className="input" style={{ fontSize: 20, fontWeight: 600, padding: '10px 12px' }} placeholder="Page title"
                value={doc.title} onChange={(e) => setDoc({ ...doc, title: e.target.value, ...(isNew ? { slug: slugify(e.target.value) } : {}) })} />
            </div>

            <div className="row" style={{ marginBottom: 10 }}>
              <h2 className="grow">Sections <span className="muted" style={{ fontWeight: 400 }}>({sections.length})</span></h2>
              {sections.length > 1 && <>
                <button className="btn sm ghost" onClick={() => setOpen(new Set(sections.map((s) => s.id)))}>Expand all</button>
                <button className="btn sm ghost" onClick={() => setOpen(new Set())}>Collapse all</button>
              </>}
            </div>

            {sections.length === 0 && (
              <div className="card" style={{ marginBottom: 12 }}>
                <Empty icon="🧱" title="This page has no sections yet">Add sections like Hero, Gallery or Case Study Grid and fill them in.</Empty>
              </div>
            )}

            {sections.map((s, i) => {
              const t = types.get(s.type);
              const isOpen = open.has(s.id);
              return (
                <div key={s.id} id={`sec-${s.id}`}
                  className={`block ${s.hidden ? 'hidden-section' : ''} ${dragIdx === i ? 'dragging' : ''} ${overIdx === i && dragIdx !== i ? 'drop-target' : ''}`}
                  draggable={!isOpen}
                  onDragStart={() => setDragIdx(i)}
                  onDragOver={(e) => { e.preventDefault(); setOverIdx(i); }}
                  onDrop={() => { if (dragIdx != null && dragIdx !== i) setSections(move(sections, dragIdx, i)); setDragIdx(null); setOverIdx(null); }}
                  onDragEnd={() => { setDragIdx(null); setOverIdx(null); }}>
                  <div className="block-head" onClick={() => toggle(s.id)}>
                    <span className="drag" title="Drag to reorder">⋮⋮</span>
                    <span style={{ fontSize: 18 }}>{t?.icon || '🧩'}</span>
                    <span className="title">{t?.name || s.type}<span className="sub">{t ? summarize(t.fields, s.data) : ''}</span></span>
                    {s.hidden && <span className="badge">Hidden</span>}
                    <span onClick={(e) => e.stopPropagation()} className="row" style={{ gap: 0 }}>
                      <button className="icon-btn" title="Move up" disabled={i === 0} onClick={() => setSections(move(sections, i, i - 1))}>↑</button>
                      <button className="icon-btn" title="Move down" disabled={i === sections.length - 1} onClick={() => setSections(move(sections, i, i + 1))}>↓</button>
                      <button className="icon-btn" title={s.hidden ? 'Show on website' : 'Hide from website'} onClick={() => setSections(sections.map((x, xi) => (xi === i ? { ...x, hidden: !x.hidden } : x)))}>{s.hidden ? '🙈' : '👁'}</button>
                      <button className="icon-btn" title="Duplicate" onClick={() => { const c = { ...structuredClone(s), id: uid() }; const n = [...sections]; n.splice(i + 1, 0, c); setSections(n); }}>⧉</button>
                      <button className="icon-btn" title="Remove" onClick={() => removeSection(i)}>🗑</button>
                    </span>
                    <span className="muted">{isOpen ? '▾' : '▸'}</span>
                  </div>
                  {isOpen && (
                    <div className="block-body">
                      {!t ? <div className="alert error">The section type “{s.type}” no longer exists. Remove this section.</div> : (
                        <>
                          {t.description && <div className="muted small" style={{ marginBottom: 12 }}>{t.description}</div>}
                          <DynamicFields fields={t.fields} value={s.data} onChange={(data) => setSections(sections.map((x, xi) => (xi === i ? { ...x, data } : x)))} />
                          <details className="small muted">
                            <summary style={{ cursor: 'pointer' }}>Advanced</summary>
                            <div className="field" style={{ marginTop: 8, maxWidth: 320 }}>
                              <label>Anchor ID (for links like #work)</label>
                              <input className="input sm" value={s.anchor || ''} onChange={(e) => setSections(sections.map((x, xi) => (xi === i ? { ...x, anchor: slugify(e.target.value) } : x)))} />
                            </div>
                          </details>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            <button className="add-zone" onClick={() => setPicker(sections.length)}>＋ Add section</button>
          </div>

          <div className="edit-side stack">
            <PublishBox doc={doc} setDoc={setDoc} onSave={save} saving={saving} dirty={dirty} isNew={isNew} previewUrl={!isNew && doc.status === 'published' ? keyInfo : null} />
            <SeoBox value={doc.seo} onChange={(seo) => setDoc({ ...doc, seo })} />
          </div>
        </div>
      </div>
      {picker != null && <SectionPicker onPick={addSection} onClose={() => setPicker(null)} />}
    </>
  );
}
