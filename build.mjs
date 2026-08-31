#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   بناء الموقع — يحوّل القوالب + البيانات إلى صفحات HTML ثابتة.

   node build.mjs           بناء كامل
   node build.mjs --check   فحص البيانات فقط، بدون كتابة أي ملف

   لا يحتاج أي مكتبة خارجية.
   ═══════════════════════════════════════════════════════════════════════════ */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const CHECK_ONLY = process.argv.includes('--check');
const p = (...s) => join(ROOT, ...s);

/* ── تحميل البيانات ─────────────────────────────────────────────────────── */
function loadData() {
  const sandbox = {};
  for (const f of ['business.js', 'products.js']) {
    const src = readFileSync(p('data', f), 'utf8');
    new Function('window', src)(sandbox);
  }
  return sandbox;
}
const D = loadData();
const BUSINESS = D.BUSINESS, PRODUCTS = D.PRODUCTS,
      CATEGORIES = D.CATEGORIES, PRICE_PENDING = D.PRICE_PENDING_TEXT;

/* ── التحقّق من صحّة البيانات ────────────────────────────────────────────── */
const errors = [], warnings = [];
const CAT_IDS = new Set(CATEGORIES.map(c => c.id));
const IMG_DIR = p('assets', 'images', 'products');
const onDisk = existsSync(IMG_DIR) ? new Set(readdirSync(IMG_DIR)) : new Set();
const seen = new Map();

