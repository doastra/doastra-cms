import { useState } from 'react';
import { useAuth } from '../context.jsx';

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await login(email, password);
      window.history.replaceState(null, '', '/admin/');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <form className="card card-pad login-card" onSubmit={submit}>
        <div className="row" style={{ marginBottom: 18 }}><span className="brand-dot" /><h1>Doastra CMS</h1></div>
        <p className="muted" style={{ marginTop: 0 }}>Log in to manage your websites.</p>
        {error && <div className="alert error" style={{ marginBottom: 14 }}>{error}</div>}
        <div className="field"><label>Email</label><input className="input" type="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
        <div className="field"><label>Password</label><input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
        <button className="btn primary block" disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</button>
      </form>
    </div>
  );
}
