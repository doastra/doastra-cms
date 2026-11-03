'use client';
/**
 * Doastra cookie consent: Accept all / Reject non-essential / Customize.
 * Self-contained (no dependencies, styles are injected), for Next.js App Router.
 *
 * - Choice is saved in the `doastra_consent` cookie + localStorage for 1 year.
 * - Nothing non-essential should load until consent: use whenConsent('analytics', fn)
 *   (or listen for the `doastra:consent` window event) around your tracking scripts.
 * - Add a "Cookie settings" link anywhere with <button data-cookie-settings>…</button>
 *   or call openCookieSettings().
 * - Updates Google Consent Mode v2 automatically if `gtag` exists on the page.
 */
import { useEffect, useRef, useState } from 'react';

export type ConsentCategory = 'analytics' | 'marketing';
export type Consent = { necessary: true; analytics: boolean; marketing: boolean; version: number; ts: number };

const KEY = 'doastra_consent';
const VERSION = 1; // bump to ask everyone again after changing the cookie policy
const DAYS = 365;
const PRIVACY_URL = '/privacy-policy'; // change to your real privacy/cookie policy URL

export function getConsent(): Consent | null {
  if (typeof document === 'undefined') return null;
  try {
    const raw = localStorage.getItem(KEY) ?? decodeURIComponent(document.cookie.split('; ').find((c) => c.startsWith(KEY + '='))?.split('=')[1] ?? '');
    const c = raw ? (JSON.parse(raw) as Consent) : null;
    return c && c.version === VERSION ? c : null;
  } catch { return null; }
}

/** Run `fn` now if the visitor already allowed `category`, otherwise as soon as they do. */
export function whenConsent(category: ConsentCategory, fn: () => void) {
  if (getConsent()?.[category]) return fn();
  const on = (e: Event) => { if ((e as CustomEvent<Consent>).detail?.[category]) { window.removeEventListener('doastra:consent', on); fn(); } };
  window.addEventListener('doastra:consent', on);
}

export const openCookieSettings = () => window.dispatchEvent(new Event('doastra:open-cookie-settings'));

