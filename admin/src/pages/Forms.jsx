import { Fragment, useState } from 'react';
import { useSite } from '../context.jsx';
import { TopBar } from '../components/Layout.jsx';
import { Empty, Spinner, useConfirm, useLoad, useToast, timeAgo } from '../components/ui.jsx';

export default function Forms() {
  const { api, siteId } = useSite();
  const toast = useToast();
  const confirm = useConfirm();
  const [form, setForm] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(null);
  const { data, reload } = useLoad(() => api.get(`/forms?page=${page}&form=${encodeURIComponent(form)}`), [siteId, form, page]);
  if (!data) return <Spinner />;

  const view = async (s) => {
    setOpen(open === s.id ? null : s.id);
    if (!s.is_read) { await api.put(`/forms/${s.id}`, { is_read: true }); reload(); }
  };
  const del = async (s) => {
    if (!(await confirm('Delete this submission?', { okText: 'Delete' }))) return;
    try { await api.del(`/forms/${s.id}`); reload(); } catch (e) { toast.error(e); }
  };
  const exportCsv = () => {
    const keys = [...new Set(data.items.flatMap((s) => Object.keys(s.data)))];
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [['form', 'date', ...keys].map(esc).join(','), ...data.items.map((s) => [s.form, s.created_at, ...keys.map((k) => s.data[k])].map(esc).join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `form-submissions-${form || 'all'}.csv`;
    a.click();
  };

  return (
    <>
      <TopBar title="Form submissions" sub="Messages sent from contact forms on the website">
        {data.items.length > 0 && <button className="btn" onClick={exportCsv}>⬇ Export CSV</button>}
      </TopBar>
      <div className="content stack">
        {data.forms.length > 0 && (
          <div className="tabs">
            <button className={!form ? 'on' : ''} onClick={() => { setForm(''); setPage(1); }}>All</button>
            {data.forms.map((f) => <button key={f.form} className={form === f.form ? 'on' : ''} onClick={() => { setForm(f.form); setPage(1); }}>{f.form} ({f.n}){f.unread ? ' •' : ''}</button>)}
          </div>
        )}
        <div className="card">
          {data.items.length === 0 ? <Empty icon="✉️" title="No messages yet">Frontends post forms to <code>POST /api/forms/&lt;form-name&gt;</code>.</Empty> : (
            <table className="table">
              <tbody>
                {data.items.map((s) => (
                  <Fragment key={s.id}>
                    <tr className="clickable" onClick={() => view(s)}>
                      <td style={{ width: 14 }}>{!s.is_read && <span className="brand-dot" style={{ display: 'inline-block' }} />}</td>
                      <td><b style={{ fontWeight: s.is_read ? 500 : 700 }}>{s.data.name || s.data.email || 'Submission'}</b>
                        <div className="muted small">{String(s.data.message || Object.values(s.data).join(' · ')).slice(0, 90)}</div></td>
                      <td><span className="badge">{s.form}</span></td>
                      <td className="muted small">{timeAgo(s.created_at)}</td>
                      <td onClick={(e) => e.stopPropagation()}><button className="icon-btn" onClick={() => del(s)}>🗑</button></td>
                    </tr>
                    {open === s.id && (
                      <tr><td /><td colSpan={4}>
                        <dl className="kv">{Object.entries(s.data).map(([k, v]) => <Fragment key={k}><dt>{k}</dt><dd style={{ whiteSpace: 'pre-wrap' }}>{typeof v === 'object' ? JSON.stringify(v) : String(v)}</dd></Fragment>)}
                          <dt>Received</dt><dd>{new Date(s.created_at).toLocaleString()}</dd></dl>
                      </td></tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          )}
          {data.pages > 1 && (
            <div className="pager">
              <button className="btn sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Prev</button>
              <span className="muted small">Page {page} of {data.pages}</span>
              <button className="btn sm" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>Next →</button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
