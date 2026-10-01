// One render function per section type key.
// When a new section type is created in the CMS, add a function here with the same key.
import { esc, img, link, sendForm } from './cms.js';

export const sections = {
  hero: (d) => `
    <section class="hero ${d.theme === 'light' ? 'light' : ''}">
      ${d.background_video ? `<video class="hero-bg" src="${esc(d.background_video.url)}" autoplay muted loop playsinline></video>` : img(d.background_image, { cls: 'hero-bg' })}
      <div class="hero-inner reveal">
        ${d.eyebrow ? `<p class="eyebrow">${esc(d.eyebrow)}</p>` : ''}
        <h1>${esc(d.heading)}</h1>
        ${d.subheading ? `<p class="lead">${esc(d.subheading)}</p>` : ''}
        <div class="btns">${(d.buttons || []).map((b, i) => link(b.button, i ? 'btn ghost' : 'btn')).join('')}</div>
      </div>
    </section>`,

  text_block: (d) => `
    <section class="wrap text-block reveal" style="text-align:${d.alignment === 'center' ? 'center' : 'left'}">
      ${d.eyebrow ? `<p class="eyebrow">${esc(d.eyebrow)}</p>` : ''}
      ${d.heading ? `<h2>${esc(d.heading)}</h2>` : ''}
      <div class="rich">${d.content || ''}</div>
    </section>`,

  image_text: (d) => `
    <section class="wrap split ${d.image_position === 'left' ? 'img-left' : ''} reveal">
      <div><h2>${esc(d.heading)}</h2><div class="rich">${d.content || ''}</div>${link(d.button)}</div>
      <div class="split-img">${img(d.image, { size: 'medium', sizes: '50vw' })}</div>
    </section>`,

  stats: (d) => `
    <section class="wrap stats reveal">
      ${d.heading ? `<h2>${esc(d.heading)}</h2>` : ''}
      <div class="stats-grid">${(d.items || []).map((i) => `<div class="stat"><b data-count="${esc(i.number)}">${esc(i.number)}</b><span class="suffix">${esc(i.suffix)}</span><p>${esc(i.label)}</p></div>`).join('')}</div>
    </section>`,

  logo_strip: (d) => `
    <section class="logos reveal">
      ${d.heading ? `<p class="eyebrow center">${esc(d.heading)}</p>` : ''}
      <div class="logo-track">${[...(d.logos || []), ...(d.logos || [])].map((l) => img(l, { size: 'thumb', cls: 'logo' })).join('')}</div>
    </section>`,

  marquee_text: (d) => `
    <section class="marquee speed-${esc(d.speed || 'normal')}" aria-hidden="true">
      <div class="marquee-track">${Array(4).fill((d.words || []).map((w) => `<span>${esc(w.word)}</span>`).join('<i>✦</i>')).join('<i>✦</i>')}</div>
    </section>`,

  features: (d) => `
    <section class="wrap reveal">
      ${d.eyebrow ? `<p class="eyebrow">${esc(d.eyebrow)}</p>` : ''}${d.heading ? `<h2>${esc(d.heading)}</h2>` : ''}${d.intro ? `<p class="lead">${esc(d.intro)}</p>` : ''}
      <div class="cards">${(d.items || []).map((i) => `<div class="card">${img(i.icon, { size: 'thumb', cls: 'icon' })}<h3>${esc(i.title)}</h3><p>${esc(i.description)}</p>${link(i.link, 'more')}</div>`).join('')}</div>
    </section>`,

  gallery: (d) => `
    <section class="wrap reveal">
      ${d.heading ? `<h2>${esc(d.heading)}</h2>` : ''}
      <div class="gallery ${esc(d.layout || 'grid')}">${(d.images || []).map((m) => img(m, { size: 'medium', sizes: '33vw' })).join('')}</div>
    </section>`,

  case_study_grid: (d) => `
    <section class="wrap reveal">
      <div class="row-between"><h2>${esc(d.heading || 'Work')}</h2>${link(d.button, 'more')}</div>
      <div class="work-grid">
        ${(d.case_studies?.items || []).map((cs) => `
          <a class="work" href="case-study.html?slug=${encodeURIComponent(cs.slug)}">
            <div class="work-img">${img(cs.data.cover, { size: 'medium', sizes: '50vw' })}</div>
            <div class="work-meta"><h3>${esc(cs.title)}</h3><span>${(cs.data.industry || []).map((t) => esc(t.name)).join(', ')}</span></div>
          </a>`).join('')}
      </div>
    </section>`,

  testimonials: (d) => `
    <section class="wrap testimonials reveal">
      ${d.heading ? `<h2>${esc(d.heading)}</h2>` : ''}
      ${(d.items || []).map((t) => `<blockquote><p>“${esc(t.quote)}”</p><footer>${img(t.photo, { size: 'thumb', cls: 'avatar' })}<b>${esc(t.name)}</b> <span>${esc(t.role)}</span></footer></blockquote>`).join('')}
    </section>`,

  video: (d) => {
    const yt = d.video_url?.match(/(?:youtu\.be\/|v=)([\w-]{11})/);
    const player = yt ? `<iframe src="https://www.youtube.com/embed/${yt[1]}" allowfullscreen></iframe>`
      : d.video_file ? `<video src="${esc(d.video_file.url)}" controls poster="${esc(d.poster?.url || '')}"></video>`
      : d.video_url ? `<video src="${esc(d.video_url)}" controls></video>` : '';
    return `<section class="wrap reveal">${d.heading ? `<h2>${esc(d.heading)}</h2>` : ''}<div class="video">${player}</div></section>`;
  },

  faq: (d) => `
    <section class="wrap faq reveal">
      ${d.heading ? `<h2>${esc(d.heading)}</h2>` : ''}
      ${(d.items || []).map((q) => `<details><summary>${esc(q.question)}</summary><div class="rich">${q.answer || ''}</div></details>`).join('')}
    </section>`,

  cta: (d) => `
    <section class="cta reveal" style="background:${esc(d.background || '#111')}">
      <h2>${esc(d.heading)}</h2>${d.text ? `<p>${esc(d.text)}</p>` : ''}${link(d.button, 'btn light')}
    </section>`,

  contact_form: (d) => `
    <section class="wrap contact reveal">
      <h2>${esc(d.heading || 'Contact')}</h2>${d.text ? `<p class="lead">${esc(d.text)}</p>` : ''}
      <form data-cms-form="${esc(d.form_name || 'contact')}" data-success="${esc(d.success_message || 'Thanks!')}">
        <input name="name" placeholder="Name" required>
        <input name="email" type="email" placeholder="Email" required>
        <textarea name="message" placeholder="Tell us about your project" required></textarea>
        <input name="_gotcha" style="display:none" tabindex="-1" autocomplete="off">
        <button class="btn">Send</button>
        <p class="form-msg"></p>
      </form>
    </section>`,
};

/** Render all sections of a page. Unknown section types are skipped (and logged) so the site never breaks. */
export function renderSections(list) {
  return list.map((s) => {
    const fn = sections[s.type];
    if (!fn) { console.warn(`No component for section type "${s.type}" yet`, s.data); return ''; }
    const html = fn(s.data);
    return s.anchor ? html.replace(/^\s*<section/, `<section id="${esc(s.anchor)}"`) : html;
  }).join('');
}

/** Wire up behaviour after rendering: forms + scroll reveal animations. */
export function hydrate(root = document) {
  root.querySelectorAll('form[data-cms-form]').forEach((f) => {
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const msg = f.querySelector('.form-msg');
      msg.textContent = 'Sending…';
      const res = await sendForm(f.dataset.cmsForm, Object.fromEntries(new FormData(f)));
      msg.textContent = res.ok ? f.dataset.success : res.error || 'Something went wrong';
      if (res.ok) f.reset();
    });
  });
  const io = new IntersectionObserver((entries) => entries.forEach((en) => en.isIntersecting && en.target.classList.add('in')), { threshold: 0.12 });
  root.querySelectorAll('.reveal').forEach((el) => io.observe(el));
}
