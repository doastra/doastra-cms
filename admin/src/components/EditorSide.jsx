// Right-hand panel shared by the page editor and the entry editor: publish, slug, SEO, revisions.
import { useState } from 'react';
import { Modal, Spinner, timeAgo, useConfirm, useToast, useLoad } from './ui.jsx';
import { DynamicFields, SEO_FIELDS } from './Fields.jsx';
import { useSite } from '../context.jsx';

export function PublishBox({ doc, setDoc, onSave, saving, dirty, isNew, previewUrl, children }) {
  return (
    <div className="card">
      <div className="card-head"><h3 className="grow">Publish</h3>{dirty && <span className="badge draft">Unsaved</span>}</div>
      <div className="card-pad stack">
        <div className="field" style={{ margin: 0 }}>
          <label>Status</label>
          <div className="row">
            <label className="chip" style={{ flex: 1, justifyContent: 'center' }}>
              <input type="radio" hidden checked={doc.status === 'draft'} onChange={() => setDoc({ ...doc, status: 'draft' })} />
              <span className={doc.status === 'draft' ? '' : 'muted'}>{doc.status === 'draft' ? '● ' : ''}Draft</span>
            </label>
            <label className={`chip ${doc.status === 'published' ? 'on' : ''}`} style={{ flex: 1, justifyContent: 'center' }}>
              <input type="radio" hidden checked={doc.status === 'published'} onChange={() => setDoc({ ...doc, status: 'published' })} />
              {doc.status === 'published' ? '● ' : ''}Published
            </label>
          </div>
          <div className="help">{doc.status === 'published' ? 'Visible on the website (via the API).' : 'Only visible in the admin.'}</div>
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label>URL slug</label>
          <input className="input" value={doc.slug || ''} placeholder={isNew ? 'auto from title' : ''} onChange={(e) => setDoc({ ...doc, slug: e.target.value })} />
        </div>
        {children}
        <button className="btn primary block" onClick={onSave} disabled={saving}>{saving ? 'Saving…' : isNew ? 'Create' : 'Save changes'}</button>
        {previewUrl && <a className="btn block" href={previewUrl} target="_blank" rel="noreferrer">👁 View API data</a>}
        {doc.updated_at && <div className="muted small">Last saved {timeAgo(doc.updated_at)}</div>}
      </div>
    </div>
  );
}

export function SeoBox({ value, onChange }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="card">
      <div className="card-head" style={{ cursor: 'pointer' }} onClick={() => setOpen(!open)}>
        <h3 className="grow">SEO &amp; sharing</h3><span className="muted">{open ? '▾' : '▸'}</span>
      </div>
      {open && <div className="card-pad"><DynamicFields fields={SEO_FIELDS} value={value || {}} onChange={onChange} /></div>}
    </div>
  );
}

/** Revision history list with restore. kind = 'pages' | 'entries' */
export function RevisionsButton({ kind, id, onRestored }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn sm" onClick={() => setOpen(true)}>🕘 History</button>
      {open && <RevisionsModal kind={kind} id={id} onClose={() => setOpen(false)} onRestored={(d) => { setOpen(false); onRestored(d); }} />}
    </>
  );
}

function RevisionsModal({ kind, id, onClose, onRestored }) {
  const { api } = useSite();
  const toast = useToast();
  const confirm = useConfirm();
  const { data } = useLoad(() => api.get(`/${kind}/${id}/revisions`), [id]);
  const restore = async (r) => {
    if (!(await confirm(`Restore the version from ${new Date(r.created_at).toLocaleString()}? The current version is kept in history.`, { okText: 'Restore', danger: false }))) return;
    try { const d = await api.post(`/${kind}/${id}/revisions/${r.id}/restore`); toast.success('Version restored'); onRestored(d); } catch (e) { toast.error(e); }
  };
  return (
    <Modal title="Version history" onClose={onClose}>
      {!data ? <Spinner /> : data.length === 0 ? <div className="muted">No earlier versions yet – a version is kept every time you save.</div> : (
        <table className="table">
          <tbody>
            {data.map((r) => (
              <tr key={r.id}>
                <td><b>{new Date(r.created_at).toLocaleString()}</b><div className="muted small">{r.user_name || 'Unknown'} · {r.title} · {r.status}</div></td>
                <td style={{ textAlign: 'right' }}><button className="btn sm" onClick={() => restore(r)}>Restore</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  );
}
