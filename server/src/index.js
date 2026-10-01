import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { migrate } from './db/migrate.js';
import { requireAuth, loadSite } from './lib/auth.js';
import { invalidateSite } from './lib/cache.js';
import { scheduleWebhook } from './lib/webhooks.js';
import authRoutes from './routes/auth.js';
import siteRoutes from './routes/sites.js';
import structureRoutes from './routes/structure.js';
import contentRoutes from './routes/content.js';
import siteDataRoutes from './routes/site-data.js';
import publicRoutes from './routes/public.js';

const app = express();
app.set('trust proxy', true);
app.disable('x-powered-by');

const origins = config.corsOrigins === '*' ? true : config.corsOrigins.split(',').map((s) => s.trim());
app.use(cors({ origin: origins }));
app.use(express.json({ limit: '5mb' }));

// Uploaded files (local storage driver)
app.use('/uploads', express.static(config.uploadsDir, { maxAge: '365d', immutable: true }));

app.get('/health', (_req, res) => res.json({ ok: true }));

// ---- Public API (websites) ----
app.use('/api', publicRoutes);

// ---- Admin API ----
const admin = express.Router();
admin.use('/auth', authRoutes);
admin.use(requireAuth);
admin.use(siteRoutes);

// Everything under /admin/sites/:siteId/... is scoped to one site.
const scoped = express.Router({ mergeParams: true });
scoped.use((req, res, next) => {
  // After any successful change: clear that site's public API cache + trigger the rebuild webhook.
  if (req.method !== 'GET') {
    res.on('finish', () => {
      if (res.statusCode < 300) {
        invalidateSite(req.site.id);
        scheduleWebhook(req.site);
      }
    });
  }
  next();
});
scoped.use(structureRoutes, contentRoutes, siteDataRoutes);
admin.use('/sites/:siteId', loadSite, scoped);
app.use('/admin/api', admin);

// ---- Admin panel (built React app) ----
if (fs.existsSync(config.adminDist)) {
  app.use('/admin', express.static(config.adminDist));
  app.get(['/admin', '/admin/*'], (_req, res) => res.sendFile(path.join(config.adminDist, 'index.html')));
  app.get('/', (_req, res) => res.redirect('/admin'));
}

// ---- Errors ----
app.use((req, res) => res.status(404).json({ error: `Not found: ${req.method} ${req.path}` }));
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'File is too large' });
  if (err.code === '23505') return res.status(400).json({ error: 'That already exists (duplicate value)' });
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Something went wrong on the server' : err.message, details: err.details });
});

await migrate();
app.listen(config.port, () => {
  console.log(`Doastra CMS running on ${config.publicUrl}`);
  console.log(`  Admin panel: ${config.publicUrl}/admin`);
  console.log(`  Public API:  ${config.publicUrl}/api`);
});
