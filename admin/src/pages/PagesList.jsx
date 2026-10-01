import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useSite } from '../context.jsx';
import { TopBar } from '../components/Layout.jsx';
import { Empty, Spinner, StatusBadge, timeAgo, useConfirm, useLoad, useToast, move } from '../components/ui.jsx';

export default function PagesList() {
  const { api, siteId } = useSite();
  const nav = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const { data, reload, setData } = useLoad(() => api.get('/pages'), [siteId]);
  const [dragIdx, setDragIdx] = useState(null);
  if (!data) return <Spinner />;

  const remove = async (p) => {
    if (!(await confirm(`Delete the page “${p.title}”? This cannot be undone.`, { okText: 'Delete' }))) return;
    try { await api.del(`/pages/${p.id}`); toast.success('Page deleted'); reload(); } catch (e) { toast.error(e); }
  };
  const duplicate = async (p) => {
    try { const n = await api.post(`/pages/${p.id}/duplicate`); toast.success('Page duplicated'); nav(`/s/${siteId}/pages/${n.id}`); } catch (e) { toast.error(e); }
  };
  const drop = async (to) => {
    if (dragIdx == null || dragIdx === to) return;
    const next = move(data, dragIdx, to);
    setData(next); setDragIdx(null);
    try { await api.post('/pages/reorder', { ids: next.map((p) => p.id) }); } catch (e) { toast.error(e); }
  };

  return (
    <>
      <TopBar title="Pages" sub="Each page is built from sections you stack and fill in">
        <Link className="btn primary" to={`/s/${siteId}/pages/new`}>＋ New page</Link>
      </TopBar>
      <div className="content">
        <div className="card">
          {data.length === 0 ? <Empty icon="📄" title="No pages yet"><Link className="btn primary" to={`/s/${siteId}/pages/new`}>Create your first page</Link></Empty> : (
            <table className="table">
              <thead><tr><th style={{ width: 30 }} /><th>Title</th><th className="hide-mobile">URL slug</th><th>Status</th><th className="hide-mobile">Sections</th><th className="hide-mobile">Updated</th><th /></tr></thead>
              <tbody>
                {data.map((p, i) => (
                  <tr key={p.id} className="clickable" draggable onDragStart={() => setDragIdx(i)} onDragOver={(e) => e.preventDefault()} onDrop={() => drop(i)}
                    onClick={() => nav(`/s/${siteId}/pages/${p.id}`)}>
                    <td className="drag" title="Drag to reorder">⋮⋮</td>
                    <td><b>{p.title}</b></td>
                    <td className="hide-mobile"><code>/{p.slug}</code></td>
                    <td><StatusBadge status={p.status} /></td>
                    <td className="hide-mobile">{p.section_count}</td>
                    <td className="muted small hide-mobile">{timeAgo(p.updated_at)}</td>
                    <td onClick={(e) => e.stopPropagation()} style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                      <button className="icon-btn" title="Duplicate" onClick={() => duplicate(p)}>⧉</button>
                      <button className="icon-btn" title="Delete" onClick={() => remove(p)}>🗑</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
