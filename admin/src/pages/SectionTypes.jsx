import { Link, useNavigate } from 'react-router-dom';
import { useSite } from '../context.jsx';
import { useAuth } from '../context.jsx';
import { TopBar } from '../components/Layout.jsx';
import { Empty, Spinner, useToast } from '../components/ui.jsx';

export default function SectionTypes() {
  const { sectionTypes, siteId, site, api, reload } = useSite();
  const { user } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  if (!site) return <Spinner />;
  const own = sectionTypes.filter((s) => !s.shared);
  const shared = sectionTypes.filter((s) => s.shared);

  const copyToSite = async (s) => {
    try { const n = await api.post(`/section-types/${s.id}/copy-to-site`); await reload(); toast.success(`“${s.name}” copied to this site – edit it freely`); nav(`/s/${siteId}/sections/${n.id}`); } catch (e) { toast.error(e); }
  };

  const Table = ({ list, isShared }) => (
    <table className="table">
      <thead><tr><th>Section</th><th className="hide-mobile">API key</th><th>Fields</th><th className="hide-mobile">Used on pages</th><th /></tr></thead>
      <tbody>
        {list.map((s) => {
          const editable = !isShared || user.is_super_admin;
          return (
            <tr key={s.id} className={editable ? 'clickable' : ''} onClick={() => editable && nav(`/s/${siteId}/sections/${s.id}`)}>
              <td><span style={{ fontSize: 18, marginRight: 8 }}>{s.icon || '🧩'}</span><b>{s.name}</b>
                {s.overridden && <span className="badge" style={{ marginLeft: 6 }}>overridden by site version</span>}
                {s.description && <div className="muted small">{s.description}</div>}</td>
              <td className="hide-mobile"><code>{s.key}</code></td>
              <td>{s.fields.length}</td>
              <td className="hide-mobile">{s.used_count}</td>
              <td onClick={(e) => e.stopPropagation()} style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                {isShared && !s.overridden && <button className="btn xs" onClick={() => copyToSite(s)} title="Make a site-specific copy you can customise">Customise for this site</button>}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  return (
    <>
      <TopBar title="Section types" sub="The building blocks editors stack to build pages">
        <Link className="btn primary" to={`/s/${siteId}/sections/new`}>＋ New section type</Link>
      </TopBar>
      <div className="content stack">
        <div className="alert info">
          New design for a website? Create a section type here, add its fields (heading, images, repeater…) and it immediately becomes
          available in the page builder and in the API as <code>{'{ "type": "<key>", "data": { … } }'}</code>. Your frontend developer
          then builds one component per section key.
        </div>
        <div className="card">
          <div className="card-head"><h2 className="grow">This site only</h2><span className="badge brand">{site.name}</span></div>
          {own.length ? <Table list={own} /> : <Empty icon="🧱" title="No site-specific sections">Create one for a design that only this website uses.</Empty>}
        </div>
        <div className="card">
          <div className="card-head"><h2 className="grow">Shared library</h2><span className="badge shared">All websites</span></div>
          {!user.is_super_admin && <div className="card-pad muted small" style={{ paddingBottom: 0 }}>Only super admins can edit shared sections. Use “Customise for this site” to make your own copy.</div>}
          {shared.length ? <Table list={shared} isShared /> : <Empty title="No shared sections yet" />}
        </div>
      </div>
    </>
  );
}
