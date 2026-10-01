-- Doastra CMS – initial schema
-- Every content table is scoped to a site (multi-site / multi-tenant).

CREATE TABLE IF NOT EXISTS sites (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,
  domain        TEXT,
  api_key       TEXT NOT NULL UNIQUE,
  settings      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id              SERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  email           TEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  is_super_admin  BOOLEAN NOT NULL DEFAULT false,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at   TIMESTAMPTZ
);

-- Per-site roles: admin (structure + content + users), editor (all content), author (own entries)
CREATE TABLE IF NOT EXISTS site_users (
  site_id   INT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  user_id   INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role      TEXT NOT NULL CHECK (role IN ('admin','editor','author')),
  PRIMARY KEY (site_id, user_id)
);

-- Section (block) types. site_id NULL = shared library available to all sites.
CREATE TABLE IF NOT EXISTS section_types (
  id           SERIAL PRIMARY KEY,
  site_id      INT REFERENCES sites(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  key          TEXT NOT NULL,
  description  TEXT,
  icon         TEXT,
  fields       JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS section_types_site_key ON section_types (COALESCE(site_id, 0), key);

-- Content types (collections): Posts, Case Studies, Team, Services...
CREATE TABLE IF NOT EXISTS content_types (
  id             SERIAL PRIMARY KEY,
  site_id        INT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,            -- plural label, e.g. "Case Studies"
  singular_name  TEXT NOT NULL,            -- e.g. "Case Study"
  slug           TEXT NOT NULL,            -- used in API: /api/content/case-studies
  icon           TEXT,
  fields         JSONB NOT NULL DEFAULT '[]'::jsonb,
  has_seo        BOOLEAN NOT NULL DEFAULT true,
  sort_by        TEXT NOT NULL DEFAULT 'published_at',  -- published_at | sort_order | title
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (site_id, slug)
);

CREATE TABLE IF NOT EXISTS entries (
  id               SERIAL PRIMARY KEY,
  site_id          INT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  content_type_id  INT NOT NULL REFERENCES content_types(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  slug             TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  data             JSONB NOT NULL DEFAULT '{}'::jsonb,
  seo              JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort_order       INT NOT NULL DEFAULT 0,
  published_at     TIMESTAMPTZ,
  author_id        INT REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (content_type_id, slug)
);
CREATE INDEX IF NOT EXISTS entries_data_gin ON entries USING GIN (data);
CREATE INDEX IF NOT EXISTS entries_list ON entries (content_type_id, status, published_at DESC);

-- Pages are built by stacking sections: sections = [{ id, type, data, hidden }]
CREATE TABLE IF NOT EXISTS pages (
  id             SERIAL PRIMARY KEY,
  site_id        INT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  slug           TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  sections       JSONB NOT NULL DEFAULT '[]'::jsonb,
  seo            JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort_order     INT NOT NULL DEFAULT 0,
  published_at   TIMESTAMPTZ,
  author_id      INT REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (site_id, slug)
);

CREATE TABLE IF NOT EXISTS taxonomies (
  id          SERIAL PRIMARY KEY,
  site_id     INT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (site_id, slug)
);

CREATE TABLE IF NOT EXISTS terms (
  id           SERIAL PRIMARY KEY,
  taxonomy_id  INT NOT NULL REFERENCES taxonomies(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  slug         TEXT NOT NULL,
  description  TEXT,
  parent_id    INT REFERENCES terms(id) ON DELETE SET NULL,
  sort_order   INT NOT NULL DEFAULT 0,
  UNIQUE (taxonomy_id, slug)
);

CREATE TABLE IF NOT EXISTS media (
  id             SERIAL PRIMARY KEY,
  site_id        INT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  storage_key    TEXT NOT NULL,
  original_name  TEXT NOT NULL,
  mime           TEXT NOT NULL,
  size           INT NOT NULL DEFAULT 0,
  width          INT,
  height         INT,
  alt            TEXT NOT NULL DEFAULT '',
  url            TEXT NOT NULL,
  sizes          JSONB NOT NULL DEFAULT '{}'::jsonb,
  uploaded_by    INT REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS media_site ON media (site_id, created_at DESC);

CREATE TABLE IF NOT EXISTS menus (
  id          SERIAL PRIMARY KEY,
  site_id     INT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL,
  items       JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (site_id, slug)
);

-- Revision history for entries and pages (undo / restore)
CREATE TABLE IF NOT EXISTS revisions (
  id           SERIAL PRIMARY KEY,
  entity_type  TEXT NOT NULL CHECK (entity_type IN ('entry','page')),
  entity_id    INT NOT NULL,
  snapshot     JSONB NOT NULL,
  user_id      INT REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS revisions_entity ON revisions (entity_type, entity_id, created_at DESC);

-- Form submissions (contact forms etc.) posted from frontends
CREATE TABLE IF NOT EXISTS form_submissions (
  id          SERIAL PRIMARY KEY,
  site_id     INT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  form        TEXT NOT NULL,
  data        JSONB NOT NULL,
  is_read     BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
