import { useState } from 'react';
import { useSite, useAuth } from '../context.jsx';
import { TopBar } from '../components/Layout.jsx';
import { Modal, Spinner, useConfirm, useLoad, useToast, Field } from '../components/ui.jsx';

export const ROLES = {
  admin: 'Admin – everything incl. section/content types, settings and users',
  editor: 'Editor – all pages, content, media and menus',
  author: 'Author – only their own content items',
};

export default function SiteUsers() {
  const { api, siteId, site } = useSite();
  const { user: me } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const { data, reload } = useLoad(() => api.get('/users'), [siteId]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ email: '', name: '', password: '', role: 'editor' });
  if (!data || !site) return <Spinner />;

  const add = async () => {
    try { await api.post('/users', form); setAdding(false); setForm({ email: '', name: '', password: '', role: 'editor' }); reload(); toast.success('User added'); } catch (e) { toast.error(e); }
  };
  const changeRole = async (u, role) => { try { await api.put(`/users/${u.id}`, { role }); reload(); } catch (e) { toast.error(e); } };
  const remove = async (u) => {
    if (!(await confirm(`Remove ${u.name}'s access to ${site.name}? Their account stays.`, { okText: 'Remove access' }))) return;
    try { await api.del(`/users/${u.id}`); reload(); } catch (e) { toast.error(e); }
  };

  return (
    <>
      <TopBar title="Site users" sub={`Who can edit ${site.name}`}><button className="btn primary" onClick={() => setAdding(true)}>＋ Add user</button></TopBar>
      <div className="content stack">
        <div className="card">
          <table className="table">
            <thead><tr><th>Name</th><th>Role</th><th /></tr></thead>
            <tbody>
              {data.map((u) => (
                <tr key={u.id}>
                  <td><b>{u.name}</b><div className="muted small">{u.email}</div></td>
                  <td><select className="input sm" style={{ maxWidth: 160 }} value={u.role} disabled={u.id === me.id} onChange={(e) => changeRole(u, e.target.value)}>
                    {Object.keys(ROLES).map((r) => <option key={r} value={r}>{r}</option>)}</select></td>
                  <td style={{ textAlign: 'right' }}>{u.id !== me.id && <button className="btn sm danger" onClick={() => remove(u)}>Remove</button>}</td>
                </tr>
              ))}
              {!data.length && <tr><td className="muted">Only super admins have access right now.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="card card-pad small">
          {Object.entries(ROLES).map(([r, d]) => <div key={r}><b>{r}</b> – {d.split('– ')[1]}</div>)}
        </div>
      </div>
      {adding && (
        <Modal title={`Add a user to ${site.name}`} onClose={() => setAdding(false)}
          footer={<><button className="btn" onClick={() => setAdding(false)}>Cancel</button><button className="btn primary" onClick={add}>Add user</button></>}>
          <Field label="Email" required><input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <div className="alert info small" style={{ marginBottom: 14 }}>If this person already has an account they just get access. Otherwise fill name &amp; password to create it.</div>
          <Field label="Name"><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Password (new users, min 8 characters)"><input className="input" type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
          <Field label="Role">
            <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {Object.entries(ROLES).map(([r, d]) => <option key={r} value={r}>{d}</option>)}
            </select>
          </Field>
        </Modal>
      )}
    </>
  );
}
