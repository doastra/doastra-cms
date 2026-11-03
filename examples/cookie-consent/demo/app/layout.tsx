import CookieConsent from '../components/CookieConsent';

export const metadata = { title: 'Cookie consent demo' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', margin: 0 }}>
        {children}
        <CookieConsent />
      </body>
    </html>
  );
}
