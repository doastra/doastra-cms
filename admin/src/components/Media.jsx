import { useEffect, useRef, useState } from 'react';
import { useSite } from '../context.jsx';
import { Modal, Spinner, useToast } from './ui.jsx';

// Shared cache of media objects so image fields can show previews without refetching.
const cache = new Map(); // id -> media
export const rememberMedia = (items) => items.forEach((m) => cache.set(m.id, m));

export function mediaKind(m) {
  if (!m) return 'file';
  if (m.mime?.startsWith('image/')) return 'image';
  if (m.mime?.startsWith('video/')) return 'video';
  return 'file';
}

export function MediaPreview({ m }) {
  const kind = mediaKind(m);
  if (kind === 'image') return <img src={m.sizes?.thumb || m.url} alt={m.alt} loading="lazy" />;
  if (kind === 'video') return <video src={m.url} muted preload="metadata" />;
  return <span>{m.mime === 'application/pdf' ? '📕' : '📄'}</span>;
}

/** Upload helper with drag & drop. */
export function Uploader({ onUploaded, accept, compact }) {
  const { api } = useSite();
  const toast = useToast();
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const input = useRef();

  const upload = async (files) => {
    if (!files?.length) return;
    const fd = new FormData();
    [...files].forEach((f) => fd.append('files', f));
    setBusy(true);
    try {
      const items = await api.post('/media', fd);
      rememberMedia(items);
      toast.success(`${items.length} file${items.length > 1 ? 's' : ''} uploaded`);
      onUploaded?.(items);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <div
      className={`dropzone ${over ? 'over' : ''}`}
      style={compact ? { padding: 14 } : undefined}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); upload(e.dataTransfer.files); }}
    >
      <input ref={input} type="file" multiple accept={accept} hidden onChange={(e) => upload(e.target.files)} />
      {busy ? 'Uploading…' : (
        <>
          <div style={{ fontSize: compact ? 14 : 16 }}>Drag &amp; drop files here, or{' '}
            <button type="button" className="btn sm primary" onClick={() => input.current.click()}>Choose files</button>
          </div>
          {!compact && <div className="small" style={{ marginTop: 6 }}>Images are automatically resized &amp; optimised (thumb / medium / large WebP)</div>}
        </>
      )}
    </div>
  );
}

/** Modal to pick one or many files from the media library (or upload new ones). */
export function MediaPicker({ multiple, accept, onSelect, onClose }) {
  const { api } = useSite();
  const [items, setItems] = useState(null);
  const [selected, setSelected] = useState([]);
  const [search, setSearch] = useState('');
  const kind = accept?.startsWith('image') ? 'image' : accept?.startsWith('video') ? 'video' : '';

  const load = () => api.get(`/media?limit=200&search=${encodeURIComponent(search)}${kind ? `&kind=${kind}` : ''}`)
    .then((r) => { rememberMedia(r.items); setItems(r.items); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [search]);

  const toggle = (m) => {
    if (!multiple) return setSelected([m]);
    setSelected((s) => (s.find((x) => x.id === m.id) ? s.filter((x) => x.id !== m.id) : [...s, m]));
  };

  return (
    <Modal wide title={multiple ? 'Choose files' : 'Choose a file'} onClose={onClose}
      footer={<>
        <span className="muted grow">{selected.length ? `${selected.length} selected` : multiple ? 'Click to select several' : 'Click a file to select it'}</span>
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={!selected.length} onClick={() => onSelect(selected)}>Use selected</button>
      </>}>
      <div className="stack">
        <Uploader compact accept={accept} onUploaded={(up) => { setItems((i) => [...up, ...(i || [])]); setSelected((s) => (multiple ? [...s, ...up] : [up[0]])); }} />
        <input className="input" placeholder="Search files…" value={search} onChange={(e) => setSearch(e.target.value)} />
        {!items ? <Spinner /> : items.length === 0 ? <div className="empty">No files yet – upload some above.</div> : (
          <div className="media-grid">
            {items.map((m) => {
              const on = selected.some((x) => x.id === m.id);
              return (
                <div key={m.id} className={`media-item ${on ? 'selected' : ''}`} onClick={() => toggle(m)} onDoubleClick={() => onSelect([m])}>
                  <div className="preview"><MediaPreview m={m} /></div>
                  <div className="name" title={m.name}>{m.name}</div>
                  {on && <div className="tick">✓</div>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}

/** Loads media objects for ids (using the cache). */
function useMediaObjects(ids) {
  const { api } = useSite();
  const key = ids.join(',');
  const [, force] = useState(0);
  useEffect(() => {
    const missing = ids.filter((id) => !cache.has(id));
    if (!missing.length) return;
    api.get(`/media/by-ids?ids=${missing.join(',')}`).then((r) => { rememberMedia(r); force((x) => x + 1); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return ids.map((id) => cache.get(id) || { id, loading: true });
}

/** Field input for image / file (single) and gallery (multiple). Value is an id or an array of ids. */
export function MediaField({ value, onChange, multiple, accept }) {
  const ids = multiple ? (value || []) : value ? [value] : [];
  const items = useMediaObjects(ids);
  const [open, setOpen] = useState(false);
  const [dragIdx, setDragIdx] = useState(null);

  const set = (list) => onChange(multiple ? list : list[0] ?? null);
  const remove = (i) => set(ids.filter((_, x) => x !== i));
  const moveTo = (from, to) => {
    const next = [...ids];
    const [it] = next.splice(from, 1);
    next.splice(to, 0, it);
    set(next);
  };

  return (
    <>
      <div className="media-field">
        {items.map((m, i) => (
          <div key={`${m.id}-${i}`} className="media-thumb"
            draggable={multiple}
            onDragStart={() => setDragIdx(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => { if (dragIdx != null && dragIdx !== i) moveTo(dragIdx, i); setDragIdx(null); }}>
            <div className="preview">{m.loading ? '…' : <MediaPreview m={m} />}</div>
            <div className="nm" title={m.name}>{m.name || '…'}</div>
            <div className="actions">
              {multiple && i > 0 && <button type="button" title="Move left" onClick={() => moveTo(i, i - 1)}>←</button>}
              <button type="button" title="Remove" onClick={() => remove(i)}>✕</button>
            </div>
          </div>
        ))}
        {(multiple || ids.length === 0) && (
          <button type="button" className="media-add" onClick={() => setOpen(true)}>
            ＋<br />{multiple ? 'Add images' : accept?.startsWith('video') ? 'Choose video' : accept?.startsWith('image') || !accept ? 'Choose file' : 'Choose file'}
          </button>
        )}
        {!multiple && ids.length > 0 && <button type="button" className="btn sm" onClick={() => setOpen(true)}>Replace</button>}
      </div>
      {open && (
        <MediaPicker multiple={multiple} accept={accept}
          onClose={() => setOpen(false)}
          onSelect={(sel) => { set(multiple ? [...ids, ...sel.map((m) => m.id).filter((id) => !ids.includes(id))] : [sel[0].id]); setOpen(false); }} />
      )}
    </>
  );
}
