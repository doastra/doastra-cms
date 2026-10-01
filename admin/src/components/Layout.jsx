import { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth, useSite } from '../context.jsx';

function SiteNav({ onNavigate }) {
  const ctx = useSite();
  if (!ctx) return null;
  const { siteId, contentTypes, can, role } = ctx;
  const b = `/s/${siteId}`;
  const L = ({ to, ico, children, count, end }) => (
    <NavLink to={to} end={end} onClick={onNavigate}><span className="ico">{ico}</span>{children}{count != null && <span className="count">{count}</span>}</NavLink>
  );
  return (
    <>
      <div className="nav-group nav">
        <L to={b} ico="🏠" end>Dashboard</L>
        {can.editPages && <L to={`${b}/pages`} ico="📄">Pages</L>}
      </div>
      {contentTypes.length > 0 && (
        <div className="nav-group nav">
          <div className="nav-title">Content</div>
          {contentTypes.map((ct) => (
            <L key={ct.id} to={`${b}/content/${ct.slug}`} ico={ct.icon || '📁'} count={ct.entry_count}>{ct.name}</L>
          ))}
        </div>
      )}
      <div className="nav-group nav">
        <div className="nav-title">Library</div>
        <L to={`${b}/media`} ico="🖼️">Media</L>
        {can.editPages && <L to={`${b}/taxonomies`} ico="🏷️">Categories &amp; Tags</L>}
        {can.editPages && <L to={`${b}/menus`} ico="🧭">Menus</L>}
        {can.editPages && <L to={`${b}/forms`} ico="✉️">Form submissions</L>}
      </div>
      {role === 'admin' && (
        <div className="nav-group nav">
          <div className="nav-title">Site setup</div>
          <L to={`${b}/sections`} ico="🧱">Section types</L>
          <L to={`${b}/content-types`} ico="🗂️">Content types</L>
          <L to={`${b}/settings`} ico="⚙️">Site settings</L>
          <L to={`${b}/team`} ico="👥">Site users</L>
          <L to={`${b}/api`} ico="🔌">API &amp; frontend</L>
        </div>
      )}
    </>
  );
}

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const site = useSite();
  const nav = useNavigate();
  const loc = useLocation();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [loc.pathname]);

  return (
    <div className="app">
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand"><span className="brand-dot" /> Doastra CMS</div>
        {user.sites.length > 0 && (
          <div className="site-switch">
            <select value={site?.siteId || ''} onChange={(e) => e.target.value && nav(`/s/${e.target.value}`)} aria-label="Switch website">
              {!site && <option value="">Choose a website…</option>}
              {user.sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        )}
        <SiteNav onNavigate={() => setOpen(false)} />
        {user.is_super_admin && (
          <div className="nav-group nav">
            <div className="nav-title">Super admin</div>
            <NavLink to="/sites"><span className="ico">🌐</span>All websites</NavLink>
            <NavLink to="/users"><span className="ico">🧑‍💼</span>All users</NavLink>
          </div>
        )}
        <div className="side-foot">
          <NavLink to="/account" style={{ color: '#fff', fontWeight: 600 }}>{user.name}</NavLink>
          <div className="muted small" style={{ color: '#7d828c' }}>{user.email}</div>
          <button onClick={logout} style={{ marginTop: 8 }}>Log out →</button>
        </div>
      </aside>
      <div className="main">
        <button className="btn sm menu-toggle" style={{ position: 'fixed', bottom: 16, left: 16, zIndex: 60 }} onClick={() => setOpen(!open)}>☰ Menu</button>
        {site?.error ? <div className="content"><div className="alert error">{site.error.message}</div></div> : children}
      </div>
    </div>
  );
}

/** Sticky top bar used by each screen */
export function TopBar({ title, sub, children, back }) {
  const nav = useNavigate();
  return (
    <div className="topbar">
      {back && <button className="icon-btn" onClick={() => nav(back)} title="Back">←</button>}
      <div className="grow">
        <h1 style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</h1>
        {sub && <div className="muted small">{sub}</div>}
      </div>
      <div className="row wrap" style={{ justifyContent: 'flex-end' }}>{children}</div>
    </div>
  );
}
