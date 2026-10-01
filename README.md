# Doastra CMS

A self-hosted, multi-site **headless CMS** for creative websites. Admins design the sections and content types in the
admin panel, editors fill simple forms, and every website reads its content through a REST API.

```
┌───────────── Admin panel (/admin) ─────────────┐        ┌──────── Websites ────────┐
│ Section types  → page builder blocks           │        │ r-system, ivp, teksalah… │
│ Content types  → Posts, Case Studies, Team…    │  API   │ one component per        │
│ Pages          → stack sections, fill fields   │ ─────► │ section "type"           │
│ Media, Menus, Categories, Settings, Forms      │  key   │                          │
└────────────────────────────────────────────────┘        └──────────────────────────┘
          Node.js + Express + PostgreSQL (+ S3 for media)
```

## Features

- **Multi-site.** One CMS runs many websites. Each site has its own pages, content, media, menus, settings, users and API key, and a site switcher sits at the top of the admin.
- **Section builder.** Create a new section type (e.g. "Hero with video") in the admin, add fields, and editors can use it straight away. The API returns `{ type, data }` for it.
  - A **shared library** of 13 common sections (Hero, Stats, Gallery, Case Study Grid, FAQ, CTA, Contact form…) is available to every site.
  - **Site-only sections** cover one-off designs. A shared section can be customised for one site.
- **Content types.** Collections like Posts, Case Studies, Team or Services, each with its own fields, admin menu item and API.
- **17 field types:** text, long text, rich text editor, number, yes/no, date, dropdown, colour, link/button, image, gallery (multiple images), file/video upload, video URL, **repeater** (nested lists), relation (link to other content), **auto collection** (latest N items) and categories/tags.
- **Media library.** Drag-and-drop multi-upload, automatic WebP resizing (thumb/medium/large), alt text, local disk or **AWS S3/CloudFront**.
- **Editor-friendly pages.** Drag to reorder sections, hide/show, duplicate, Draft/Published status, revision history with restore, SEO fields and an unsaved-changes warning.
- **Roles:** Super admin (all sites), Admin (site structure + users), Editor (all content), Author (own items only).
- **Extras.** Menus, global site settings, contact-form submissions with CSV export, search, sitemap, public API cache, and a **rebuild webhook** for static sites.
- **Duplicate site.** Clone a site's structure (sections, content types, categories, menus, pages) to start a new website.

## Project structure

```
server/            Express API (admin API + public API)
  src/db/          migrations, seed (shared sections + demo site)
  src/lib/         auth, field engine, storage (local/S3), cache, webhooks
  src/routes/      auth, sites/users, structure, content, site-data, public
admin/             React admin panel (Vite) – served by the server at /admin
examples/frontend/ Plain HTML/JS website that renders pages from the API
```

## Quick start (local)

Requirements: Node.js 20+ and PostgreSQL 14+ (or Docker).

```bash
# 1. Database
createdb doastra_cms            # or: docker compose up -d db

# 2. Server
cd server
cp .env.example .env            # edit DATABASE_URL, JWT_SECRET, ADMIN_EMAIL/PASSWORD
npm install
npm run seed                    # creates tables, super admin, shared sections + a demo site
npm run dev                     # http://localhost:4000

# 3. Admin panel (development, hot reload)
cd ../admin
npm install
npm run dev                     # http://localhost:5173/admin
```

For production, run `npm run build` in `admin/`. The server then serves the built admin at `http://your-server/admin`.

Log in with `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env` (defaults: `admin@doastra.com` / `ChangeMe123!`). **Change the password after the first login.**

Use `npm run seed -- --no-demo` to skip the demo website.

### With Docker

```bash
docker compose up -d --build
docker compose exec cms npm run seed
# open http://localhost:4000/admin
```

## How to add a new website (the everyday workflow)

1. **All websites → New website** (or **Duplicate as new site** to copy an existing structure).
2. **Section types:** reuse shared sections. For any new design, click **New section type**, give it a name (e.g. *Teksalah 3D Hero*) and add fields. The **API output** tab shows the exact JSON the frontend will receive.
3. **Content types:** add collections the site needs (Case Studies, Team…).
4. **Site users:** give the client's editor access (role *Editor*). They will only see this website.
5. **Pages:** editors create pages, click **Add section**, fill the forms and publish.
6. **API & frontend:** copy the API key for the frontend developer. They build **one component per section key**.

## Public API (for websites)

Send the site's key in the `x-api-key` header (or `?key=`). Only **published** content is returned.

