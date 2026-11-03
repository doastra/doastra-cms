'use client';
import { useEffect, useState } from 'react';
import { getConsent, whenConsent } from '../components/CookieConsent';

export default function Home() {
  const [log, setLog] = useState<string[]>([]);
  useEffect(() => {
    const show = () => setLog((l) => [`consent: ${JSON.stringify(getConsent())}`, ...l].slice(0, 5));
    show();
    window.addEventListener('doastra:consent', show);
    whenConsent('analytics', () => setLog((l) => ['analytics script would load now', ...l]));
    return () => window.removeEventListener('doastra:consent', show);
  }, []);
  return (
    <main style={{ maxWidth: 720, margin: '80px auto', padding: 24 }}>
      <h1>Experience Innovation</h1>
      <p>Demo page for the Doastra cookie consent banner.</p>
      <p><a href="#" data-cookie-settings>Cookie settings</a></p>
      <pre style={{ background: '#f6f6f6', padding: 12, borderRadius: 8, whiteSpace: 'pre-wrap' }}>{log.join('\n')}</pre>
    </main>
  );
}