for (const [i, prod] of PRODUCTS.entries()) {
  const at = `المنتج #${i + 1} (${prod.code || 'بلا رمز'})`;
  for (const field of ['code', 'cat', 'name', 'desc', 'availability'])
    if (!prod[field]) errors.push(`${at}: الحقل المطلوب «${field}» ناقص`);

  if (prod.code) {
    if (seen.has(prod.code)) errors.push(`${at}: الرمز مكرّر — مستخدم في المنتج #${seen.get(prod.code) + 1}`);
    else seen.set(prod.code, i);
    if (!/^[A-Za-z]{2}-\d{2,}$/.test(prod.code))
      warnings.push(`${at}: الرمز لا يتبع الصيغة المعتادة (مثل AS-01)`);
  }
  if (prod.cat && !CAT_IDS.has(prod.cat))
    errors.push(`${at}: القسم «${prod.cat}» غير معرّف في CATEGORIES`);
  if (!['made_to_order', 'sold_out', 'coming_soon'].includes(prod.availability))
    errors.push(`${at}: قيمة availability غير معروفة «${prod.availability}»`);

  if (!Array.isArray(prod.images) || !prod.images.length) {
    errors.push(`${at}: لا توجد صور`);
  } else {
    for (const im of prod.images) {
      if (!im.alt) errors.push(`${at}: الصورة «${im.file}» بلا نص بديل (alt)`);
      for (const suffix of ['.jpg', '-sm.jpg', '.webp', '-sm.webp', '.avif', '-sm.avif'])
        if (!onDisk.has(im.file + suffix))
          errors.push(`${at}: الملف الناقص assets/images/products/${im.file}${suffix}`);
    }
  }
  for (const c of prod.colors || []) {
    if (!/^#[0-9A-Fa-f]{6}$/.test(c.hex || '')) errors.push(`${at}: لون غير صالح «${c.hex}»`);
    if (!c.name) errors.push(`${at}: لون بلا اسم`);
  }
  if (prod.price && !prod.price.amount) errors.push(`${at}: price بلا amount`);
}
for (const c of CATEGORIES)
  if (!['available', 'soon'].includes(c.status)) errors.push(`القسم «${c.id}»: status غير معروف`);

// a category marked available but holding nothing would show an empty filter
for (const c of CATEGORIES)
  if (c.status === 'available' && !PRODUCTS.some(x => x.cat === c.id))
    warnings.push(`القسم «${c.label}» معلَّم available لكنه لا يحتوي أي تصميم — سيظهر فلتر فارغ`);

if (warnings.length) console.log('⚠️  تنبيهات:\n  ' + warnings.join('\n  '));
if (errors.length) { console.error('\n❌ أخطاء في البيانات:\n  ' + errors.join('\n  ') + '\n'); process.exit(1); }
console.log(`✓ البيانات سليمة — ${PRODUCTS.length} تصميم، ${CATEGORIES.length} أقسام`);
if (CHECK_ONLY) process.exit(0);

/* ── أدوات ──────────────────────────────────────────────────────────────── */
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const ORIGIN = (BUSINESS.domain || '').replace(/\/$/, '');
const abs = path => ORIGIN ? ORIGIN + '/' + String(path).replace(/^\//, '') : path;
const slug = code => code.toLowerCase();
const productUrl = code => `product/${slug(code)}/`;
const wa = msg => `https://wa.me/${BUSINESS.whatsapp}?text=${encodeURIComponent(msg)}`;

const priceText = prod => prod.price
  ? (prod.price.from ? 'يبدأ من ' : '') + prod.price.amount + ' ر.س'
  : PRICE_PENDING;

const AVAIL = {
  made_to_order: { label: 'تُفصَّل حسب الطلب', tone: 'ok' },
  sold_out:      { label: 'نفد القماش',        tone: 'off' },
  coming_soon:   { label: 'قريبًا',            tone: 'soon' }
};

const orderMsg = prod => `السلام عليكم 🌸
أرغب بالاستفسار عن هذا التصميم:

• التصميم: ${prod.name}
• الرمز: ${prod.code}

وأرغب بمعرفة السعر والمقاسات.`;

const altMsg = prod => `السلام عليكم 🌸
التصميم ${prod.name} (${prod.code}) نفد قماشه.
هل يوجد تصميم قريب منه متوفر؟`;

/* ── صورة متجاوبة ───────────────────────────────────────────────────────── */
function picture(im, { sizes, cls, eager = false, w = 500, h = 625, prefix = '' }) {
  const base = prefix + 'assets/images/products/' + im.file;
  return `<picture>
        <source type="image/avif" sizes="${esc(sizes)}" srcset="${base}-sm.avif 500w, ${base}.avif 1000w">
        <source type="image/webp" sizes="${esc(sizes)}" srcset="${base}-sm.webp 500w, ${base}.webp 1000w">
        <img src="${base}-sm.jpg" srcset="${base}-sm.jpg 500w, ${base}.jpg 1000w" sizes="${esc(sizes)}"
             alt="${esc(im.alt)}" width="${w}" height="${h}" decoding="async"
             ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} class="${esc(cls)}">
      </picture>`;
}

/* ── بطاقة تصميم ────────────────────────────────────────────────────────── */
function card(prod, prefix = '') {
  const av = AVAIL[prod.availability];
  const sold = prod.availability === 'sold_out';
  const im = prod.images[0];
  const swatches = (prod.colors || []).length ? `
        <div class="mt-3 flex items-center gap-1.5">
          <span class="sr-only">ألوان القطعة في الصورة: ${esc(prod.colors.map(c => c.name).join('، '))}</span>
          ${prod.colors.map(c => `<span class="h-4 w-4 rounded-full ring-1 ring-ink/20" style="background:${esc(c.hex)}"></span>`).join('')}
          <span class="ms-1 text-xs text-ink-mute">${esc(prod.colors.map(c => c.name).join(' · '))}</span>
        </div>` : '';

  const cta = sold
    ? `<a class="btn-ghost !px-4 !py-2.5 !text-sm whitespace-nowrap" href="${esc(wa(altMsg(prod)))}" target="_blank" rel="noopener">اسألي عن بديل مشابه</a>`
    : `<a class="btn-wa !px-4 !py-2.5 !text-sm whitespace-nowrap" href="${esc(wa(orderMsg(prod)))}" target="_blank" rel="noopener">اطلبي عبر واتساب</a>`;

  return `<article class="card group flex flex-col" data-cat="${esc(prod.cat)}" data-code="${esc(prod.code)}">
      <a class="relative block aspect-[4/5] overflow-hidden bg-deep" href="${prefix}${productUrl(prod.code)}">
        ${picture(im, { prefix, sizes: '(min-width:1024px) 340px, (min-width:640px) 45vw, 92vw',
                        cls: 'h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]' })}
        <span class="pill pill-${av.tone} absolute top-3 end-3">${esc(av.label)}</span>
      </a>
      <div class="flex flex-1 flex-col p-5">
        <div class="flex items-baseline justify-between gap-3">
          <h3 class="text-lg leading-snug">
            <a class="hover:text-plum" href="${prefix}${productUrl(prod.code)}">${esc(prod.name)}</a>
          </h3>
          <span class="num shrink-0 text-xs text-ink-mute">${esc(prod.code)}</span>
        </div>
        <p class="mt-2 text-sm leading-7 text-ink-soft">${esc(prod.desc)}</p>
        ${prod.fabric ? `<p class="mt-2 text-sm text-ink-soft">القماش: ${esc(prod.fabric)}</p>` : ''}
        ${swatches}
        <ul class="mt-3 flex flex-wrap gap-1.5">
          ${(prod.details || []).map(d => `<li class="rounded-full bg-deep px-3 py-1 text-xs text-ink-soft">${esc(d)}</li>`).join('')}
        </ul>
        <div class="mt-auto flex items-center justify-between gap-3 border-t border-ink/10 pt-4 mt-5">
          <span class="text-sm ${prod.price ? 'font-medium text-plum' : 'text-ink-mute'}">${esc(priceText(prod))}</span>
          ${cta}
        </div>
      </div>
    </article>`;
}

/* ── قوالب ──────────────────────────────────────────────────────────────── */
const partial = name => readFileSync(p('src', 'partials', name + '.html'), 'utf8');

function render(tpl, ctx) {
  let out = tpl;
  for (let i = 0; i < 5; i++) {                       // allow nested partials
    const before = out;
    out = out.replace(/\{\{>\s*([\w-]+)\s*\}\}/g, (_, n) => partial(n));
    if (out === before) break;
  }
  return out.replace(/\{\{\{(\w+)\}\}\}/g, (_, k) => ctx[k] ?? '')
            .replace(/\{\{(\w+)\}\}/g, (_, k) => esc(ctx[k] ?? ''));
}

const NAV = [
  { href: 'index.html',    key: 'home',     label: 'الرئيسية' },
  { href: 'products.html', key: 'products', label: 'التصاميم' },
  { href: 'sizes.html',    key: 'sizes',    label: 'المقاسات' },
  { href: 'index.html#about', key: 'about', label: 'عن أريج' }
];

function navHtml(active, prefix = '') {
  return NAV.map(n => {
    const on = n.key === active;
    return `<a class="navlink tap py-2${on ? ' is-current' : ''}" href="${prefix}${n.href}"${on ? ' aria-current="page"' : ''}>${n.label}</a>`;
  }).join('\n      ');
}

function pageCtx({ title, desc, path, active, prefix = '', ogImage, extraHead = '', jsonld = '' }) {
  return {
    TITLE: title, DESC: desc, PREFIX: prefix,
    CANONICAL: abs(path), OG_IMAGE: abs(ogImage || 'assets/images/products/as-01-rose-floral.jpg'),
    NAV_DESKTOP: navHtml(active, prefix),
    NAV_MOBILE: navHtml(active, prefix).replace(/navlink tap py-2/g, 'navlink tap py-3 text-[15px]'),
    YEAR: String(new Date().getFullYear()),
    EXTRA_HEAD: extraHead, JSONLD: jsonld,
    WA_GENERAL: wa('السلام عليكم 🌸 أود الاستفسار عن التصاميم المتوفرة والمقاسات.'),
    IG: 'https://instagram.com/' + BUSINESS.instagram,
    MAROOF: BUSINESS.maroof.url, MAROOF_ID: BUSINESS.maroof.id,
    YOUTUBE_BLOCK: BUSINESS.youtube
      ? `<li><a class="tap block py-3 hover:text-plum" href="${esc(BUSINESS.youtube)}" target="_blank" rel="noopener">يوتيوب</a></li>` : '',
    BRAND: BUSINESS.name, BRAND_SHORT: BUSINESS.nameShort
  };
}

/* ── رسوم القياس (SVG مرسومة يدويًا، لا صور خارجية) ─────────────────────── */
const DIA = (title, body) => `<svg viewBox="0 0 96 120" class="h-28 w-[76px] shrink-0 text-plum" role="img" aria-label="${esc(title)}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const DRESS = '<path d="M34 22h28l14 12-9 7v56a2 2 0 0 1-2 2H31a2 2 0 0 1-2-2V41l-9-7Z" opacity=".38"/><path d="M39 22a9 9 0 0 0 18 0" opacity=".38"/>';
const DIAGRAMS = {
  chest: DIA('رسم يوضّح قياس محيط الصدر حول أوسع نقطة',
    DRESS + '<path d="M22 46c10 6 42 6 52 0" stroke-dasharray="4 3"/><path d="M22 46l4-3m-4 3 4 3M74 46l-4-3m4 3-4 3"/>'),
  head: DIA('رسم يوضّح قياس محيط الرأس فوق الأذنين',
    '<circle cx="48" cy="42" r="22" opacity=".38"/><path d="M26 46c8 7 36 7 44 0" stroke-dasharray="4 3"/><path d="M26 46l4-3m-4 3 4 3M70 46l-4-3m4 3-4 3"/><path d="M30 74c4 12 32 12 36 0" opacity=".38"/>'),
  length: DIA('رسم يوضّح قياس الطول الكلي من الكتف إلى الأسفل',
    DRESS + '<path d="M48 24v72" stroke-dasharray="4 3"/><path d="M48 24l-4 5m4-5 4 5M48 96l-4-5m4 5 4-5"/>'),
  sleeve: DIA('رسم يوضّح قياس طول الكم من الكتف إلى الرسغ',
    DRESS + '<path d="M64 34 78 76" stroke-dasharray="4 3"/><path d="m64 34 1 6m-1-6 5 2M78 76l-1-6m1 6-5-2"/>')
};

/* ── أقسام الصفحة الرئيسية ──────────────────────────────────────────────── */
const ICON = b => `<svg class="h-6 w-6" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${b}</svg>`;
const trustItem = (tint, icon, title, sub) => `<div class="flex items-start gap-3">
      <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-${tint} text-${tint}-ink">${icon}</span>
      <div><p class="font-medium">${esc(title)}</p><p class="text-sm text-ink-mute">${sub}</p></div>
    </div>`;

const trustItems = [
  trustItem('blush', ICON('<circle cx="7" cy="24" r="3.2"/><circle cx="7" cy="8" r="3.2"/><path d="M9.6 22 26 6M9.6 10 26 26M13 16l4.5 4.4"/>'),
    'خياطة يدوية', 'كل قطعة تُخاط على حدة'),
  trustItem('sand', ICON('<rect x="3" y="11" width="26" height="10" rx="2"/><path d="M9 11v4M14 11v6M19 11v4M24 11v6"/>'),
    'مقاسات حسب الطلب', 'تُفصَّل بعد الطلب، لا مقاسات جاهزة'),
  trustItem('mint', ICON('<path d="M16 3.5 27 7.5v8c0 6.6-4.5 11.6-11 13.5C9.5 27.1 5 22.1 5 15.5v-8Z"/><path d="m11.5 15.8 3.2 3.2 6-6.4"/>'),
    'موثّقة في «معروف»', `<a class="text-plum underline underline-offset-4" href="${esc(BUSINESS.maroof.url)}" target="_blank" rel="noopener">تحقّقي من التوثيق</a>`)
].join('\n    ');

const available = PRODUCTS.filter(x => x.availability !== 'coming_soon');
const featured = available.slice(0, 3).map(x => card(x)).join('\n      ');

const soonCats = CATEGORIES.filter(c => c.status === 'soon');
const categoryNote = soonCats.length ? `
    <p class="mt-10 rounded-2xl bg-deep px-6 py-5 text-center text-sm leading-7 text-ink-soft">
      تخيط أريج أيضًا ${esc(soonCats.map(c => c.label).join(' و'))} —
      التصاميم قيد التصوير ولم تُنشر بعد.
      <a class="text-plum underline underline-offset-4" href="${esc(wa('السلام عليكم 🌸 أود الاستفسار عن ' + soonCats.map(c => c.label).join(' و') + ' المتوفرة حاليًا.'))}" target="_blank" rel="noopener">اسألي أريج عن المتوفر حاليًا</a>.
    </p>` : '';

/* الخطوة الأخيرة تعتمد على معلومات لم تُؤكَّد بعد — لا نخترعها */
const deliveryStep = BUSINESS.delivery
  ? `<strong>${esc(BUSINESS.delivery.areas)}</strong>${BUSINESS.delivery.cost ? ` — رسوم التوصيل ${esc(BUSINESS.delivery.cost)}` : ''}.`
  : 'تتفقان على طريقة الاستلام أو التوصيل داخل نفس المحادثة.';
const prodLine = BUSINESS.productionDays
  ? `التنفيذ خلال ${BUSINESS.productionDays.min}–${BUSINESS.productionDays.max} أيام.`
  : 'تخبرك أريج بالمدة المتوقّعة قبل أن تبدأ.';

const STEPS = [
  ['تختارين التصميم', 'اضغطي «اطلبي عبر واتساب» على أي تصميم. تُفتح رسالة جاهزة تحمل اسمه ورمزه — لا تحتاجين كتابة شيء.'],
  ['تردّ عليك أريج', 'بالسعر، والقماش المتوفر، وأي سؤال عندك. الردّ منها شخصيًا، لا ردّ آلي.'],
  ['ترسلين مقاساتك', 'من صفحة المقاسات، تُبنى لك رسالة مرتّبة بمقاساتك وترسلينها بضغطة.'],
  ['تبدأ الخياطة', `بعد تأكيد الطلب والمقاس. ${prodLine}`],
  ['الاستلام', deliveryStep]
];
const orderSteps = STEPS.map(([t, d], i) => `<li class="relative flex gap-5 pb-8 last:pb-0">
        <span class="relative z-10 num flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-plum font-display text-lg text-ivory">${i + 1}</span>
        ${i < STEPS.length - 1 ? '<span class="absolute top-10 bottom-0 start-[19px] w-px bg-plum/25" aria-hidden="true"></span>' : ''}
        <div class="pt-1.5"><h3 class="text-lg">${esc(t)}</h3><p class="mt-1.5 text-sm leading-7 text-ink-soft">${d}</p></div>
      </li>`).join('\n      ');

const missingFulfilment = !BUSINESS.delivery || !BUSINESS.productionDays || !BUSINESS.returns;
const fulfilmentNote = BUSINESS.delivery || BUSINESS.productionDays ? `
    <div class="mt-10 grid gap-4 sm:grid-cols-2">
      ${BUSINESS.productionDays ? `<div class="rounded-2xl bg-mint p-5"><p class="font-medium">مدة التنفيذ</p><p class="mt-1 text-sm text-ink-soft">${BUSINESS.productionDays.min}–${BUSINESS.productionDays.max} أيام</p></div>` : ''}
      ${BUSINESS.delivery ? `<div class="rounded-2xl bg-sky p-5"><p class="font-medium">التوصيل</p><p class="mt-1 text-sm text-ink-soft">${esc(BUSINESS.delivery.areas)}${BUSINESS.delivery.cost ? ' — ' + esc(BUSINESS.delivery.cost) : ''}</p></div>` : ''}
    </div>` : '';

/* المراجعات: قسم كامل مخفي ما لم تكن هناك مراجعات حقيقية */
const reviewsSection = (BUSINESS.reviews || []).length ? `
<section class="section" aria-labelledby="rev-h">
  <div class="wrap max-w-4xl">
    <p class="eyebrow">آراء العميلات</p>
    <h2 id="rev-h" class="mt-3 text-3xl sm:text-4xl">ماذا قلن عن الشغل</h2>
    <div class="mt-10 grid gap-6 sm:grid-cols-2">
      ${BUSINESS.reviews.map(r => `<figure class="rounded-2xl bg-card p-6 shadow-card">
        <blockquote class="text-[15px] leading-8 text-ink-soft">${esc(r.text)}</blockquote>
        <figcaption class="mt-4 text-sm font-medium">${esc(r.name)}${r.city ? ' — ' + esc(r.city) : ''}</figcaption>
      </figure>`).join('\n      ')}
    </div>
  </div>
</section>` : '<!-- قسم المراجعات مخفي: لا توجد مراجعات حقيقية بعد. أضيفيها في data/business.js -->';

/* صور العميلات: القسم كله مخفي ما لم تُضَف صور حقيقية بإذن أصحابها */
const customerPhotos = (BUSINESS.customerPhotos || []).length ? `
<section class="section bg-card/60 border-y border-ink/8" aria-labelledby="cp-h">
  <div class="wrap">
    <p class="eyebrow">من العميلات</p>
    <h2 id="cp-h" class="mt-3 text-3xl sm:text-4xl">القطع عند أصحابها</h2>
    <ul class="mt-10 grid gap-5 sm:grid-cols-3 lg:grid-cols-4">
      ${BUSINESS.customerPhotos.map(ph => `<li class="overflow-hidden rounded-2xl bg-deep">
        <img src="assets/images/customers/${esc(ph.file)}.jpg" alt="${esc(ph.alt)}"
             width="500" height="625" loading="lazy" decoding="async" class="aspect-[4/5] w-full object-cover"></li>`).join('\n      ')}
    </ul>
  </div>
</section>` : '<!-- قسم صور العميلات مخفي: لا توجد صور بعد. أضيفيها في data/business.js -->';

const faqItem = (q, a) => `<details class="group py-5">
        <summary class="tap flex min-h-[44px] list-none items-center justify-between gap-4 text-[17px] font-medium">
          ${esc(q)}<span class="text-plum transition-transform group-open:rotate-45" aria-hidden="true">+</span>
        </summary>
        <div class="mt-3 leading-8 text-ink-soft">${a}</div>
      </details>`;

const FAQ = [
  ['هل المقاسات جاهزة أم حسب الطلب؟',
   'كل قطعة تُفصّل على مقاسك. أرسلي مقاساتك من <a class="text-plum underline underline-offset-4" href="sizes.html">صفحة المقاسات</a> وتصلك رسالة واتساب جاهزة بكل التفاصيل.'],
  ['كيف أعرف السعر؟',
   `السعر يختلف باختلاف القماش والتصميم والمقاس، ولهذا لا يوجد رقم ثابت معروض. أرسلي رمز التصميم عبر الواتساب ويصلك السعر مباشرة.`],
  ['هل التصاميم متوفرة دائمًا؟',
   'الأقمشة تُشترى بكميات محدودة، فبعض النقشات لا تتكرّر. التصميم الذي نفد قماشه مكتوب عليه ذلك، وتقترح عليك أريج أقرب البدائل.'],
  ['كيف أتأكّد من المتجر؟',
   `المتجر موثّق في منصة «معروف» التابعة لوزارة التجارة — <a class="text-plum underline underline-offset-4" href="${esc(BUSINESS.maroof.url)}" target="_blank" rel="noopener">اطّلعي على صفحة التوثيق</a>.`]
];
if (BUSINESS.returns) FAQ.push(['هل يمكن الاستبدال أو الاسترجاع؟', esc(BUSINESS.returns)]);
if (BUSINESS.alterations) FAQ.push(['وإذا احتاج المقاس تعديلًا؟', esc(BUSINESS.alterations)]);
if (BUSINESS.payment) FAQ.push(['كيف أدفع؟', esc(BUSINESS.payment.join('، '))]);
const faqHtml = FAQ.map(([q, a]) => faqItem(q, a)).join('\n      ');

const youtubeBtn = BUSINESS.youtube
  ? `<a href="${esc(BUSINESS.youtube)}" class="btn border border-ivory/30 text-ivory hover:bg-ivory/10" target="_blank" rel="noopener">قناة اليوتيوب</a>` : '';

/* ── بيانات منظّمة: منظّمة فقط. لا Product schema بلا سعر وتوفّر مؤكّدين. ── */
const orgJsonLd = `<script type="application/ld+json">${JSON.stringify({
  '@context': 'https://schema.org', '@type': 'Organization',
  name: BUSINESS.name, alternateName: 'Areej Shawly',
  description: 'أطقم صلاة وتوربان وطرح حجاب من البوال والقطن، مخيطة يدويًا وبمقاسات حسب الطلب.',
  ...(ORIGIN ? { url: ORIGIN + '/' } : {}),
  logo: abs('assets/images/brand/logo.png'),
  image: abs('assets/images/products/as-01-rose-floral.jpg'),
  telephone: '+' + BUSINESS.whatsapp,
  areaServed: { '@type': 'Country', name: 'السعودية' },
  sameAs: ['https://instagram.com/' + BUSINESS.instagram, BUSINESS.maroof.url],
  contactPoint: { '@type': 'ContactPoint', contactType: 'customer service',
                  telephone: '+' + BUSINESS.whatsapp, availableLanguage: ['ar'] }
}, null, 2)}<\/script>`;

/* ── كتابة الصفحات ──────────────────────────────────────────────────────── */
const write = (rel, html) => {
  const full = p(rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, html);
  return rel;
};
const written = [];

const heroProduct = PRODUCTS[0];
const heroImage = `<a href="${productUrl(heroProduct.code)}" class="relative block">
        ${picture(heroProduct.images[0], {
          sizes: '(min-width:1024px) 520px, 92vw', eager: true, w: 1000, h: 1250,
          cls: 'relative mx-auto w-full max-w-[460px] rounded-[1.75rem] object-cover shadow-lift' })}
      </a>`;

/* الرئيسية */
written.push(write('index.html', render(readFileSync(p('src/pages/index.html'), 'utf8'), {
  ...pageCtx({ title: `${BUSINESS.name} | أطقم صلاة مخيطة على مقاسك`,
    desc: 'أطقم صلاة وتوربان وطرح حجاب من البوال والقطن، مخيطة يدويًا وبمقاسات حسب الطلب. الطلب مباشرة عبر الواتساب.',
    path: 'index.html', active: 'home', jsonld: orgJsonLd }),
  HERO_IMAGE: heroImage, TRUST_ITEMS: trustItems, FEATURED: featured,
  CATEGORY_NOTE: categoryNote, ORDER_STEPS: orderSteps, FULFILMENT_NOTE: fulfilmentNote,
  REVIEWS_SECTION: reviewsSection, CUSTOMER_PHOTOS: customerPhotos,
  FAQ: faqHtml, YOUTUBE_BTN: youtubeBtn
})));

/* التصاميم — الفلاتر للأقسام التي فيها تصاميم فعلًا فقط */
const liveCats = CATEGORIES.filter(c => c.status === 'available' && PRODUCTS.some(x => x.cat === c.id));
const filters = liveCats.length > 1 ? `
    <div id="filters" class="mt-8 flex flex-wrap gap-2.5" role="group" aria-label="تصفية حسب القسم">
      <button type="button" class="chip chip-on" data-cat="all" aria-pressed="true">كل التصاميم <span class="num text-xs opacity-60">${PRODUCTS.length}</span></button>
      ${liveCats.map(c => `<button type="button" class="chip" data-cat="${esc(c.id)}" aria-pressed="false">${esc(c.label)} <span class="num text-xs opacity-60">${PRODUCTS.filter(x => x.cat === c.id).length}</span></button>`).join('\n      ')}
    </div>` : '';
const soonNote = soonCats.length ? `
    <div class="mt-12 rounded-2xl border border-dashed border-ink/20 px-6 py-7 text-center">
      <h2 class="text-lg">${esc(soonCats.map(c => c.label).join(' و'))} — قريبًا</h2>
      <p class="mx-auto mt-2 max-w-lg text-sm leading-7 text-ink-soft">
        تخيطها أريج فعلًا، لكن التصاميم لم تُصوَّر وتُنشر بعد.
        <a class="text-plum underline underline-offset-4" href="${esc(wa('السلام عليكم 🌸 أود الاستفسار عن ' + soonCats.map(c => c.label).join(' و') + ' المتوفرة حاليًا.'))}" target="_blank" rel="noopener">اسألي عن المتوفر حاليًا</a>.
      </p>
    </div>` : '';

written.push(write('products.html', render(readFileSync(p('src/pages/products.html'), 'utf8'), {
  ...pageCtx({ title: `التصاميم | ${BUSINESS.name}`,
    desc: 'تصفّحي تصاميم أطقم الصلاة — كل تصميم بمقاسك، والطلب عبر الواتساب.',
    path: 'products.html', active: 'products' }),
  FILTERS: filters, CARDS: PRODUCTS.map(x => card(x)).join('\n      '), SOON_NOTE: soonNote,
  WA_ASK: wa('السلام عليكم 🌸 أبحث عن تصميم معيّن، ممكن أعرف المتوفر حاليًا؟')
})));

/* المقاسات */
const designOptions = PRODUCTS.map(x =>
  `<option value="${esc(x.name + ' (' + x.code + ')')}" data-cat="${esc(x.cat)}">${esc(x.name)} (${esc(x.code)})</option>`).join('\n              ');
written.push(write('sizes.html', render(readFileSync(p('src/pages/sizes.html'), 'utf8'), {
  ...pageCtx({ title: `المقاسات وطريقة الطلب | ${BUSINESS.name}`,
    desc: 'كيف تأخذين مقاس جسمك والطول الذي تحبينه للقطعة، وترسلينها لأريج برسالة واتساب مرتّبة.',
    path: 'sizes.html', active: 'sizes' }),
  DESIGN_OPTIONS: designOptions,
  DIAGRAM_CHEST: DIAGRAMS.chest, DIAGRAM_HEAD: DIAGRAMS.head,
  DIAGRAM_LENGTH: DIAGRAMS.length, DIAGRAM_SLEEVE: DIAGRAMS.sleeve
})));

/* صفحة لكل تصميم */
const MEAS_LABEL = { length: 'الطول الكلي للقطعة', chest: 'محيط الصدر',
                     sleeve: 'طول الكم', head: 'محيط الرأس' };
const tpl = readFileSync(p('src/templates/product.html'), 'utf8');

for (const prod of PRODUCTS) {
  const sold = prod.availability === 'sold_out';
  const av = AVAIL[prod.availability];
  const many = prod.images.length > 1;

  const gallery = `<div class="overflow-hidden rounded-[1.5rem] bg-deep">
      <button type="button" class="js-zoom tap block w-full" data-file="${esc(prod.images[0].file)}" data-alt="${esc(prod.images[0].alt)}"
              aria-label="تكبير صورة ${esc(prod.name)}">
        ${picture(prod.images[0], { prefix: '../../', sizes: '(min-width:1024px) 520px, 92vw', eager: true, w: 1000, h: 1250, cls: 'w-full object-cover' })}
      </button>
    </div>
    <p class="mt-3 flex items-center justify-center gap-1.5 text-xs text-ink-mute">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5M11 8v6M8 11h6"/></svg>
      اضغطي على الصورة لتكبيرها
    </p>` + (many ? `
    <ul class="mt-4 grid grid-cols-4 gap-3">
      ${prod.images.map(im => `<li><button type="button" class="js-zoom tap block w-full overflow-hidden rounded-xl bg-deep" data-file="${esc(im.file)}" data-alt="${esc(im.alt)}" aria-label="تكبير: ${esc(im.alt)}">
        ${picture(im, { prefix: '../../', sizes: '110px', cls: 'aspect-[4/5] w-full object-cover' })}</button></li>`).join('\n      ')}
    </ul>` : '');

  const specRows = [
    ['القماش', prod.fabric], ['القطع المشمولة', (prod.included || []).join(' + ') || null],
    ['العناية', prod.care], ['التفصيل حسب الطلب', prod.customization],
    ['مدة التنفيذ', prod.productionDays ? `${prod.productionDays.min}–${prod.productionDays.max} أيام`
      : (BUSINESS.productionDays ? `${BUSINESS.productionDays.min}–${BUSINESS.productionDays.max} أيام` : null)]
  ].filter(([, v]) => v);
  const specs = (prod.details || []).length || specRows.length ? `<dl class="mt-7 divide-y divide-ink/10 border-y border-ink/10">
      ${(prod.details || []).length ? `<div class="flex gap-4 py-3"><dt class="w-32 shrink-0 text-sm text-ink-mute">التفاصيل</dt><dd class="text-sm leading-7">${esc(prod.details.join(' · '))}</dd></div>` : ''}
      ${specRows.map(([k, v]) => `<div class="flex gap-4 py-3"><dt class="w-32 shrink-0 text-sm text-ink-mute">${esc(k)}</dt><dd class="text-sm leading-7">${esc(v)}</dd></div>`).join('\n      ')}
    </dl>` : '';

  const colors = (prod.colors || []).length ? `<div class="mt-7">
      <h2 class="text-sm font-medium text-ink-mute">ألوان القطعة في الصورة</h2>
      <ul class="mt-3 flex flex-wrap gap-3">
        ${prod.colors.map(c => `<li class="flex items-center gap-2 text-sm text-ink-soft"><span class="h-5 w-5 rounded-full ring-1 ring-ink/20" style="background:${esc(c.hex)}"></span>${esc(c.name)}</li>`).join('\n        ')}
      </ul>
      <p class="mt-2 text-xs leading-6 text-ink-mute">وصف لألوان القطعة المصوَّرة — وليست خيارات ألوان للطلب. اسألي أريج عن المتوفر.</p>
    </div>` : '';

  const cta = sold
    ? `<a href="${esc(wa(altMsg(prod)))}" class="btn-plum" target="_blank" rel="noopener">اسألي عن بديل مشابه</a>`
    : `<a href="${esc(wa(orderMsg(prod)))}" class="btn-wa" target="_blank" rel="noopener">اطلبي هذا التصميم عبر واتساب</a>`;

  const meas = (D.MEASUREMENTS_BY_CAT[prod.cat] || []).map(m =>
    `<li class="rounded-full bg-card px-3 py-1.5 text-sm text-ink-soft">${esc(MEAS_LABEL[m])}</li>`).join('\n        ');

  const related = PRODUCTS.filter(x => x.code !== prod.code).slice(0, 3)
    .map(x => card(x, '../../')).join('\n      ');

  const html = render(tpl, {
    ...pageCtx({ title: `${prod.name} (${prod.code}) | ${BUSINESS.name}`,
      desc: prod.desc, path: productUrl(prod.code), active: 'products', prefix: '../../',
      ogImage: 'assets/images/products/' + prod.images[0].file + '.jpg' }),
    OG_TYPE: 'article',
    PRODUCT_NAME: prod.name, PRODUCT_CODE: prod.code, PRODUCT_DESC: prod.desc,
    AVAIL_LABEL: av.label, AVAIL_TONE: av.tone,
    PRICE_TEXT: priceText(prod), PRICE_CLASS: prod.price ? 'font-medium text-plum' : 'text-ink-mute',
    GALLERY: gallery, SPECS: specs, COLORS: colors, CTA: cta,
    MEASUREMENTS: meas, RELATED: related
  }).replace(/href="(index|products|sizes)\.html/g, 'href="../../$1.html');

  written.push(write(productUrl(prod.code) + 'index.html', html));
}

/* sitemap + robots — الروابط المطلقة تحتاج نطاقًا مؤكّدًا */
if (ORIGIN) {
  const urls = ['index.html', 'products.html', 'sizes.html', ...PRODUCTS.map(x => productUrl(x.code))];
  written.push(write('sitemap.xml',
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemap.org/schemas/sitemap/0.9">\n`
      .replace('www.sitemap.org', 'www.sitemaps.org') +
    urls.map(u => `  <url><loc>${abs(u).replace(/index\.html$/, '')}</loc></url>`).join('\n') +
    `\n</urlset>\n`));
  written.push(write('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${abs('sitemap.xml')}\n`));
} else {
  written.push(write('robots.txt', 'User-agent: *\nAllow: /\n'));
  console.log('ℹ️  لم يُنشأ sitemap.xml — اضبطي domain في data/business.js أولًا.');
}

console.log(`✓ كُتبت ${written.length} ملفات:\n  ${written.join('\n  ')}`);
if (missingFulfilment) console.log('\nℹ️  معلومات لم تُؤكَّد بعد، والموقع يُخفيها بدل اختراعها. راجعي README.');