function save(c: { analytics: boolean; marketing: boolean }): Consent {
  const consent: Consent = { necessary: true, ...c, version: VERSION, ts: Date.now() };
  const json = JSON.stringify(consent);
  try { localStorage.setItem(KEY, json); } catch {}
  document.cookie = `${KEY}=${encodeURIComponent(json)}; max-age=${DAYS * 86400}; path=/; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
  const g = (window as any).gtag;
  if (typeof g === 'function') {
    g('consent', 'update', {
      analytics_storage: c.analytics ? 'granted' : 'denied',
      ad_storage: c.marketing ? 'granted' : 'denied',
      ad_user_data: c.marketing ? 'granted' : 'denied',
      ad_personalization: c.marketing ? 'granted' : 'denied',
    });
  }
  window.dispatchEvent(new CustomEvent('doastra:consent', { detail: consent }));
  return consent;
}

const ROWS: { key: 'necessary' | ConsentCategory; title: string; text: string }[] = [
  { key: 'necessary', title: 'Strictly necessary', text: 'Keep the site secure and working (for example your cookie choice). Always on.' },
  { key: 'analytics', title: 'Analytics', text: 'Help us understand how the site is used so we can improve it. Data is aggregated.' },
  { key: 'marketing', title: 'Marketing', text: 'Used to measure campaigns and show relevant content on other sites.' },
];

export default function CookieConsent() {
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false); // banner visible
  const [custom, setCustom] = useState(false); // preferences panel
  const [prefs, setPrefs] = useState({ analytics: false, marketing: false });
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setReady(true);
    const c = getConsent();
    if (c) setPrefs({ analytics: c.analytics, marketing: c.marketing }); else setOpen(true);
    const reopen = () => { const cur = getConsent(); if (cur) setPrefs({ analytics: cur.analytics, marketing: cur.marketing }); setCustom(true); setOpen(true); };
    const click = (e: MouseEvent) => { if ((e.target as HTMLElement)?.closest?.('[data-cookie-settings]')) { e.preventDefault(); reopen(); } };
    window.addEventListener('doastra:open-cookie-settings', reopen);
    document.addEventListener('click', click);
    return () => { window.removeEventListener('doastra:open-cookie-settings', reopen); document.removeEventListener('click', click); };
  }, []);

  useEffect(() => {
    if (!open || !custom) return;
    panelRef.current?.focus();
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setCustom(false); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [open, custom]);

  if (!ready || !open) return null;
  const decide = (c: { analytics: boolean; marketing: boolean }) => { save(c); setOpen(false); setCustom(false); };

  return (
    <>
      <style>{CSS}</style>
      {custom && <div className="dck-backdrop" onClick={() => setCustom(false)} />}
      <div ref={panelRef} tabIndex={-1} role="dialog" aria-modal={custom} aria-labelledby="dck-title" className={`dck ${custom ? 'dck-modal' : 'dck-bar'}`}>
        {custom && <h2 id="dck-title">Cookie preferences</h2>}
        {!custom ? (
          <div className="dck-row">
            <p id="dck-title" className="dck-text">
              We use cookies to keep the site working and, with your consent, to improve it.{' '}
              <a href={PRIVACY_URL}>Cookie Statement</a>
            </p>
            <div className="dck-actions">
              <button className="dck-btn dck-ghost" onClick={() => setCustom(true)}>Settings</button>
              <button className="dck-btn dck-outline" onClick={() => decide({ analytics: false, marketing: false })}>Reject</button>
              <button className="dck-btn dck-primary" onClick={() => decide({ analytics: true, marketing: true })}>Accept all</button>
            </div>
          </div>
        ) : (
          <>
            <p>Choose which cookies you allow. <a href={PRIVACY_URL}>Cookie policy</a></p>
            <ul className="dck-list">
              {ROWS.map((r) => (
                <li key={r.key}>
                  <div><b>{r.title}</b><span>{r.text}</span></div>
                  <label className="dck-switch" aria-label={r.title}>
                    <input type="checkbox" disabled={r.key === 'necessary'} checked={r.key === 'necessary' ? true : prefs[r.key]}
                      onChange={(e) => r.key !== 'necessary' && setPrefs({ ...prefs, [r.key]: e.target.checked })} />
                    <i />
                  </label>
                </li>
              ))}
            </ul>
            <div className="dck-actions">
              <button className="dck-btn dck-outline" onClick={() => decide({ analytics: false, marketing: false })}>Reject non-essential</button>
              <button className="dck-btn dck-outline" onClick={() => decide(prefs)}>Save my choices</button>
              <button className="dck-btn dck-primary" onClick={() => decide({ analytics: true, marketing: true })}>Accept all</button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

const CSS = `
.dck{position:fixed;z-index:2147483000;background:radial-gradient(ellipse 70% 140% at 50% 0%,rgba(249,211,187,.95) 0%,rgba(247,222,224,.85) 45%,rgba(245,240,252,.95) 100%),#fff;backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);color:#111;font-size:14px;line-height:1.5;font-family:var(--font-body),system-ui,sans-serif;border:1px solid rgba(15,15,15,.08);box-shadow:0 10px 40px rgba(20,20,50,.14);outline:none}
.dck h2{margin:0 0 4px;font-size:18px;font-weight:600;letter-spacing:-.01em}
.dck p{margin:0 0 14px;color:#444}
.dck a{color:#111;text-decoration:underline;text-underline-offset:2px}
.dck-bar{left:50%;bottom:20px;transform:translateX(-50%);width:min(680px,calc(100vw - 32px));border-radius:999px;padding:10px 10px 10px 24px}
.dck-row{display:flex;gap:16px;align-items:center;justify-content:space-between}
.dck-text{margin:0!important;font-size:13.5px;line-height:1.45}
.dck-bar .dck-actions{flex:none;flex-wrap:nowrap;gap:8px}
.dck-modal{left:50%;top:50%;transform:translate(-50%,-50%);width:min(520px,calc(100vw - 32px));max-height:calc(100vh - 32px);overflow:auto;border-radius:28px;padding:26px}
.dck-backdrop{position:fixed;inset:0;z-index:2147482999;background:rgba(15,15,15,.35)}
.dck-actions{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end}
.dck-btn{font:inherit;font-weight:600;font-size:13.5px;border-radius:999px;padding:9px 18px;cursor:pointer;border:1px solid transparent;white-space:nowrap;transition:opacity .15s,background .15s}
.dck-primary{background:#111;color:#fff;box-shadow:0 6px 16px rgba(0,0,0,.18)}.dck-primary:hover{background:#2a2a2a}
.dck-outline{background:rgba(255,255,255,.85);color:#111;border-color:rgba(15,15,15,.18)}.dck-outline:hover{background:#f4f4f6}
.dck-ghost{background:transparent;color:#444}.dck-ghost:hover{background:rgba(255,255,255,.7)}
.dck-btn:focus-visible,.dck-switch input:focus-visible+i{outline:2px solid #8b5cf6;outline-offset:2px}
.dck-list{list-style:none;margin:0 0 18px;padding:0}
.dck-list li{display:flex;gap:16px;align-items:center;justify-content:space-between;padding:12px 0;border-top:1px solid rgba(15,15,15,.08)}
.dck-list li div{display:flex;flex-direction:column;gap:2px}.dck-list span{color:#666;font-size:13px}
.dck-switch{position:relative;flex:none;width:44px;height:26px}
.dck-switch input{position:absolute;inset:0;opacity:0;margin:0;cursor:pointer}
.dck-switch i{position:absolute;inset:0;border-radius:999px;background:#d6d6dc;transition:.15s;pointer-events:none}
.dck-switch i:after{content:"";position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.2);transition:.15s}
.dck-switch input:checked+i{background:linear-gradient(90deg,#e8604c,#c45bf0 55%,#6f8ff8)}
.dck-switch input:checked+i:after{transform:translateX(18px)}
.dck-switch input:disabled{cursor:not-allowed}.dck-switch input:disabled+i{opacity:.6}
@media(max-width:620px){.dck-bar{border-radius:24px;padding:16px}.dck-row{flex-direction:column;align-items:stretch;gap:12px}.dck-bar .dck-actions{justify-content:stretch}.dck-bar .dck-btn{flex:1 1 0;padding:10px 8px}}
`;
