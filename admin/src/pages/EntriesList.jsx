import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useSite } from '../context.jsx';
import { TopBar } from '../components/Layout.jsx';
import { Empty, Spinner, StatusBadge, timeAgo, useConfirm, useLoad, useToast, move } from '../components/ui.jsx';
import { rememberMedia } from '../components/Media.jsx';

function Thumb({ ct, data }) {
  const { api } = useSite();
  const f = ct.fields.find((x) => x.type === 'image');
  const id = f && data?.[f.key];
  const { data: m } = useLoad(() => (id ? api.get(`/media/by-ids?ids=${id}`).then((r) => { rememberMedia(r); return r[0]; }) : Promise.resolve(null)), [id]);
  if (!f) return null;
  return m ? <img className="thumb-sm" src={m.sizes?.thumb || m.url} alt="" /> : <div className="thumb-sm" />;
}

export default function EntriesList() {
  const { type } = useParams();
  const { api, siteId, contentTypes, reload: reloadSite } = useSite();
  const nav = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [term, setTerm] = useState('');
  const [page, setPage] = useState(1);
  const [dragIdx, setDragIdx] = useState(null);
  const { data, reload, setData } = useLoad(
    () => api.get(`/entries?type=${type}&page=${page}&limit=50&search=${encodeURIComponent(search)}&status=${status}&term=${term}`),
    [type, page, search, status, term, siteId]
  );
  const ct = contentTypes.find((c) => c.slug === type);
  if (!ct) return contentTypes.length ? <Empty icon="🤔" title="Content type not found" /> : <Spinner />;
  const hasImage = ct.fields.some((f) => f.type === 'image');
  const manual = ct.sort_by === 'sort_order' && !search && !status && !term;

  const remove = async (e) => {
    if (!(await confirm(`Delete “${e.title}”? This cannot be undone.`, { okText: 'Delete' }))) return;
    try { await api.del(`/entries/${e.id}`); toast.success('Deleted'); reload(); reloadSite(); } catch (err) { toast.error(err); }
  };
  const duplicate = async (e) => {
    try { const n = await api.post(`/entries/${e.id}/duplicate`); toast.success('Duplicated'); nav(`/s/${siteId}/content/${type}/${n.id}`); } catch (err) { toast.error(err); }
  };
  const drop = async (to) => {
    if (dragIdx == null || dragIdx === to) return;
    const items = move(data.items, dragIdx, to);
    setData({ ...data, items }); setDragIdx(null);
    try { await api.post('/entries/reorder', { ids: items.map((x) => x.id) }); } catch (err) { toast.error(err); }
  };

  return (
    <>
      <TopBar title={`${ct.icon || ''} ${ct.name}`} sub={data ? `${data.total} item${data.total === 1 ? '' : 's'}` : ''}>
        <Link className="btn primary" to={`/s/${siteId}/content/${type}/new`}>＋ Add {ct.singular_name}</Link>
      </TopBar>
      <div className="content">
        <div className="row wrap" style={{ marginBottom: 14 }}>
          <input className="input" style={{ maxWidth: 300 }} placeholder={`Search ${ct.name.toLowerCase()}…`} value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          <select className="input" style={{ maxWidth: 160 }} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All statuses</option><option value="published">Published</option><option value="draft">Drafts</option>
          </select>
          {data?.categories && (
            <select className="input" style={{ maxWidth: 200 }} value={term} onChange={(e) => { setTerm(e.target.value); setPage(1); }}>
              <option value="">All {data.categories.label.toLowerCase()}</option>
              {data.categories.terms.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}
          {manual && <span className="muted small">Drag rows to change the order on the website.</span>}
        </div>
        <div className="card">
          {!data ? <Spinner /> : data.items.length === 0 ? (
            <Empty icon={ct.icon || '📁'} title={search || status || term ? 'Nothing matches' : `No ${ct.name.toLowerCase()} yet`}>
              {!search && !status && !term && <Link className="btn primary" to={`/s/${siteId}/content/${type}/new`}>Add the first one</Link>}
            </Empty>
          ) : (
            <>
              <table className="table">
                <thead><tr>{manual && <th style={{ width: 30 }} />}{hasImage && <th style={{ width: 60 }} />}<th>Title</th>{data?.categories && <th>{data.categories.label}</th>}<th>Status</th><th className="hide-mobile">Author</th><th className="hide-mobile">Updated</th><th /></tr></thead>
                <tbody>
                  {data.items.map((e, i) => (
                    <tr key={e.id} className="clickable" onClick={() => nav(`/s/${siteId}/content/${type}/${e.id}`)}
                      draggable={manual} onDragStart={() => setDragIdx(i)} onDragOver={(ev) => ev.preventDefault()} onDrop={() => drop(i)}>
                      {manual && <td className="drag">⋮⋮</td>}
                      {hasImage && <td><Thumb ct={ct} data={e.data} /></td>}
                      <td><b>{e.title}</b><div className="muted small"><code>{e.slug}</code></div></td>
                      {data?.categories && <td>{e.categories?.length ? e.categories.join(', ') : <span className="muted">—</span>}</td>}
                      <td><StatusBadge status={e.status} /></td>
                      <td className="muted hide-mobile">{e.author_name}</td>
                      <td className="muted small hide-mobile">{timeAgo(e.updated_at)}</td>
                      <td onClick={(ev) => ev.stopPropagation()} style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                        <button className="icon-btn" title="Duplicate" onClick={() => duplicate(e)}>⧉</button>
                        <button className="icon-btn" title="Delete" onClick={() => remove(e)}>🗑</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
      </div>
    </>
  );
}
