import { useEffect, useState } from 'react';
import { useSite } from '../context.jsx';
import { TopBar } from '../components/Layout.jsx';
import { Spinner, useToast, Field, useUnsavedWarning } from '../components/ui.jsx';
import { DynamicFields, SEO_FIELDS } from '../components/Fields.jsx';
import { useAuth } from '../context.jsx';

const BRAND_FIELDS = [
  { key: 'site_title', label: 'Site title', type: 'text', width: 'half' },
  { key: 'tagline', label: 'Tagline', type: 'text', width: 'half' },
  { key: 'logo', label: 'Logo', type: 'image', width: 'third' },
  { key: 'logo_dark', label: 'Logo (for dark backgrounds)', type: 'image', width: 'third' },
  { key: 'favicon', label: 'Favicon', type: 'image', width: 'third' },
  { key: 'primary_color', label: 'Primary colour', type: 'color', width: 'half' },
  { key: 'secondary_color', label: 'Secondary colour', type: 'color', width: 'half' },
];
const CONTACT_FIELDS = [
  { key: 'email', label: 'Email', type: 'text', width: 'half' },
  { key: 'phone', label: 'Phone', type: 'text', width: 'half' },
  { key: 'address', label: 'Address', type: 'textarea' },
  { key: 'footer_text', label: 'Footer text', type: 'textarea' },
  { key: 'copyright', label: 'Copyright line', type: 'text' },
];

export default function Settings() {
  const { api, site, siteId, reload } = useSite();
  const { refresh } = useAuth();
  const toast = useToast();
  const [s, setS] = useState(null);
  const [meta, setMeta] = useState({ name: '', domain: '' });
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState('brand');
  useUnsavedWarning(dirty);

  useEffect(() => {
    if (!site) return;
    api.get('/settings').then(setS);
    setMeta({ name: site.name, domain: site.domain || '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId, site?.id]);
  if (!s || !site) return <Spinner />;
  const set = (patch) => { setS({ ...s, ...patch }); setDirty(true); };

  const save = async () => {
    try {
      await api.put('', meta);
      setS(await api.put('/settings', s));
      setDirty(false); reload(); refresh();
      toast.success('Settings saved');
    } catch (e) { toast.error(e); }
  };

  const social = s.social || [];
  const extra = s.extra || [];
  return (
    <>
      <TopBar title="Site settings" sub="Global information used across the whole website (available at /api/site)">
        <button className="btn primary" onClick={save}>Save settings</button>
      </TopBar>
      <div className="content narrow">
        <div className="tabs">
          {[['brand', 'Brand'], ['contact', 'Contact & footer'], ['social', 'Social links'], ['seo', 'Default SEO'], ['advanced', 'Advanced']].map(([k, l]) =>
            <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
        </div>
        <div className="card card-pad">
          {tab === 'brand' && <>
            <div className="fields-grid">
              <Field label="Website name (in the admin)" className="w-half"><input className="input" value={meta.name} onChange={(e) => { setMeta({ ...meta, name: e.target.value }); setDirty(true); }} /></Field>
              <Field label="Domain" className="w-half"><input className="input" value={meta.domain} placeholder="www.example.com" onChange={(e) => { setMeta({ ...meta, domain: e.target.value }); setDirty(true); }} /></Field>
            </div>
            <DynamicFields fields={BRAND_FIELDS} value={s} onChange={(v) => set(v)} />
          </>}
          {tab === 'contact' && <DynamicFields fields={CONTACT_FIELDS} value={s} onChange={(v) => set(v)} />}
          {tab === 'social' && (
            <div>
              {social.map((x, i) => (
                <div key={i} className="row" style={{ marginBottom: 8 }}>
                  <input className="input" style={{ maxWidth: 180 }} placeholder="Platform" value={x.platform} list="platforms" onChange={(e) => set({ social: social.map((y, yi) => (yi === i ? { ...y, platform: e.target.value } : y)) })} />
                  <input className="input grow" placeholder="https://…" value={x.url} onChange={(e) => set({ social: social.map((y, yi) => (yi === i ? { ...y, url: e.target.value } : y)) })} />
                  <button className="icon-btn" onClick={() => set({ social: social.filter((_, yi) => yi !== i) })}>🗑</button>
                </div>
              ))}
              <datalist id="platforms">{['LinkedIn', 'Instagram', 'Facebook', 'X', 'YouTube', 'Behance', 'Dribbble', 'GitHub', 'WhatsApp'].map((p) => <option key={p} value={p} />)}</datalist>
              <button className="btn sm" onClick={() => set({ social: [...social, { platform: '', url: '' }] })}>＋ Add social link</button>
            </div>
          )}
          {tab === 'seo' && <DynamicFields fields={SEO_FIELDS.filter((f) => f.key !== 'canonical_url')} value={s.default_seo || {}} onChange={(v) => set({ default_seo: v })} />}
          {tab === 'advanced' && <>
            <Field label="Google Analytics / GTM ID"><input className="input" value={s.analytics_id || ''} placeholder="G-XXXXXXX" onChange={(e) => set({ analytics_id: e.target.value })} /></Field>
            <Field label="Rebuild webhook URL" help="Called (POST) a few seconds after any content change – use your Netlify / Vercel / GitHub Actions deploy hook to rebuild a static site automatically.">
              <input className="input" value={s.webhook_url || ''} placeholder="https://api.netlify.com/build_hooks/…" onChange={(e) => set({ webhook_url: e.target.value })} />
            </Field>
            <Field label="Custom values" help="Any extra key/value the frontend needs (e.g. booking_url, whatsapp_number).">
              {extra.map((x, i) => (
                <div key={i} className="row" style={{ marginBottom: 8 }}>
                  <input className="input" style={{ maxWidth: 200 }} placeholder="key" value={x.key} onChange={(e) => set({ extra: extra.map((y, yi) => (yi === i ? { ...y, key: e.target.value } : y)) })} />
                  <input className="input grow" placeholder="value" value={x.value} onChange={(e) => set({ extra: extra.map((y, yi) => (yi === i ? { ...y, value: e.target.value } : y)) })} />
                  <button className="icon-btn" onClick={() => set({ extra: extra.filter((_, yi) => yi !== i) })}>🗑</button>
                </div>
              ))}
              <button className="btn sm" onClick={() => set({ extra: [...extra, { key: '', value: '' }] })}>＋ Add value</button>
            </Field>
          </>}
        </div>
      </div>
    </>
  );
}
