#!/usr/bin/env node
/* يبني نسخة معاينة من ملف واحد (preview.html) من الصفحات المبنية نفسها،
   لعرضها على العميلة برابط واحد قبل شراء النطاق.
   ليست بديلًا عن الموقع — نفس التصميم ونفس البيانات، لكن بتوجيه داخلي بالهاش. */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const p = (...s) => join(ROOT, ...s);
const read = f => readFileSync(p(f), 'utf8');

const grab = (html, tag) => {
  const m = html.match(new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)</' + tag + '>'));
  return m ? m[0] : '';
};
const inner = (html, tag) => {
  const m = html.match(new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)</' + tag + '>'));
  return m ? m[1] : '';
};

/* ── الصور: تُدمج كـ data URI بحجم -sm (٥٠٠ بكسل) — يكفي للمعاينة ─────── */
const dataUri = {};
for (const f of readdirSync(p('assets/images/products')))
  if (f.endsWith('-sm.webp'))
    dataUri['assets/images/products/' + f.replace('-sm.webp', '')] =
      'data:image/webp;base64,' + readFileSync(p('assets/images/products', f)).toString('base64');
const logoUri = 'data:image/webp;base64,' +
  readFileSync(p('assets/images/brand/logo.webp')).toString('base64');

/* <picture> يُبسَّط إلى <img> واحدة بمصدر مدمج */
function inlineImages(html) {
  return html
    .replace(/<picture>[\s\S]*?<img([^>]*?)>[\s\S]*?<\/picture>/g, (m, attrs) => {
      const src = (attrs.match(/src="([^"]+)"/) || [])[1] || '';
      const key = src.replace(/^(\.\.\/)+/, '').replace(/-sm\.jpg$|\.jpg$/, '');
      // an src that is already a data: URI (the lightbox placeholder) stays as-is
      if (src.startsWith('data:')) return '<img' + attrs.replace(/\ssrcset="[^"]*"/g, '')
                                                        .replace(/\ssizes="[^"]*"/g, '') + '>';
      const uri = dataUri[key] || (src.includes('logo') ? logoUri : '');
      return '<img' + attrs.replace(/src="[^"]*"/, 'src="' + uri + '"')
                           .replace(/\ssrcset="[^"]*"/g, '')
                           .replace(/\ssizes="[^"]*"/g, '') + '>';
    })
    .replace(/<img([^>]*?)src="[^"]*logo\.png"([^>]*?)>/g, '<img$1src="' + logoUri + '"$2>');
}

/* الروابط الداخلية تصبح مسارات هاش */
function routeLinks(html) {
  return html
    .replace(/href="(?:\.\.\/\.\.\/)?index\.html#about"/g, 'href="#/about"')
    .replace(/href="(?:\.\.\/\.\.\/)?index\.html"/g, 'href="#/"')
    .replace(/href="(?:\.\.\/\.\.\/)?products\.html"/g, 'href="#/products"')
    .replace(/href="(?:\.\.\/\.\.\/)?sizes\.html"/g, 'href="#/sizes"')
    .replace(/href="(?:\.\.\/\.\.\/)?product\/([a-z0-9-]+)\/"/g, 'href="#/product/$1"');
}

function inlineZoomTargets(html) {
  return html.replace(/data-file="([^"]+)"/g, (m, file) => {
    const uri = dataUri['assets/images/products/' + file];
    return uri ? 'data-file="' + uri + '"' : m;
  });
}
const prep = html => routeLinks(inlineZoomTargets(inlineImages(html)));

const pages = [
  ['/',         'index.html'],
  ['/products', 'products.html'],
  ['/sizes',    'sizes.html']
];
for (const dir of readdirSync(p('product')))
  pages.push(['/product/' + dir, 'product/' + dir + '/index.html']);

const home = read('index.html');
const header = prep(grab(home, 'header'));
const footer = prep(grab(home, 'footer'));
const lightbox = prep((home.match(/<div id="lightbox"[\s\S]*?<\/div>\s*<\/div>/) || [''])[0]);
const floatWa = prep((home.match(/<a href="[^"]*" id="float-wa"[\s\S]*?<\/a>/) || [''])[0]);

const routes = pages.map(([route, file]) =>
  `<div class="route" data-route="${route}" hidden>${prep(inner(read(file), 'main'))}</div>`
).join('\n');

const css = read('assets/css/site.css');
const siteJs = read('assets/js/site.js');
const introJs = read('assets/js/intro.js');
const business = read('data/business.js');
const products = read('data/products.js');

const out = `<title>أريج شاولي للخياطة</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Tajawal:wght@300;400;500;700&display=swap" rel="stylesheet">
<style>
${css}
.route[hidden]{display:none!important}
#preview-note{position:fixed;inset-block-end:0;inset-inline:0;z-index:70;
  background:#523A48;color:#FAF7F3;font:400 12px/1.6 Tajawal,system-ui,sans-serif;
  text-align:center;padding:.5rem .75rem}
#preview-note b{font-weight:700}
body{padding-block-end:2.6rem}
</style>

<script>document.documentElement.setAttribute('dir','rtl');document.documentElement.setAttribute('lang','ar');</script>

<div dir="rtl" lang="ar">
${header}
<main id="main">
${routes}
</main>
${footer}
${floatWa}
${lightbox}
<p id="preview-note"><b>نسخة معاينة</b> — التصميم النهائي. الأسعار ومدة التنفيذ والتوصيل لم تُضَف بعد لأنها تحتاج تأكيدك.</p>
</div>

<script>window.INTRO_LOGO='${logoUri}';<\/script>\n<script>${business}<\/script>
<script>${products}<\/script>
<script>
/* موجّه داخلي بالهاش — بديل عن ملفات منفصلة داخل معاينة من ملف واحد */
(function(){
  var routes = Array.prototype.slice.call(document.querySelectorAll('.route'));
  function show(){
    var h = (location.hash || '#/').replace(/^#/,'');
    var about = h === '/about';
    if (about) h = '/';
    var found = false;
    routes.forEach(function(r){
      var on = r.dataset.route === h;
      r.hidden = !on;
      if (on) found = true;
    });
    if (!found) { routes[0].hidden = false; }
    document.querySelectorAll('.navlink').forEach(function(a){
      var on = a.getAttribute('href') === '#' + (h === '/' ? '/' : h);
      a.classList.toggle('is-current', on);
      if (on) a.setAttribute('aria-current','page'); else a.removeAttribute('aria-current');
    });
    if (about) { var s = document.getElementById('about'); if (s) { s.scrollIntoView(); return; } }
    window.scrollTo(0,0);
  }
  addEventListener('hashchange', show);
  show();
})();
<\/script>
<script>${siteJs}<\/script>
<script>
/* المقدّمة: في المعاينة نتجاهل شرط الهاش، لأن التوجيه نفسه يستخدم الهاش */
(function(){
  try{
    var r=document.documentElement, m=window.matchMedia;
    var seen=false; try{seen=sessionStorage.getItem('areej:intro')==='1';}catch(e){}
    var reduce=m&&m('(prefers-reduced-motion: reduce)').matches;
    var weak=(navigator.hardwareConcurrency||8)<=2||(navigator.deviceMemory||8)<=1;
    if(!reduce && !seen && (location.hash==='' || location.hash==='#/')){
      r.setAttribute('data-intro', weak?'static':'on');
    }
  }catch(e){}
})();
<\/script>
<script>${introJs}<\/script>
`;

writeFileSync(p('preview.html'), out);
console.log('✓ preview.html — ' + (Buffer.byteLength(out) / 1048576).toFixed(2) + ' MB, '
  + pages.length + ' routes');
