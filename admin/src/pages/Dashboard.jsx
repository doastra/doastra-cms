import { Link } from 'react-router-dom';
import { useSite } from '../context.jsx';
import { TopBar } from '../components/Layout.jsx';
import { Spinner, StatusBadge, timeAgo, useLoad } from '../components/ui.jsx';

export default function Dashboard() {
  const { site, api, siteId, can, role } = useSite();
  const { data } = useLoad(() => api.get('/dashboard'), [siteId]);
  if (!site || !data) return <Spinner />;
  const b = `/s/${siteId}`;
  const c = data.counts;
  return (
    <>
      <TopBar title={site.name} sub={site.domain || 'Dashboard'}>
        {can.editPages && <Link className="btn primary" to={`${b}/pages/new`}>＋ New page</Link>}
      </TopBar>
      <div className="content stack">
        <div className="grid grid-4">
          <Link to={`${b}/pages`} className="card stat"><div className="muted">Pages</div><div className="n">{c.pages}</div></Link>
          <div className="card stat"><div className="muted">Content items</div><div className="n">{c.entries}</div></div>
          <Link to={`${b}/media`} className="card stat"><div className="muted">Media files</div><div className="n">{c.media}</div></Link>
          <Link to={`${b}/forms`} className="card stat"><div className="muted">Unread messages</div><div className="n" style={{ color: c.unread_forms ? 'var(--brand)' : undefined }}>{c.unread_forms}</div></Link>
        </div>

        <div className="grid grid-2">
          <div className="card">
            <div className="card-head"><h2>Quick add</h2></div>
            <div className="card-pad row wrap">
              {can.editPages && <Link className="btn" to={`${b}/pages/new`}>📄 Page</Link>}
              {data.types.map((t) => <Link key={t.id} className="btn" to={`${b}/content/${t.slug}/new`}>＋ {t.name} <span className="muted">({t.n})</span></Link>)}
              <Link className="btn" to={`${b}/media`}>🖼️ Upload media</Link>
            </div>
            {role === 'admin' && data.types.length === 0 && (
              <div className="card-pad" style={{ paddingTop: 0 }}>
                <div className="alert info">Tip: create content types (e.g. Case Studies, Posts) under <Link to={`${b}/content-types`}><b>Content types</b></Link>.</div>
              </div>
            )}
          </div>
          <div className="card">
            <div className="card-head"><h2>Recently edited</h2></div>
            <table className="table">
              <tbody>
                {data.recent.map((r) => (
                  <tr key={`${r.kind}${r.id}`}>
                    <td><Link to={r.kind === 'page' ? `${b}/pages/${r.id}` : `${b}/content/${r.type_slug}/${r.id}`}><b>{r.title}</b></Link>
                      <div className="muted small">{r.kind === 'page' ? 'Page' : r.type_slug}</div></td>
                    <td><StatusBadge status={r.status} /></td>
                    <td className="muted small">{timeAgo(r.updated_at)}</td>
                  </tr>
                ))}
                {!data.recent.length && <tr><td className="muted">Nothing yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
