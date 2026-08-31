/* أريج شاولي للخياطة — سكربت الموقع (بدون أي مكتبات خارجية) */
(function () {
  'use strict';

  var B = window.BRAND || {};
  var PRODUCTS = window.PRODUCTS || [];
  var IMG = 'assets/images/products/';

  /* ── روابط واتساب ─────────────────────────────────────────────── */
  function waLink(msg) {
    return 'https://wa.me/' + B.whatsapp + '?text=' + encodeURIComponent(msg);
  }
  function productMsg(p) {
    return 'السلام عليكم 🌸\nأرغب بالاستفسار عن هذا التصميم:\n\n'
         + '• التصميم: ' + p.name + '\n'
         + '• الرمز: ' + p.code + '\n\n'
         + 'وأرغب بمعرفة السعر والمقاسات المتاحة.';
  }

  /* ── بطاقة منتج ───────────────────────────────────────────────── */
  function card(p) {
    var price = p.price ? '<span class="num font-medium text-plum">' + p.price + ' ر.س</span>'
                        : '<span class="text-ink-mute">السعر عبر الواتساب</span>';
    var badge = p.sold
      ? '<span class="absolute top-3 end-3 rounded-full bg-ink/80 px-3 py-1 text-xs text-ivory">غير متوفر حاليًا</span>'
      : '';
    var fabric = p.fabric
      ? '<p class="mt-1 text-sm text-ink-mute">القماش: ' + p.fabric + '</p>' : '';
    var chips = (p.details || []).map(function (d) {
      return '<li class="rounded-full bg-ivory-deep px-3 py-1 text-xs text-ink-soft">' + d + '</li>';
    }).join('');

    return '<article class="card group flex flex-col">'
      +   '<button type="button" class="js-zoom relative block aspect-[4/5] overflow-hidden bg-ivory-deep"'
      +           ' data-code="' + p.code + '" aria-label="تكبير صورة ' + p.name + '">'
      +     '<img src="' + IMG + p.img + '-sm.jpg"'
      +         ' srcset="' + IMG + p.img + '-sm.jpg 500w, ' + IMG + p.img + '.jpg 1000w"'
      +         ' sizes="(min-width:1024px) 360px, (min-width:640px) 45vw, 90vw"'
      +         ' alt="' + p.name + '" loading="lazy" decoding="async" width="500" height="625"'
      +         ' class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]">'
      +     badge
      +   '</button>'
      +   '<div class="flex flex-1 flex-col p-5">'
      +     '<div class="flex items-baseline justify-between gap-3">'
      +       '<h3 class="text-lg">' + p.name + '</h3>'
      +       '<span class="num shrink-0 text-xs text-ink-mute">' + p.code + '</span>'
      +     '</div>'
      +     '<p class="mt-2 text-sm leading-7 text-ink-soft">' + p.desc + '</p>'
      +     fabric
      +     '<ul class="mt-3 flex flex-wrap gap-1.5">' + chips + '</ul>'
      +     '<div class="mt-5 flex items-center justify-between gap-3 border-t border-ink/8 pt-4">'
      +       '<span class="text-sm">' + price + '</span>'
      +       '<a class="btn-wa !px-5 !py-2.5 !text-sm" href="' + waLink(productMsg(p)) + '"'
      +          ' target="_blank" rel="noopener">اطلبي هذا التصميم</a>'
      +     '</div>'
      +   '</div>'
      + '</article>';
  }

  function render(el, list) {
    if (!el) return;
    if (!list.length) {
      el.innerHTML = '<p class="col-span-full rounded-2xl border border-dashed border-ink/15 '
        + 'p-10 text-center text-ink-mute">تصاميم هذا القسم قيد التصوير — تواصلي معنا عبر '
        + '<a class="text-plum underline" href="' + waLink('السلام عليكم، أود الاستفسار عن التصاميم المتوفرة.')
        + '" target="_blank" rel="noopener">الواتساب</a> لرؤية المتوفر.</p>';
      return;
    }
    el.innerHTML = list.map(card).join('');
  }

  /* ── الشبكات ──────────────────────────────────────────────────── */
  var featured = document.getElementById('featured-grid');
  if (featured) render(featured, PRODUCTS.slice(0, 3));

  var grid = document.getElementById('product-grid');
  if (grid) {
    var filters = document.getElementById('filters');
    var current = 'all';
    var apply = function () {
      render(grid, current === 'all'
        ? PRODUCTS
        : PRODUCTS.filter(function (p) { return p.cat === current; }));
    };
    if (filters) {
      filters.innerHTML = (window.CATEGORIES || []).map(function (c) {
        var count = c.id === 'all'
          ? PRODUCTS.length
          : PRODUCTS.filter(function (p) { return p.cat === c.id; }).length;
        return '<button type="button" class="chip' + (c.id === 'all' ? ' chip-on' : '') + '"'
          + ' data-cat="' + c.id + '" aria-pressed="' + (c.id === 'all') + '">'
          + c.label + ' <span class="num text-xs opacity-60">' + count + '</span></button>';
      }).join('');
      filters.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-cat]');
        if (!btn) return;
        current = btn.dataset.cat;
        filters.querySelectorAll('[data-cat]').forEach(function (b) {
          var on = b === btn;
          b.classList.toggle('chip-on', on);
          b.setAttribute('aria-pressed', on);
        });
        apply();
      });
    }
    apply();
  }

  /* ── تكبير الصورة ─────────────────────────────────────────────── */
  var lb = document.getElementById('lightbox');
  if (lb) {
    var lbImg = lb.querySelector('img');
    var lbCap = lb.querySelector('[data-cap]');
    var lbCta = lb.querySelector('a');
    var opener = null;

    document.addEventListener('click', function (e) {
      var btn = e.target.closest('.js-zoom');
      if (btn) {
        var p = PRODUCTS.find(function (x) { return x.code === btn.dataset.code; });
        if (!p) return;
        opener = btn;
        lbImg.src = IMG + p.img + '.jpg';
        lbImg.alt = p.name;
        lbCap.textContent = p.name + ' — ' + p.code;
        lbCta.href = waLink(productMsg(p));
        lb.classList.remove('hidden');
        lb.classList.add('flex');
        document.body.style.overflow = 'hidden';
        lb.querySelector('[data-close]').focus();
        return;
      }
      if (e.target.closest('[data-close]') || e.target === lb) close();
    });

    function close() {
      lb.classList.add('hidden');
      lb.classList.remove('flex');
      lbImg.removeAttribute('src');
      document.body.style.overflow = '';
      if (opener) { opener.focus(); opener = null; }
    }
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !lb.classList.contains('hidden')) close();
    });
  }

  /* ── قائمة الجوال ─────────────────────────────────────────────── */
  var burger = document.getElementById('burger');
  var mobnav = document.getElementById('mobnav');
  if (burger && mobnav) {
    burger.addEventListener('click', function () {
      var open = mobnav.classList.toggle('hidden');
      burger.setAttribute('aria-expanded', String(!open));
    });
    mobnav.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') {
        mobnav.classList.add('hidden');
        burger.setAttribute('aria-expanded', 'false');
      }
    });
  }

  /* ── نموذج المقاسات: يبني رسالة واتساب جاهزة ──────────────────── */
  var form = document.getElementById('order-form');
  if (form) {
    var sel = form.querySelector('[name=design]');
    if (sel) {
      sel.innerHTML = '<option value="">— لم أحدّد بعد —</option>'
        + PRODUCTS.map(function (p) {
            return '<option value="' + p.name + ' (' + p.code + ')">' + p.name + ' (' + p.code + ')</option>';
          }).join('');
    }
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var d = new FormData(form);
      var rows = [
        ['التصميم',        d.get('design')],
        ['الطول الكلي',    d.get('length')],
        ['محيط الصدر',     d.get('chest')],
        ['طول الكم',       d.get('sleeve')],
        ['محيط الرأس',     d.get('head')],
        ['اللون المفضّل',  d.get('color')],
        ['ملاحظات',        d.get('notes')]
      ].filter(function (r) { return r[1] && String(r[1]).trim(); });

      var msg = 'السلام عليكم 🌸\nأرغب بطلب تفصيل على مقاسي:\n\n'
              + rows.map(function (r) { return '• ' + r[0] + ': ' + String(r[1]).trim(); }).join('\n')
              + '\n\nجزاك الله خير 🤍';
      window.open(waLink(msg), '_blank', 'noopener');
    });
  }

  /* ── تعبئة روابط التواصل من ملف البيانات ──────────────────────── */
  document.querySelectorAll('[data-wa]').forEach(function (a) {
    a.href = waLink(a.dataset.wa || 'السلام عليكم، أود الاستفسار عن أطقم الصلاة.');
  });
  document.querySelectorAll('[data-ig]').forEach(function (a) {
    a.href = 'https://instagram.com/' + B.instagram;
  });
  document.querySelectorAll('[data-maroof]').forEach(function (a) { a.href = B.maroof; });
  document.querySelectorAll('[data-yt]').forEach(function (a) {
    if (B.youtube) a.href = B.youtube; else a.remove();
  });

  var year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();
})();
