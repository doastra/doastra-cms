import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../context.jsx';
import { TopBar } from '../components/Layout.jsx';
import { Modal, Spinner, useConfirm, useLoad, useToast, Field, timeAgo } from '../components/ui.jsx';

export default function Users() {
  const { user: me } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const { data, reload } = useLoad(() => api.get('/users'), []);
  const [edit, setEdit] = useState(null);
  if (!data) return <Spinner />;

  const save = async () => {
    try {
      if (edit.id) await api.put(`/users/${edit.id}`, edit);
      else await api.post('/users', edit);
      setEdit(null); reload(); toast.success('User saved');
    } catch (e) { toast.error(e); }
  };
  const del = async (u) => {
    if (!(await confirm(`Delete ${u.name}'s account?`, { okText: 'Delete' }))) return;
    try { await api.del(`/users/${u.id}`); reload(); } catch (e) { toast.error(e); }
  };

  return (
    <>
      <TopBar title="All users" sub="Give access to individual websites from each website's “Site users” screen">
        <button className="btn primary" onClick={() => setEdit({ name: '', email: '', password: '', is_super_admin: false, is_active: true })}>＋ New user</button>
      </TopBar>
      <div className="content">
        <div className="card">
          <table className="table">
            <thead><tr><th>Name</th><th>Websites</th><th className="hide-mobile">Last login</th><th /></tr></thead>
            <tbody>
              {data.map((u) => (
                <tr key={u.id} className="clickable" onClick={() => setEdit({ ...u, password: '' })}>
                  <td><b>{u.name}</b> {u.is_super_admin && <span className="badge brand">Super admin</span>} {!u.is_active && <span className="badge">Disabled</span>}
                    <div className="muted small">{u.email}</div></td>
                  <td className="small">{u.is_super_admin ? 'All websites' : u.sites.map((s) => `${s.site} (${s.role})`).join(', ') || '—'}</td>
                  <td className="muted small hide-mobile">{u.last_login_at ? timeAgo(u.last_login_at) : 'Never'}</td>
                  <td onClick={(e) => e.stopPropagation()} style={{ textAlign: 'right' }}>{u.id !== me.id && <button className="icon-btn" onClick={() => del(u)}>🗑</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {edit && (
        <Modal title={edit.id ? `Edit ${edit.name}` : 'New user'} onClose={() => setEdit(null)}
          footer={<><button className="btn" onClick={() => setEdit(null)}>Cancel</button><button className="btn primary" onClick={save}>Save</button></>}>
          <Field label="Name" required><input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
          <Field label="Email" required><input className="input" type="email" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></Field>
          <Field label={edit.id ? 'New password (leave empty to keep)' : 'Password'} required={!edit.id}><input className="input" type="text" value={edit.password} onChange={(e) => setEdit({ ...edit, password: e.target.value })} /></Field>
          <label className="check" style={{ display: 'flex', marginBottom: 10 }}><input type="checkbox" checked={edit.is_super_admin} disabled={edit.id === me.id} onChange={(e) => setEdit({ ...edit, is_super_admin: e.target.checked })} />Super admin (full access to every website)</label>
          {edit.id && <label className="check" style={{ display: 'flex' }}><input type="checkbox" checked={edit.is_active} disabled={edit.id === me.id} onChange={(e) => setEdit({ ...edit, is_active: e.target.checked })} />Account active</label>}
        </Modal>
      )}
    </>
  );
}
