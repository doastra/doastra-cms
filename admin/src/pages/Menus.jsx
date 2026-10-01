import { useEffect, useState } from 'react';
import { useSite } from '../context.jsx';
import { TopBar } from '../components/Layout.jsx';
import { Spinner, useConfirm, useLoad, useToast, move } from '../components/ui.jsx';

function Items({ items, onChange, depth = 0, pages }) {
  const set = (i, patch) => onChange(items.map((x, xi) => (xi === i ? { ...x, ...patch } : x)));
  return (
    <div style={depth ? { marginLeft: 28, marginTop: 8 } : undefined}>
      {items.map((it, i) => (
        <div key={i} className="block" style={{ marginBottom: 8 }}>
          <div className="row wrap" style={{ padding: 10 }}>
            <input className="input sm" style={{ flex: '1 1 140px' }} placeholder="Label" value={it.label} onChange={(e) => set(i, { label: e.target.value })} />
            <input className="input sm" style={{ flex: '2 1 200px' }} placeholder="/page or https://…" value={it.url} list="menu-pages" onChange={(e) => set(i, { url: e.target.value })} />
            <label className="check small"><input type="checkbox" checked={it.target === '_blank'} onChange={(e) => set(i, { target: e.target.checked ? '_blank' : '_self' })} />New tab</label>
            <span className="row" style={{ gap: 0 }}>
              <button className="icon-btn" disabled={i === 0} onClick={() => onChange(move(items, i, i - 1))}>↑</button>
              <button className="icon-btn" disabled={i === items.length - 1} onClick={() => onChange(move(items, i, i + 1))}>↓</button>
              {depth < 1 && <button className="icon-btn" title="Add sub-item" onClick={() => set(i, { children: [...(it.children || []), { label: '', url: '', target: '_self' }] })}>↳＋</button>}
              <button className="icon-btn" onClick={() => onChange(items.filter((_, x) => x !== i))}>🗑</button>
            </span>
          </div>
          {it.children?.length > 0 && <div style={{ paddingBottom: 8, paddingRight: 10 }}><Items items={it.children} depth={depth + 1} pages={pages} onChange={(children) => set(i, { children })} /></div>}
        </div>
      ))}
    </div>
  );
}

export default function Menus() {
  const { api, siteId, can } = useSite();
  const toast = useToast();
  const confirm = useConfirm();
  const { data: menus, reload } = useLoad(() => api.get('/menus'), [siteId]);
  const { data: pages } = useLoad(() => api.get('/pages'), [siteId]);
  const [active, setActive] = useState(null);
  const [items, setItems] = useState([]);
  const [newName, setNewName] = useState('');

  useEffect(() => {
    if (menus?.length && !menus.find((m) => m.id === active)) setActive(menus[0].id);
  }, [menus, active]);
  const menu = menus?.find((m) => m.id === active);
  useEffect(() => { if (menu) setItems(menu.items || []); }, [menu]);
  if (!menus) return <Spinner />;

  const save = async () => {
    try { await api.put(`/menus/${menu.id}`, { items }); toast.success('Menu saved'); reload(); } catch (e) { toast.error(e); }
  };
  const create = async () => {
    if (!newName.trim()) return;
    try { const m = await api.post('/menus', { name: newName }); setNewName(''); await reload(); setActive(m.id); } catch (e) { toast.error(e); }
  };
  const del = async () => {
    if (!(await confirm(`Delete the menu “${menu.name}”?`, { okText: 'Delete' }))) return;
    try { await api.del(`/menus/${menu.id}`); setActive(null); reload(); } catch (e) { toast.error(e); }
  };

  return (
    <>
      <TopBar title="Menus" sub="Navigation for header, footer, etc.">
        {menu && <button className="btn primary" onClick={save}>Save menu</button>}
      </TopBar>
      <div className="content stack">
        <datalist id="menu-pages">{(pages || []).map((p) => <option key={p.id} value={p.slug === 'home' ? '/' : `/${p.slug}`}>{p.title}</option>)}</datalist>
        <div className="row wrap">
          <div className="tabs" style={{ margin: 0, flex: 1 }}>
            {menus.map((m) => <button key={m.id} className={m.id === active ? 'on' : ''} onClick={() => setActive(m.id)}>{m.name}</button>)}
          </div>
          {can.structure && <>
            <input className="input sm" style={{ maxWidth: 180 }} placeholder="New menu name" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <button className="btn sm" onClick={create}>＋ Menu</button>
          </>}
        </div>
        {menu && (
          <div className="card card-pad">
            <div className="row" style={{ marginBottom: 12 }}>
              <div className="grow muted small">API: <code>/api/menus/{menu.slug}</code> (also included in <code>/api/site</code>)</div>
              {can.structure && <button className="btn sm danger" onClick={del}>Delete menu</button>}
            </div>
            <Items items={items} onChange={setItems} pages={pages} />
            <button className="btn sm" onClick={() => setItems([...items, { label: '', url: '', target: '_self', children: [] }])}>＋ Add menu item</button>
          </div>
        )}
      </div>
    </>
  );
}
