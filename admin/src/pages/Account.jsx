import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../context.jsx';
import { TopBar } from '../components/Layout.jsx';
import { useToast, Field } from '../components/ui.jsx';

export default function Account() {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(user.name);
  const [pw, setPw] = useState({ current_password: '', new_password: '' });

  const save = async () => {
    try {
      await api.put('/auth/me', { name, ...(pw.new_password ? pw : {}) });
      setPw({ current_password: '', new_password: '' });
      refresh(); toast.success('Account updated');
    } catch (e) { toast.error(e); }
  };

  return (
    <>
      <TopBar title="My account"><button className="btn primary" onClick={save}>Save</button></TopBar>
      <div className="content narrow">
        <div className="card card-pad">
          <Field label="Name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Email"><input className="input" value={user.email} disabled /></Field>
          <h3 style={{ margin: '20px 0 12px' }}>Change password</h3>
          <Field label="Current password"><input className="input" type="password" value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} /></Field>
          <Field label="New password (min 8 characters)"><input className="input" type="password" value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} /></Field>
        </div>
      </div>
    </>
  );
}
