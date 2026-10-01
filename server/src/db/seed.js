// Seeds: super admin, a shared library of common sections, and a demo site with sample content.
//   npm run seed            -> admin + shared sections + demo site (skips parts that already exist)
//   npm run seed -- --no-demo   -> only admin + shared sections
import sharp from 'sharp';
import { pool, one, query } from './index.js';
import { migrate } from './migrate.js';
import { hashPassword } from '../lib/auth.js';
import { newApiKey } from '../lib/util.js';
import { storeUpload } from '../lib/storage.js';
import { normalizeFieldDefs } from '../lib/fields.js';

const L = (label, url = '#') => ({ label, url, target: '_self' });

// ---------------------------------------------------------------------------
// Shared section library (available to every site)
// ---------------------------------------------------------------------------
const SHARED_SECTIONS = [
  { key: 'hero', name: 'Hero', icon: '🎬', description: 'Big top banner with heading, text, buttons and background image/video', fields: [
    { label: 'Eyebrow', key: 'eyebrow', type: 'text', help: 'Small text above the heading' },
    { label: 'Heading', key: 'heading', type: 'text', required: true },
    { label: 'Subheading', key: 'subheading', type: 'textarea' },
    { label: 'Background image', key: 'background_image', type: 'image', width: 'half' },
    { label: 'Background video', key: 'background_video', type: 'file', accept: 'video/*', width: 'half' },
    { label: 'Buttons', key: 'buttons', type: 'repeater', itemLabel: 'Button', max: 3, fields: [{ label: 'Button', key: 'button', type: 'link' }] },
    { label: 'Theme', key: 'theme', type: 'select', options: [{ label: 'Dark', value: 'dark' }, { label: 'Light', value: 'light' }], default: 'dark' },
  ] },
  { key: 'text_block', name: 'Text Block', icon: '📝', description: 'Heading with rich text content', fields: [
    { label: 'Eyebrow', key: 'eyebrow', type: 'text' },
    { label: 'Heading', key: 'heading', type: 'text' },
    { label: 'Content', key: 'content', type: 'richtext' },
    { label: 'Alignment', key: 'alignment', type: 'select', options: [{ label: 'Left', value: 'left' }, { label: 'Center', value: 'center' }] },
  ] },
  { key: 'image_text', name: 'Image + Text', icon: '🖼️', description: 'Image on one side, text on the other', fields: [
    { label: 'Heading', key: 'heading', type: 'text', required: true },
    { label: 'Content', key: 'content', type: 'richtext' },
    { label: 'Image', key: 'image', type: 'image', required: true },
    { label: 'Image position', key: 'image_position', type: 'select', options: [{ label: 'Left', value: 'left' }, { label: 'Right', value: 'right' }] },
    { label: 'Button', key: 'button', type: 'link' },
  ] },
  { key: 'stats', name: 'Stats / Counters', icon: '📊', description: 'Numbers like 120+ Projects', fields: [
    { label: 'Heading', key: 'heading', type: 'text' },
    { label: 'Items', key: 'items', type: 'repeater', itemLabel: 'Stat', fields: [
      { label: 'Number', key: 'number', type: 'text', required: true, width: 'third' },
      { label: 'Suffix', key: 'suffix', type: 'text', placeholder: '+, %, K', width: 'third' },
      { label: 'Label', key: 'label', type: 'text', width: 'third' },
    ] },
  ] },
  { key: 'logo_strip', name: 'Logo Strip', icon: '🏷️', description: 'Client / partner logos', fields: [
    { label: 'Heading', key: 'heading', type: 'text' },
    { label: 'Logos', key: 'logos', type: 'gallery' },
  ] },
  { key: 'features', name: 'Features / Services Grid', icon: '🧩', description: 'Cards with icon, title and text', fields: [
    { label: 'Eyebrow', key: 'eyebrow', type: 'text' },
    { label: 'Heading', key: 'heading', type: 'text' },
    { label: 'Intro', key: 'intro', type: 'textarea' },
    { label: 'Items', key: 'items', type: 'repeater', itemLabel: 'Card', fields: [
      { label: 'Icon / image', key: 'icon', type: 'image' },
      { label: 'Title', key: 'title', type: 'text', required: true },
      { label: 'Description', key: 'description', type: 'textarea' },
      { label: 'Link', key: 'link', type: 'link' },
    ] },
  ] },
  { key: 'gallery', name: 'Gallery', icon: '🖼', description: 'Grid / masonry / slider of images', fields: [
    { label: 'Heading', key: 'heading', type: 'text' },
    { label: 'Images', key: 'images', type: 'gallery', required: true },
    { label: 'Layout', key: 'layout', type: 'select', options: [{ label: 'Grid', value: 'grid' }, { label: 'Masonry', value: 'masonry' }, { label: 'Slider', value: 'slider' }] },
  ] },
  { key: 'case_study_grid', name: 'Case Study Grid', icon: '💼', description: 'Automatically shows the latest case studies', fields: [
    { label: 'Heading', key: 'heading', type: 'text' },
    { label: 'Case studies', key: 'case_studies', type: 'collection', contentType: 'case-studies', help: 'How many to show and in which order' },
    { label: 'Button', key: 'button', type: 'link' },
  ] },
  { key: 'testimonials', name: 'Testimonials', icon: '💬', description: 'Client quotes', fields: [
    { label: 'Heading', key: 'heading', type: 'text' },
    { label: 'Items', key: 'items', type: 'repeater', itemLabel: 'Testimonial', fields: [
      { label: 'Quote', key: 'quote', type: 'textarea', required: true },
      { label: 'Name', key: 'name', type: 'text', width: 'half' },
      { label: 'Role / company', key: 'role', type: 'text', width: 'half' },
      { label: 'Photo', key: 'photo', type: 'image' },
    ] },
  ] },
  { key: 'video', name: 'Video', icon: '▶️', description: 'YouTube / Vimeo / MP4 video', fields: [
    { label: 'Heading', key: 'heading', type: 'text' },
    { label: 'Video URL', key: 'video_url', type: 'video' },
    { label: 'Or upload video', key: 'video_file', type: 'file', accept: 'video/*' },
    { label: 'Poster image', key: 'poster', type: 'image' },
  ] },
  { key: 'faq', name: 'FAQ', icon: '❓', description: 'Questions and answers (accordion)', fields: [
    { label: 'Heading', key: 'heading', type: 'text' },
    { label: 'Questions', key: 'items', type: 'repeater', itemLabel: 'Question', fields: [
      { label: 'Question', key: 'question', type: 'text', required: true },
      { label: 'Answer', key: 'answer', type: 'richtext' },
    ] },
  ] },
  { key: 'cta', name: 'Call to Action', icon: '📣', description: 'Banner with heading and button', fields: [
    { label: 'Heading', key: 'heading', type: 'text', required: true },
    { label: 'Text', key: 'text', type: 'textarea' },
    { label: 'Button', key: 'button', type: 'link' },
    { label: 'Background colour', key: 'background', type: 'color' },
  ] },
  { key: 'contact_form', name: 'Contact Form', icon: '✉️', description: 'Contact form – submissions appear in Forms', fields: [
    { label: 'Heading', key: 'heading', type: 'text' },
    { label: 'Text', key: 'text', type: 'textarea' },
    { label: 'Form name', key: 'form_name', type: 'text', default: 'contact', help: 'Submissions are grouped by this name' },
    { label: 'Success message', key: 'success_message', type: 'text' },
  ] },
];

