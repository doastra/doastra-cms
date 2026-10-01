import { Link, useNavigate } from 'react-router-dom';
import { useSite } from '../context.jsx';
import { TopBar } from '../components/Layout.jsx';
import { Empty } from '../components/ui.jsx';

export default function ContentTypes() {
  const { contentTypes, siteId } = useSite();
  const nav = useNavigate();
  return (
    <>
      <TopBar title="Content types" sub="Collections of items like Posts, Case Studies, Team, Services">
        <Link className="btn primary" to={`/s/${siteId}/content-types/new`}>＋ New content type</Link>
      </TopBar>
      <div className="content stack">
        <div className="alert info">Each content type gets its own menu item for editors and its own API: <code>/api/content/&lt;slug&gt;</code> (list) and <code>/api/content/&lt;slug&gt;/&lt;item-slug&gt;</code> (single).</div>
        <div className="card">
          {contentTypes.length === 0 ? (
            <Empty icon="🗂️" title="No content types yet">
              <Link className="btn primary" to={`/s/${siteId}/content-types/new`}>Create one</Link>
            </Empty>
          ) : (
            <table className="table">
              <thead><tr><th>Name</th><th>API slug</th><th>Fields</th><th>Items</th></tr></thead>
              <tbody>
                {contentTypes.map((c) => (
                  <tr key={c.id} className="clickable" onClick={() => nav(`/s/${siteId}/content-types/${c.id}`)}>
                    <td><span style={{ marginRight: 8 }}>{c.icon || '📁'}</span><b>{c.name}</b></td>
                    <td><code>/api/content/{c.slug}</code></td>
                    <td>{c.fields.length}</td>
                    <td>{c.entry_count}</td>
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
