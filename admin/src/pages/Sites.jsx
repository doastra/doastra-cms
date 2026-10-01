import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../context.jsx';
import { TopBar } from '../components/Layout.jsx';
import { Modal, Spinner, useConfirm, useLoad, useToast, Field } from '../components/ui.jsx';

export default function Sites() {
  const { refresh } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const { data, reload } = useLoad(() => api.get('/sites'), []);
  const [modal, setModal] = useState(null); // { mode: 'new' | 'dup', from }
  const [form, setForm] = useState({ name: '', domain: '', include_pages: true });
  if (!data) return <Spinner />;

  const submit = async () => {
    try {
      const s = modal.mode === 'new'
        ? await api.post('/sites', form)
        : await api.post(`/sites/${modal.from.id}/duplicate`, form);
      await refresh(); setModal(null);
      toast.success(`Website “${s.name}” created`);
      nav(`/s/${s.id}`);
    } catch (e) { toast.error(e); }
  };
  const del = async (s) => {
    if (!(await confirm(`Delete the website “${s.name}” with ALL its pages, content and media records? This cannot be undone.`, { okText: 'Delete website' }))) return;
    try { await api.del(`/sites/${s.id}`); await refresh(); reload(); toast.success('Website deleted'); } catch (e) { toast.error(e); }
  };

  return (
    <>
      <TopBar title="All websites" sub="One CMS, many websites – each with its own content and API key">
        <button className="btn primary" onClick={() => { setForm({ name: '', domain: '' }); setModal({ mode: 'new' }); }}>＋ New website</button>
      </TopBar>
      <div className="content">
        <div className="card">
          <table className="table">
            <thead><tr><th>Website</th><th className="hide-mobile">Domain</th><th>Pages</th><th /></tr></thead>
            <tbody>
              {data.map((s) => (
                <tr key={s.id} className="clickable" onClick={() => nav(`/s/${s.id}`)}>
                  <td><b>{s.name}</b><div className="muted small"><code>{s.slug}</code></div></td>
                  <td className="hide-mobile muted">{s.domain || '—'}</td>
                  <td>{s.page_count}</td>
                  <td onClick={(e) => e.stopPropagation()} style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="btn sm" onClick={() => { setForm({ name: `${s.name} copy`, include_pages: true }); setModal({ mode: 'dup', from: s }); }}>Duplicate as new site</button>{' '}
                    <button className="btn sm danger" onClick={() => del(s)}>Delete</button>
                  </td>
                </tr>
              ))}
              {!data.length && <tr><td className="muted">No websites yet – create the first one.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      {modal && (
        <Modal title={modal.mode === 'new' ? 'New website' : `Duplicate “${modal.from.name}”`} onClose={() => setModal(null)}
          footer={<><button className="btn" onClick={() => setModal(null)}>Cancel</button><button className="btn primary" onClick={submit}>Create website</button></>}>
          {modal.mode === 'dup' && <div className="alert info small" style={{ marginBottom: 14 }}>Copies section types, content types, categories, menus and settings{form.include_pages ? ' plus pages (as drafts)' : ''}. Content items and media are not copied.</div>}
          <Field label="Website name" required><input className="input" autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          {modal.mode === 'new' && <Field label="Domain"><input className="input" placeholder="www.client.com" value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} /></Field>}
          {modal.mode === 'dup' && <label className="check"><input type="checkbox" checked={form.include_pages} onChange={(e) => setForm({ ...form, include_pages: e.target.checked })} />Also copy pages</label>}
        </Modal>
      )}
    </>
  );
}