| Endpoint | Returns |
|---|---|
| `GET /api/site` | name, settings (logo, colours, social, footer, default SEO, custom values) and all menus |
| `GET /api/pages` | list of published pages |
| `GET /api/pages/:slug` | page + SEO + `sections: [{ id, type, anchor?, data }]` with images/relations expanded |
| `GET /api/content/:type` | `{ items, total, page, pages }` – options: `page`, `limit`, `sort=latest\|oldest\|title\|order`, `search`, `exclude`, `<taxonomy>=<term-slug>` |
| `GET /api/content/:type/:slug` | single item + SEO + `prev` / `next` |
| `GET /api/taxonomies/:slug` | terms of a taxonomy |
| `GET /api/menus/:slug` | one menu |
| `GET /api/search?q=` | search pages and items |
| `GET /api/sitemap` | published pages + items for sitemap.xml |
| `POST /api/forms/:form` | store a form submission (JSON body; `_gotcha` honeypot field) |

Expanded values:

- **image / file** → `{ id, url, alt, width, height, mime, sizes: { thumb, medium, large } }`
- **gallery** → array of those
- **taxonomy** → `[{ id, name, slug }]`
- **relation** → item(s) with their data
- **collection** → `{ content_type, items: [...] }`
- **link** → `{ label, url, target }`

**Draft preview:** add `?preview=1` and an admin `Authorization: Bearer <token>` header to see drafts.

### Rendering sections on the frontend

```js
const page = await fetch(`${CMS}/api/pages/home`, { headers: { 'x-api-key': KEY } }).then(r => r.json());

const components = {
  hero: (d) => `<section class="hero"><h1>${d.heading}</h1></section>`,
  stats: (d) => `…`,
  // one entry per section type key
};

app.innerHTML = page.sections.map(s => components[s.type]?.(s.data) ?? '').join('');
```

See `examples/frontend/` for a complete working site. Open `index.html?key=YOUR_KEY` with any static server, e.g. `npx serve examples/frontend`.

**Recommended for SEO:** build creative sites with **Astro** or **Next.js** (static generation), fetch the same API at build time, and put the hosting provider's deploy-hook URL in **Site settings → Advanced → Rebuild webhook**. Every publish then triggers a rebuild automatically.

## Admin API (summary)

All admin routes live under `/admin/api` and need `Authorization: Bearer <token>` from `POST /admin/api/auth/login`.

```
GET  /auth/me                         PUT /auth/me
GET|POST /sites                       GET|PUT|DELETE /sites/:id
POST /sites/:id/duplicate             POST /sites/:id/regenerate-key
GET|POST|PUT|DELETE /sites/:id/users  GET|POST|PUT|DELETE /users            (super admin)
/sites/:id/section-types[/:id]        POST /sites/:id/section-types/:id/copy-to-site
/sites/:id/content-types[/:id]
/sites/:id/entries?type=slug[/:id]    POST /entries/:id/duplicate, /entries/reorder
/sites/:id/pages[/:id]                POST /pages/:id/duplicate, /pages/reorder
/sites/:id/(pages|entries)/:id/revisions[/:revId/restore]
/sites/:id/media  (multipart "files") GET /media/by-ids?ids=1,2
/sites/:id/taxonomies[/:id/terms]     /sites/:id/menus   /sites/:id/settings
/sites/:id/forms                      GET /sites/:id/dashboard
```

## Deploying on AWS

A simple, solid setup:

1. **EC2 / Lightsail** (Ubuntu, 2 GB+) running Docker Compose, or Node + PM2. Put **Nginx** in front with HTTPS (Let's Encrypt) at e.g. `cms.doastra.com`.
2. **Database:** use **RDS PostgreSQL** in production (automatic backups) and set `DATABASE_URL`.
3. **Media:** create an S3 bucket (+ optional CloudFront) and set:
   ```
   STORAGE_DRIVER=s3
   S3_BUCKET=doastra-cms-media
   S3_REGION=ap-south-1
   S3_PUBLIC_URL=https://dxxxx.cloudfront.net
   ```
   Give the server an IAM role (or `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`) with `s3:PutObject` and `s3:DeleteObject` on the bucket, and make objects publicly readable through CloudFront or a bucket policy.
4. Set `PUBLIC_URL=https://cms.doastra.com`, a long random `JWT_SECRET`, and `CORS_ORIGINS` set to your website domains (comma separated).

Example Nginx block:

```nginx
server {
  server_name cms.doastra.com;
  client_max_body_size 60M;
  location / { proxy_pass http://127.0.0.1:4000; proxy_set_header Host $host; proxy_set_header X-Forwarded-Proto $scheme; }
}
```

## Notes

- Field and section **keys can't be changed** after saving, because the frontend depends on them. Labels can change freely.
- The public API key is read-only (published content + form posts), so it's fine to use in browser JavaScript.
- The public API cache is in memory and is cleared on every change. If you run several server instances, move it to Redis (`server/src/lib/cache.js`).
- Upload limit: `MAX_UPLOAD_MB` (default 50).
