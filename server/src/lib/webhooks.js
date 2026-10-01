// Fires the site's webhook (e.g. a Netlify/Vercel/GitHub Actions rebuild hook) after content changes.
// Debounced so that saving 10 things in a row triggers a single rebuild.
const timers = new Map();

export function scheduleWebhook(site, event = 'content.updated') {
  const url = site?.settings?.webhook_url;
  if (!url) return;
  clearTimeout(timers.get(site.id));
  timers.set(
    site.id,
    setTimeout(async () => {
      timers.delete(site.id);
      try {
        await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event, site: { id: site.id, slug: site.slug, name: site.name }, at: new Date().toISOString() }),
        });
        console.log(`Webhook sent for site ${site.slug}`);
      } catch (err) {
        console.warn(`Webhook failed for site ${site.slug}: ${err.message}`);
      }
    }, 5000)
  );
}
