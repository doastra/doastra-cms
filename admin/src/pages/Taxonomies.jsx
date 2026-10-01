import { useState } from 'react';
import { useSite } from '../context.jsx';
import { TopBar } from '../components/Layout.jsx';
import { Empty, Spinner, useConfirm, useToast } from '../components/ui.jsx';

function TermRow({ tax, term, onChanged }) {
  const { api } = useSite();
  const toast = useToast();
  const confirm = useConfirm();
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState(term.name);
  const [slug, setSlug] = useState(term.slug);
  const save = async () => {
    try { await api.put(`/taxonomies/${tax.id}/terms/${term.id}`, { name, slug }); setEdit(false); onChanged(); } catch (e) { toast.error(e); }
  };
  const del = async () => {
    if (!(await confirm(`Delete “${term.name}”? Items using it will simply lose this tag.`, { okText: 'Delete' }))) return;
    try { await api.del(`/taxonomies/${tax.id}/terms/${term.id}`); onChanged(); } catch (e) { toast.error(e); }
  };
  return (
    <tr>
      {edit ? (
        <>
          <td><input className="input sm" value={name} onChange={(e) => setName(e.target.value)} /></td>
          <td><input className="input sm" value={slug} onChange={(e) => setSlug(e.target.value)} /></td>
          <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}><button className="btn xs primary" onClick={save}>Save</button> <button className="btn xs" onClick={() => setEdit(false)}>Cancel</button></td>
        </>
      ) : (
        <>
          <td><b>{term.name}</b></td>
          <td><code>{term.slug}</code></td>
          <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}><button className="icon-btn" onClick={() => setEdit(true)}>✏️</button><button className="icon-btn" onClick={del}>🗑</button></td>
        </>
      )}
    </tr>
  );
}

export default function Taxonomies() {
  const { taxonomies, api, reload, site, can } = useSite();
  const toast = useToast();
  const confirm = useConfirm();
  const [newTax, setNewTax] = useState('');
  const [newTerm, setNewTerm] = useState({});
  if (!site) return <Spinner />;

  const addTax = async () => {
    if (!newTax.trim()) return;
    try { await api.post('/taxonomies', { name: newTax.trim() }); setNewTax(''); reload(); toast.success('Taxonomy created'); } catch (e) { toast.error(e); }
  };
  const addTerm = async (t) => {
    const name = (newTerm[t.id] || '').trim();
    if (!name) return;
    try { await api.post(`/taxonomies/${t.id}/terms`, { name }); setNewTerm({ ...newTerm, [t.id]: '' }); reload(); } catch (e) { toast.error(e); }
  };
  const delTax = async (t) => {
    if (!(await confirm(`Delete the taxonomy “${t.name}” and all its terms?`, { okText: 'Delete' }))) return;
    try { await api.del(`/taxonomies/${t.id}`); reload(); } catch (e) { toast.error(e); }
  };

  return (
    <>
      <TopBar title="Categories & Tags" sub="Group your content – e.g. Industry, Category, Service" />
      <div className="content stack">
        {can.structure && (
          <div className="card card-pad row wrap">
            <input className="input" style={{ maxWidth: 320 }} placeholder="New taxonomy name, e.g. Industry" value={newTax} onChange={(e) => setNewTax(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addTax()} />
            <button className="btn primary" onClick={addTax}>＋ Create taxonomy</button>
          </div>
        )}
        {taxonomies.length === 0 && <div className="card"><Empty icon="🏷️" title="No taxonomies yet">Create one above, then add a “Categories / Tags” field to a content type.</Empty></div>}
        <div className="grid grid-2">
          {taxonomies.map((t) => (
            <div key={t.id} className="card">
              <div className="card-head">
                <h2 className="grow">{t.name}</h2>
                <code className="muted small">?{t.slug}=term-slug</code>
                {can.structure && <button className="icon-btn" onClick={() => delTax(t)} title="Delete taxonomy">🗑</button>}
              </div>
              <table className="table">
                <tbody>
                  {t.terms.map((term) => <TermRow key={term.id} tax={t} term={term} onChanged={reload} />)}
                  {!t.terms.length && <tr><td className="muted">No terms yet.</td></tr>}
                </tbody>
              </table>
              <div className="card-pad row" style={{ borderTop: '1px solid var(--line)' }}>
                <input className="input sm grow" placeholder={`Add ${t.name.toLowerCase()}…`} value={newTerm[t.id] || ''}
                  onChange={(e) => setNewTerm({ ...newTerm, [t.id]: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && addTerm(t)} />
                <button className="btn sm" onClick={() => addTerm(t)}>Add</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
