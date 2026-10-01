import { useState } from 'react';
import { useSite } from '../context.jsx';
import { TopBar } from '../components/Layout.jsx';
import { Spinner, useConfirm, useToast } from '../components/ui.jsx';

function Try({ path, apiKey }) {
  const [out, setOut] = useState(null);
  const run = async () => {
    setOut('Loading…');
    const r = await fetch(path, { headers: { 'x-api-key': apiKey } });
    setOut(JSON.stringify(await r.json(), null, 2));
  };
  return (
    <div style={{ marginBottom: 14 }}>
      <div className="row"><code className="grow">GET {path}</code><button className="btn xs" onClick={run}>Try it</button>{out && <button className="btn xs" onClick={() => setOut(null)}>Hide</button>}</div>
      {out && <pre style={{ maxHeight: 360, marginTop: 6 }}>{out}</pre>}
    </div>
  );
}

export default function ApiDocs() {
  const { site, api, reload, contentTypes, taxonomies } = useSite();
  const toast = useToast();
  const confirm = useConfirm();
  if (!site) return <Spinner />;
  const base = `${window.location.origin}/api`;
  const key = site.api_key;

  const regen = async () => {
    if (!(await confirm('Generate a new API key? The website will stop loading content until you update the key in the frontend.', { okText: 'Generate new key' }))) return;
    try { await api.post('/regenerate-key'); await reload(); toast.success('New API key generated'); } catch (e) { toast.error(e); }
  };
  const ct = contentTypes[0];
  const tax = taxonomies[0];

  const jsSnippet = `// cms.js – tiny client for your frontend
const CMS_URL = '${base}';
const CMS_KEY = '${key}';

export async function cms(path) {
  const res = await fetch(CMS_URL + path, { headers: { 'x-api-key': CMS_KEY } });
  if (!res.ok) throw new Error('CMS error ' + res.status);
  return res.json();
}

// Render a page from its sections – one component per section type key
const components = {
  hero: (d) => \`<section class="hero"><h1>\${d.heading}</h1><p>\${d.subheading}</p></section>\`,
  stats: (d) => \`<section class="stats">\${d.items.map(i => \`<div><b>\${i.number}\${i.suffix}</b>\${i.label}</div>\`).join('')}</section>\`,
  // ...add one per section type
};

const page = await cms('/pages/home');
document.querySelector('#app').innerHTML = page.sections
  .map(s => components[s.type]?.(s.data) ?? '')
  .join('');`;

  return (
    <>
      <TopBar title="API & frontend" sub="Everything the frontend developer needs" />
      <div className="content narrow stack">
        <div className="card card-pad">
          <h2 style={{ marginBottom: 10 }}>API key for {site.name}</h2>
          <div className="input-group">
            <input className="input" readOnly value={key} onFocus={(e) => e.target.select()} />
            <button className="btn" onClick={() => navigator.clipboard?.writeText(key).then(() => toast.success('Copied'))}>Copy</button>
          </div>
          <div className="help">Send it as the <code>x-api-key</code> header (or <code>?key=</code>). It is read-only: it can only read published content and post forms.</div>
          <button className="btn sm danger" style={{ marginTop: 10 }} onClick={regen}>Regenerate key</button>
        </div>

        <div className="card card-pad">
          <h2 style={{ marginBottom: 12 }}>Endpoints</h2>
          <div className="small muted" style={{ marginBottom: 12 }}>Base URL: <code>{base}</code></div>
          <Try path="/api/site" apiKey={key} />
          <Try path="/api/pages" apiKey={key} />
          <Try path="/api/pages/home" apiKey={key} />
          {contentTypes.map((c) => <Try key={c.id} path={`/api/content/${c.slug}?limit=3`} apiKey={key} />)}
          {ct && tax && <Try path={`/api/content/${ct.slug}?${tax.slug}=${tax.terms[0]?.slug || 'term'}`} apiKey={key} />}
          {taxonomies.map((t) => <Try key={t.id} path={`/api/taxonomies/${t.slug}`} apiKey={key} />)}
          <Try path="/api/menus/main" apiKey={key} />
          <Try path="/api/search?q=design" apiKey={key} />
          <Try path="/api/sitemap" apiKey={key} />
          <div className="small" style={{ marginTop: 8 }}>
            <b>List options:</b> <code>?page=1&amp;limit=12&amp;sort=latest|oldest|title|order&amp;search=text&amp;exclude=slug&amp;&lt;taxonomy&gt;=&lt;term&gt;</code><br />
            <b>Forms:</b> <code>POST /api/forms/contact</code> with JSON <code>{'{ "name": "…", "email": "…", "message": "…" }'}</code> – shows up under Form submissions.
          </div>
        </div>

        <div className="card card-pad">
          <h2 style={{ marginBottom: 10 }}>Starter code</h2>
          <pre>{jsSnippet}</pre>
        </div>
      </div>
    </>
  );
}