async function placeholder(text, w, h, bg) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bg[0]}"/><stop offset="1" stop-color="${bg[1]}"/></linearGradient></defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
    <text x="50%" y="50%" font-family="Arial, sans-serif" font-size="${Math.round(h / 9)}" font-weight="700" fill="#fff" text-anchor="middle" dominant-baseline="middle">${text}</text></svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 85 }).toBuffer();
}

async function addMedia(site, name, text, w, h, bg) {
  const buffer = await placeholder(text, w, h, bg);
  const file = { originalname: `${name}.jpg`, mimetype: 'image/jpeg', buffer, size: buffer.length };
  const s = await storeUpload(site, file);
  const m = await one(
    `INSERT INTO media (site_id, storage_key, original_name, mime, size, width, height, alt, url, sizes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [site.id, s.storage_key, file.originalname, file.mimetype, file.size, s.width, s.height, text, s.url, s.sizes]
  );
  return m.id;
}

async function seed() {
  await migrate();

  // 1. Super admin
  const email = (process.env.ADMIN_EMAIL || 'admin@doastra.com').toLowerCase();
  let admin = await one('SELECT id FROM users WHERE email = $1', [email]);
  if (!admin) {
    admin = await one('INSERT INTO users (name, email, password_hash, is_super_admin) VALUES ($1,$2,$3,true) RETURNING id',
      [process.env.ADMIN_NAME || 'Super Admin', email, await hashPassword(process.env.ADMIN_PASSWORD || 'ChangeMe123!')]);
    console.log(`✔ Super admin created: ${email}`);
  } else console.log(`• Super admin exists: ${email}`);

  // 2. Shared sections
  for (const s of SHARED_SECTIONS) {
    const exists = await one('SELECT 1 FROM section_types WHERE site_id IS NULL AND key = $1', [s.key]);
    if (exists) continue;
    await query('INSERT INTO section_types (site_id, name, key, description, icon, fields) VALUES (NULL,$1,$2,$3,$4,$5)',
      [s.name, s.key, s.description, s.icon, JSON.stringify(normalizeFieldDefs(s.fields))]);
  }
  console.log(`✔ Shared section library: ${SHARED_SECTIONS.length} sections`);

  if (process.argv.includes('--no-demo')) return;
  if (await one(`SELECT 1 FROM sites WHERE slug = 'demo-studio'`)) {
    console.log('• Demo site already exists – skipping');
    return;
  }

  // 3. Demo site
  const site = await one(`INSERT INTO sites (name, slug, domain, api_key, settings) VALUES ($1,$2,$3,$4,$5) RETURNING *`, [
    'Demo Studio', 'demo-studio', 'creative.doastra.com/demo', newApiKey(),
    { site_title: 'Demo Studio', tagline: 'Creative digital experiences', primary_color: '#ff4d2e', secondary_color: '#111111',
      email: 'hello@doastra.com', phone: '+91 00000 00000', footer_text: 'We design and build bold digital brands.',
      copyright: '© Demo Studio', social: [{ platform: 'LinkedIn', url: 'https://linkedin.com' }, { platform: 'Instagram', url: 'https://instagram.com' }],
      default_seo: { meta_title: 'Demo Studio', meta_description: 'Creative digital experiences' } },
  ]);
  await query(`INSERT INTO site_users (site_id, user_id, role) VALUES ($1,$2,'admin')`, [site.id, admin.id]);

  // media
  const palette = [['#ff4d2e', '#7a1fff'], ['#0f2027', '#2c5364'], ['#f7971e', '#ffd200'], ['#00c9ff', '#92fe9d'], ['#fc466b', '#3f5efb'], ['#141e30', '#243b55']];
  const heroImg = await addMedia(site, 'hero', 'Demo Studio', 1920, 1080, palette[0]);
  const aboutImg = await addMedia(site, 'about', 'Our Studio', 1400, 1000, palette[1]);
  const logos = [];
  for (let i = 1; i <= 5; i++) logos.push(await addMedia(site, `client-logo-${i}`, `Client ${i}`, 400, 200, palette[i % 6]));
  const csImgs = [];
  for (let i = 1; i <= 6; i++) csImgs.push(await addMedia(site, `project-${i}`, `Project ${i}`, 1600, 1000, palette[(i + 2) % 6]));
  const logo = await addMedia(site, 'logo', 'DEMO', 400, 120, ['#111111', '#333333']);
  await query(`UPDATE sites SET settings = settings || $2 WHERE id = $1`, [site.id, { logo, logo_url: null }]);

  // site-specific section (example of a one-off design)
  await query('INSERT INTO section_types (site_id, name, key, description, icon, fields) VALUES ($1,$2,$3,$4,$5,$6)', [
    site.id, 'Marquee Text', 'marquee_text', 'Big scrolling text band (Demo Studio only)', '〰️',
    JSON.stringify(normalizeFieldDefs([
      { label: 'Words', key: 'words', type: 'repeater', itemLabel: 'Word', fields: [{ label: 'Word', key: 'word', type: 'text' }] },
      { label: 'Speed', key: 'speed', type: 'select', options: ['Slow', 'Normal', 'Fast'] },
    ])),
  ]);

  // taxonomies
  const industry = await one(`INSERT INTO taxonomies (site_id, name, slug) VALUES ($1,'Industry','industry') RETURNING id`, [site.id]);
  const category = await one(`INSERT INTO taxonomies (site_id, name, slug) VALUES ($1,'Category','category') RETURNING id`, [site.id]);
  const ind = {};
  for (const [n, s] of [['Technology', 'technology'], ['Healthcare', 'healthcare'], ['Finance', 'finance']]) {
    ind[s] = (await one('INSERT INTO terms (taxonomy_id, name, slug) VALUES ($1,$2,$3) RETURNING id', [industry.id, n, s])).id;
  }
  const cat = {};
  for (const [n, s] of [['Design', 'design'], ['Development', 'development'], ['News', 'news']]) {
    cat[s] = (await one('INSERT INTO terms (taxonomy_id, name, slug) VALUES ($1,$2,$3) RETURNING id', [category.id, n, s])).id;
  }

  // content types
  const csType = await one(`INSERT INTO content_types (site_id, name, singular_name, slug, icon, fields, sort_by) VALUES ($1,$2,$3,$4,$5,$6,'sort_order') RETURNING *`, [
    site.id, 'Case Studies', 'Case Study', 'case-studies', '💼', JSON.stringify(normalizeFieldDefs([
      { label: 'Client', key: 'client', type: 'text', required: true, width: 'half' },
      { label: 'Year', key: 'year', type: 'text', width: 'half' },
      { label: 'Excerpt', key: 'excerpt', type: 'textarea' },
      { label: 'Cover image', key: 'cover', type: 'image', required: true },
      { label: 'Industry', key: 'industry', type: 'taxonomy', taxonomy: 'industry' },
      { label: 'Services', key: 'services', type: 'select', multiple: true, options: ['Branding', 'UI/UX', 'Web Development', '3D & Motion'] },
      { label: 'Content', key: 'body', type: 'richtext' },
      { label: 'Gallery', key: 'gallery', type: 'gallery' },
      { label: 'Results', key: 'results', type: 'repeater', itemLabel: 'Result', fields: [
        { label: 'Number', key: 'number', type: 'text', width: 'half' }, { label: 'Label', key: 'label', type: 'text', width: 'half' }] },
      { label: 'Live website', key: 'website', type: 'link' },
      { label: 'Related case studies', key: 'related', type: 'relation', contentType: 'case-studies', multiple: true },
    ])),
  ]);
  const postType = await one(`INSERT INTO content_types (site_id, name, singular_name, slug, icon, fields) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`, [
    site.id, 'Posts', 'Post', 'posts', '📰', JSON.stringify(normalizeFieldDefs([
      { label: 'Excerpt', key: 'excerpt', type: 'textarea' },
      { label: 'Cover image', key: 'cover', type: 'image' },
      { label: 'Category', key: 'category', type: 'taxonomy', taxonomy: 'category' },
      { label: 'Content', key: 'body', type: 'richtext', required: true },
    ])),
  ]);
  await query(`INSERT INTO content_types (site_id, name, singular_name, slug, icon, fields, has_seo, sort_by) VALUES ($1,$2,$3,$4,$5,$6,false,'sort_order')`, [
    site.id, 'Team', 'Team Member', 'team', '👥', JSON.stringify(normalizeFieldDefs([
      { label: 'Photo', key: 'photo', type: 'image' },
      { label: 'Role', key: 'role', type: 'text' },
      { label: 'Bio', key: 'bio', type: 'textarea' },
      { label: 'LinkedIn', key: 'linkedin', type: 'link' },
    ])),
  ]);

  // entries
  const projects = [
    ['Nova Fintech Rebrand', 'Nova Finance', 'finance', ['branding', 'ui_ux']],
    ['MedCare Patient App', 'MedCare', 'healthcare', ['ui_ux', 'web_development']],
    ['Orbit SaaS Website', 'Orbit Labs', 'technology', ['web_development', '3d_motion']],
    ['Pulse Health Portal', 'Pulse', 'healthcare', ['web_development']],
    ['Quantum AI Launch', 'Quantum', 'technology', ['branding', '3d_motion']],
    ['Ledger Banking Dashboard', 'Ledger', 'finance', ['ui_ux']],
  ];
  const csIds = [];
  for (let i = 0; i < projects.length; i++) {
    const [title, client, indSlug, services] = projects[i];
    const e = await one(
      `INSERT INTO entries (site_id, content_type_id, title, slug, status, data, seo, sort_order, published_at, author_id)
       VALUES ($1,$2,$3,$4,'published',$5,$6,$7,now() - ($7::int * interval '1 day'),$8) RETURNING id`,
      [site.id, csType.id, title, title.toLowerCase().replace(/[^a-z0-9]+/g, '-'), {
        client, year: '2026', excerpt: `How we helped ${client} stand out with a bold new digital experience.`,
        cover: csImgs[i], industry: [ind[indSlug]], services,
        body: `<h2>The challenge</h2><p>${client} needed a modern identity and website.</p><h2>Our approach</h2><p>Research, design sprints and a motion-first build.</p>`,
        gallery: [csImgs[(i + 1) % 6], csImgs[(i + 2) % 6], csImgs[(i + 3) % 6]],
        results: [{ _id: 'r1', number: `${120 + i * 15}%`, label: 'More leads' }, { _id: 'r2', number: `${2 + i}x`, label: 'Faster site' }],
        website: L('Visit website', 'https://example.com'), related: [],
      }, { meta_title: `${title} – Case Study`, meta_description: `Case study: ${title}` }, i, admin.id]
    );
    csIds.push(e.id);
  }
  await query(`UPDATE entries SET data = jsonb_set(data, '{related}', $2) WHERE id = $1`, [csIds[0], JSON.stringify([csIds[1], csIds[2]])]);

  for (const [title, c] of [['Why motion design matters', 'design'], ['Building fast websites in 2026', 'development'], ['We are hiring!', 'news']]) {
    await query(
      `INSERT INTO entries (site_id, content_type_id, title, slug, status, data, published_at, author_id) VALUES ($1,$2,$3,$4,'published',$5,now(),$6)`,
      [site.id, postType.id, title, title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-$/, ''),
        { excerpt: `${title} – a short summary.`, cover: csImgs[3], category: [cat[c]], body: `<p>${title}. Full article content goes here.</p>` }, admin.id]
    );
  }

  // pages
  const sec = (type, data, id) => ({ id: id || Math.random().toString(36).slice(2, 10), type, data });
  const homeSections = [
    sec('hero', { eyebrow: 'Creative Digital Studio', heading: 'We build bold digital experiences', subheading: 'Branding, websites and motion for ambitious companies.',
      background_image: heroImg, background_video: null, buttons: [{ _id: 'b1', button: L('See our work', '#work') }, { _id: 'b2', button: L('Contact us', '#contact') }], theme: 'dark' }),
    sec('logo_strip', { heading: 'Trusted by', logos }),
    sec('stats', { heading: 'Numbers that matter', items: [
      { _id: 's1', number: '120', suffix: '+', label: 'Projects delivered' }, { _id: 's2', number: '15', suffix: '', label: 'Countries' }, { _id: 's3', number: '98', suffix: '%', label: 'Happy clients' }] }),
    sec('marquee_text', { words: [{ _id: 'w1', word: 'Strategy' }, { _id: 'w2', word: 'Design' }, { _id: 'w3', word: 'Technology' }, { _id: 'w4', word: 'Motion' }], speed: 'normal' }),
    sec('image_text', { heading: 'A studio built for creative tech', content: '<p>We mix design, code and motion to create websites people remember.</p>', image: aboutImg, image_position: 'right', button: L('About us', '/about') }),
    { ...sec('case_study_grid', { heading: 'Selected work', case_studies: { limit: 6, sort: 'order', terms: [] }, button: L('All case studies', '/work') }), anchor: 'work' },
    sec('testimonials', { heading: 'What clients say', items: [{ _id: 't1', quote: 'They transformed our brand and our sales.', name: 'Asha Rao', role: 'CMO, Nova Finance', photo: null }] }),
    sec('faq', { heading: 'FAQ', items: [{ _id: 'f1', question: 'How long does a website take?', answer: '<p>Usually 4–8 weeks.</p>' }, { _id: 'f2', question: 'Do you offer support?', answer: '<p>Yes, monthly care plans.</p>' }] }),
    { ...sec('contact_form', { heading: "Let's talk", text: 'Tell us about your project.', form_name: 'contact', success_message: 'Thanks! We will reply within 24 hours.' }), anchor: 'contact' },
  ];
  await query(`INSERT INTO pages (site_id, title, slug, status, sections, seo, sort_order, published_at, author_id) VALUES ($1,'Home','home','published',$2,$3,0,now(),$4)`,
    [site.id, JSON.stringify(homeSections), { meta_title: 'Demo Studio – Creative Digital Studio', meta_description: 'We build bold digital experiences.', og_image: heroImg }, admin.id]);
  await query(`INSERT INTO pages (site_id, title, slug, status, sections, sort_order, published_at, author_id) VALUES ($1,'About','about','published',$2,1,now(),$3)`,
    [site.id, JSON.stringify([
      sec('hero', { heading: 'About us', subheading: 'A small team with big ideas.', background_image: aboutImg, buttons: [], theme: 'dark', eyebrow: '', background_video: null }),
      sec('text_block', { eyebrow: 'Our story', heading: 'Since 2015', content: '<p>We started as two designers and a developer.</p>', alignment: 'left' }),
      sec('cta', { heading: 'Have a project in mind?', text: 'Let’s build something great.', button: L('Get in touch', '/#contact'), background: '#ff4d2e' }),
    ]), admin.id]);

  await query(`INSERT INTO menus (site_id, name, slug, items) VALUES ($1,'Main menu','main',$2),($1,'Footer menu','footer',$3)`, [site.id,
    JSON.stringify([{ label: 'Home', url: '/', target: '_self', children: [] }, { label: 'Work', url: '/#work', target: '_self', children: [] }, { label: 'About', url: '/about', target: '_self', children: [] }, { label: 'Contact', url: '/#contact', target: '_self', children: [] }]),
    JSON.stringify([{ label: 'Privacy', url: '/privacy', target: '_self', children: [] }])]);

  console.log(`✔ Demo site created: "${site.name}"  API key: ${site.api_key}`);
}

seed()
  .then(() => pool.end())
  .catch((err) => { console.error(err); process.exit(1); });
