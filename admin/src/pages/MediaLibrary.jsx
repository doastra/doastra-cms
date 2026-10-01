import { Fragment, useState } from 'react';
import { useSite } from '../context.jsx';
import { TopBar } from '../components/Layout.jsx';
import { Modal, Spinner, Empty, useConfirm, useLoad, useToast } from '../components/ui.jsx';
import { MediaPreview, Uploader, mediaKind, rememberMedia } from '../components/Media.jsx';

const fmtSize = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);

function MediaDetails({ m, onClose, onSaved, onDeleted }) {
  const { api, can } = useSite();
  const toast = useToast();
  const confirm = useConfirm();
  const [alt, setAlt] = useState(m.alt || '');
  const kind = mediaKind(m);
  const save = async () => {
    try { const r = await api.put(`/media/${m.id}`, { alt }); rememberMedia([r]); onSaved(r); toast.success('Saved'); } catch (e) { toast.error(e); }
  };
  const del = async () => {
    if (!(await confirm('Delete this file? Anywhere it is used it will disappear.', { okText: 'Delete' }))) return;
    try { await api.del(`/media/${m.id}`); onDeleted(m); toast.success('Deleted'); } catch (e) { toast.error(e); }
  };
  const copy = (t) => navigator.clipboard?.writeText(t).then(() => toast.success('Copied'));
  return (
    <Modal wide title={m.name} onClose={onClose}
      footer={<>{can.deleteMedia && <button className="btn danger" onClick={del}>Delete</button>}<span className="spacer" /><button className="btn" onClick={onClose}>Close</button><button className="btn primary" onClick={save}>Save</button></>}>
      <div className="grid grid-2">
        <div style={{ background: '#f1f2f4', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 240, overflow: 'hidden' }}>
          {kind === 'image' ? <img src={m.sizes?.medium || m.url} alt={m.alt} style={{ maxWidth: '100%', maxHeight: 420 }} />
            : kind === 'video' ? <video src={m.url} controls style={{ maxWidth: '100%', maxHeight: 420 }} /> : <div style={{ fontSize: 60 }}><MediaPreview m={m} /></div>}
        </div>
        <div>
          <div className="field">
            <label>Alt text (describes the image – good for SEO &amp; accessibility)</label>
            <input className="input" value={alt} onChange={(e) => setAlt(e.target.value)} />
          </div>
          <dl className="kv">
            <dt>Type</dt><dd>{m.mime}</dd>
            <dt>Size</dt><dd>{fmtSize(m.size)}</dd>
            {m.width && <><dt>Dimensions</dt><dd>{m.width} × {m.height}px</dd></>}
            <dt>ID</dt><dd>{m.id}</dd>
            <dt>URL</dt><dd><a href={m.url} target="_blank" rel="noreferrer" style={{ color: '#2563eb' }}>{m.url}</a> <button className="btn xs" onClick={() => copy(m.url)}>Copy</button></dd>
            {Object.entries(m.sizes || {}).map(([k, u]) => <Fragment key={k}><dt>{k}</dt><dd><button className="btn xs" onClick={() => copy(u)}>Copy {k} URL</button></dd></Fragment>)}
          </dl>
        </div>
      </div>
    </Modal>
  );
}

export default function MediaLibrary() {
  const { api, siteId } = useSite();
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('');
  const [page, setPage] = useState(1);
  const [sel, setSel] = useState(null);
  const { data, reload, setData } = useLoad(
    () => api.get(`/media?page=${page}&limit=60&search=${encodeURIComponent(search)}&kind=${kind}`).then((r) => { rememberMedia(r.items); return r; }),
    [siteId, page, search, kind]
  );

  return (
    <>
      <TopBar title="Media library" sub={data ? `${data.total} files` : ''} />
      <div className="content stack">
        <Uploader onUploaded={() => { setPage(1); reload(); }} />
        <div className="row wrap">
          <input className="input" style={{ maxWidth: 300 }} placeholder="Search by name or alt text…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          <select className="input" style={{ maxWidth: 160 }} value={kind} onChange={(e) => { setKind(e.target.value); setPage(1); }}>
            <option value="">All files</option><option value="image">Images</option><option value="video">Videos</option><option value="document">Documents</option>
          </select>
        </div>
        {!data ? <Spinner /> : data.items.length === 0 ? <Empty icon="🖼️" title="No files">Upload images, videos or PDFs above.</Empty> : (
          <>
            <div className="media-grid">
              {data.items.map((m) => (
                <div key={m.id} className="media-item" onClick={() => setSel(m)}>
                  <div className="preview"><MediaPreview m={m} /></div>
                  <div className="name" title={m.name}>{m.name}</div>
                </div>
              ))}
            </div>
            {data.pages > 1 && (
              <div className="pager">
                <button className="btn sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Prev</button>
                <span className="muted small">Page {page} of {data.pages}</span>
                <button className="btn sm" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>Next →</button>
              </div>
            )}
          </>
        )}
      </div>
      {sel && <MediaDetails m={sel} onClose={() => setSel(null)}
        onSaved={(m) => setData((d) => ({ ...d, items: d.items.map((x) => (x.id === m.id ? m : x)) }))}
        onDeleted={() => { setSel(null); reload(); }} />}
    </>
  );
}
