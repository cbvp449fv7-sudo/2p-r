/* أريج شاولي للخياطة — سكربت الموقع. بدون مكتبات خارجية.
   البطاقات مبنية مسبقًا في HTML، فدور هذا الملف هو التفاعل فقط:
   التصفية، القائمة، تكبير الصور، والتحقّق من نموذج المقاسات. */
(function () {
  'use strict';

  var B = window.BUSINESS || {};
  var PRODUCTS = window.PRODUCTS || [];
  var REQUIRED = window.MEASUREMENTS_BY_CAT || {};
  var IMG = (document.body.dataset.prefix || '') + 'assets/images/products/';

  function waLink(msg) {
    return 'https://wa.me/' + B.whatsapp + '?text=' + encodeURIComponent(msg);
  }
  function on(el, ev, fn) { if (el) el.addEventListener(ev, fn); }

  /* ── تنبيه للمالكة: تصميم في البيانات لكنه غير مبني في الصفحة ─────────── */
  var grid = document.getElementById('product-grid');
  if (grid && PRODUCTS.length) {
    var inDom = new Set(Array.prototype.map.call(grid.querySelectorAll('[data-code]'), function (n) {
      return n.dataset.code;
    }));
    var missing = PRODUCTS.filter(function (p) { return !inDom.has(p.code); }).map(function (p) { return p.code; });
    if (missing.length) {
      console.warn('[أريج شاولي] هذه التصاميم موجودة في data/products.js لكنها غير مبنية في الصفحة: '
        + missing.join('، ') + '\nشغّلي الأمر:  npm run build');
      if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
        var warn = document.createElement('p');
        warn.className = 'mb-6 rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger';
        warn.textContent = 'تصاميم جديدة في الملف لم تُبنَ بعد (' + missing.join('، ')
          + '). شغّلي: npm run build';
        grid.parentNode.insertBefore(warn, grid);
      }
    }
  }

  /* ── التصفية: تُحفظ في الرابط ويُعلَن عنها لقارئات الشاشة ─────────────── */
  var filters = document.getElementById('filters');
  if (filters && grid) {
    var status = document.getElementById('filter-status');
    var empty = document.getElementById('no-results');
    var cards = Array.prototype.slice.call(grid.querySelectorAll('[data-cat]'));

    function labelOf(cat) {
      var btn = filters.querySelector('[data-cat="' + cat + '"]');
      return btn ? btn.textContent.replace(/\s*\d+\s*$/, '').trim() : cat;
    }

    function apply(cat, push) {
      var shown = 0;
      cards.forEach(function (c) {
        var match = cat === 'all' || c.dataset.cat === cat;
        c.hidden = !match;
        if (match) shown++;
      });
      filters.querySelectorAll('[data-cat]').forEach(function (b) {
        var isOn = b.dataset.cat === cat;
        b.classList.toggle('chip-on', isOn);
        b.setAttribute('aria-pressed', String(isOn));
      });
      if (empty) empty.hidden = shown !== 0;
      if (status) status.textContent = shown
        ? 'عُرض ' + shown + ' من التصاميم في قسم ' + labelOf(cat)
        : 'لا توجد تصاميم في قسم ' + labelOf(cat);

      var url = new URL(location.href);
      if (cat === 'all') url.searchParams.delete('cat'); else url.searchParams.set('cat', cat);
      if (push) history.replaceState({}, '', url);
    }

    on(filters, 'click', function (e) {
      var btn = e.target.closest('[data-cat]');
      if (btn) apply(btn.dataset.cat, true);
    });

    var start = new URLSearchParams(location.search).get('cat');
    apply(start && filters.querySelector('[data-cat="' + CSS.escape(start) + '"]') ? start : 'all', false);
  }

  /* ── قائمة الجوال: Escape، والضغط خارجها، وإعادة التركيز ──────────────── */
  var burger = document.getElementById('burger');
  var mobnav = document.getElementById('mobnav');
  if (burger && mobnav) {
    function setMenu(open) {
      mobnav.hidden = !open;
      mobnav.classList.toggle('hidden', !open);
      burger.setAttribute('aria-expanded', String(open));
      burger.setAttribute('aria-label', open ? 'إغلاق القائمة' : 'فتح القائمة');
      if (open) { var first = mobnav.querySelector('a'); if (first) first.focus(); }
    }
    var isOpen = function () { return burger.getAttribute('aria-expanded') === 'true'; };

    on(burger, 'click', function () { setMenu(!isOpen()); });
    on(mobnav, 'click', function (e) { if (e.target.tagName === 'A') setMenu(false); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isOpen()) { setMenu(false); burger.focus(); }
    });
    document.addEventListener('click', function (e) {
      if (isOpen() && !mobnav.contains(e.target) && !burger.contains(e.target)) setMenu(false);
    });
  }

  /* ── تكبير الصورة ─────────────────────────────────────────────────────── */
  var lb = document.getElementById('lightbox');
  if (lb) {
    var lbImg = lb.querySelector('img');
    var lbSrc = lb.querySelector('source');
    var lbTitle = document.getElementById('lightbox-title');
    var opener = null;

    function openLb(btn) {
      opener = btn;
      var file = btn.dataset.file, alt = btn.dataset.alt || '';
      /* data-file is normally an image slug, but may be a full data: URL when the
         page is bundled into a single file. Tolerate a missing <source> too. */
      var isUrl = /^data:|^https?:/.test(file);
      if (lbSrc) lbSrc.srcset = isUrl ? file : IMG + file + '.webp';
      lbImg.src = isUrl ? file : IMG + file + '.jpg';
      lbImg.alt = alt;
      lbTitle.textContent = alt;
      lb.classList.remove('hidden');
      lb.classList.add('flex');
      document.body.style.overflow = 'hidden';
      lb.querySelector('[data-close]').focus();
    }
    function closeLb() {
      lb.classList.add('hidden');
      lb.classList.remove('flex');
      lbImg.removeAttribute('src');
      if (lbSrc) lbSrc.removeAttribute('srcset');
      document.body.style.overflow = '';
      if (opener) { opener.focus(); opener = null; }
    }

    document.addEventListener('click', function (e) {
      var z = e.target.closest('.js-zoom');
      if (z && z.dataset.file) { e.preventDefault(); openLb(z); return; }
      if (e.target.closest('[data-close]') || e.target === lb) closeLb();
    });
    document.addEventListener('keydown', function (e) {
      if (lb.classList.contains('hidden')) return;
      if (e.key === 'Escape') { closeLb(); return; }
      if (e.key !== 'Tab') return;
      var f = lb.querySelectorAll('button, a[href]');
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  }

  /* ── زر الواتساب العائم: ينكمش عند النزول حتى لا يغطّي الصور ──────────── */
  var floatWa = document.getElementById('float-wa');
  if (floatWa && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    var lastY = 0;
    addEventListener('scroll', function () {
      var y = scrollY;
      floatWa.classList.toggle('is-compact', y > 400 && y > lastY);
      lastY = y;
    }, { passive: true });
  }

  /* ── نموذج المقاسات ───────────────────────────────────────────────────── */
  var form = document.getElementById('order-form');
  if (!form) return;

  /* NOTE: looking a field up as elements['length'] returns the collection's
     item count, not the input named "length". Always look up by name attribute. */
  function fld(name) { return form.querySelector('[name="' + name + '"]'); }

  var LABELS = {
    chest:  'محيط الصدر',
    head:   'محيط الرأس',
    length: 'الطول الكلي للقطعة',
    sleeve: 'طول الكم'
  };
  var BODY_FIELDS = ['chest', 'head'];
  var GARMENT_FIELDS = ['length', 'sleeve'];
  var NUMERIC = BODY_FIELDS.concat(GARMENT_FIELDS);

  function fieldError(name, msg) {
    var input = fld(name);
    var box = document.getElementById('err-' + name);
    if (!input || !box) return;
    if (msg) {
      box.textContent = msg;
      box.hidden = false;
      box.classList.remove('hidden');
      input.classList.add('field-error');
      input.setAttribute('aria-invalid', 'true');
    } else {
      box.textContent = '';
      box.hidden = true;
      box.classList.add('hidden');
      input.classList.remove('field-error');
      input.removeAttribute('aria-invalid');
    }
  }

  function validateField(name) {
    var input = fld(name);
    var raw = String(input.value || '').trim();
    if (!raw) { fieldError(name, ''); return true; }
    var n = Number(raw);
    var min = Number(input.min), max = Number(input.max);
    if (!Number.isFinite(n) || !Number.isInteger(n)) {
      fieldError(name, 'اكتبي رقمًا صحيحًا بالسنتيمتر.'); return false;
    }
    if (n < min || n > max) {
      fieldError(name, 'الرقم خارج النطاق المتوقّع (' + min + '–' + max + ' سم). تأكّدي من القياس.');
      return false;
    }
    fieldError(name, ''); return true;
  }

  NUMERIC.forEach(function (name) {
    var input = fld(name);
    if (input) on(input, 'blur', function () { validateField(name); });
  });

  /* تلميح: أي مقاسات يحتاجها التصميم المختار */
  var design = fld('design');
  var hint = document.getElementById('required-hint');
  function updateHint() {
    if (!hint) return;
    var opt = design.selectedOptions[0];
    var cat = opt && opt.dataset ? opt.dataset.cat : '';
    var need = REQUIRED[cat];
    hint.textContent = need && need.length
      ? 'هذا التصميم يحتاج: ' + need.map(function (k) { return LABELS[k]; }).join('، ') + '.'
      : '';
  }
  on(design, 'change', updateHint);
  updateHint();

  on(form, 'submit', function (e) {
    e.preventDefault();
    var note = document.getElementById('form-note');
    var firstBad = null;

    NUMERIC.forEach(function (name) {
      if (!validateField(name) && !firstBad) firstBad = fld(name);
    });

    /* إذا اختارت تصميمًا، نطلب المقاسات التي يحتاجها فعلًا */
    var opt = design.selectedOptions[0];
    var cat = opt && opt.dataset ? opt.dataset.cat : '';
    (REQUIRED[cat] || []).forEach(function (name) {
      var input = fld(name);
      if (input && !String(input.value || '').trim()) {
        fieldError(name, 'هذا المقاس مطلوب للتصميم الذي اخترتِه.');
        if (!firstBad) firstBad = input;
      }
    });

    var anyValue = NUMERIC.concat(['color', 'notes']).some(function (k) {
      return String((fld(k) || {}).value || '').trim();
    }) || String(design.value || '').trim();

    if (!anyValue) {
      note.textContent = 'اكتبي مقاسًا واحدًا على الأقل، أو اختاري التصميم، قبل إرسال الرسالة.';
      note.hidden = false; note.classList.remove('hidden');
      design.focus();
      return;
    }
    if (firstBad) {
      note.textContent = 'راجعي الحقول المعلَّمة بالأحمر ثم أعيدي الإرسال.';
      note.hidden = false; note.classList.remove('hidden');
      firstBad.focus();
      return;
    }
    note.hidden = true; note.classList.add('hidden');

    var lines = ['السلام عليكم 🌸', 'أرغب بطلب تفصيل على مقاسي:', ''];
    if (design.value) lines.push('• التصميم: ' + design.value, '');

    var body = BODY_FIELDS.filter(function (k) { return fld(k).value.trim(); });
    if (body.length) {
      lines.push('— مقاسات الجسم —');
      body.forEach(function (k) { lines.push('• ' + LABELS[k] + ': ' + fld(k).value.trim() + ' سم'); });
      lines.push('');
    }
    var garment = GARMENT_FIELDS.filter(function (k) { return fld(k).value.trim(); });
    if (garment.length) {
      lines.push('— مقاسات القطعة —');
      garment.forEach(function (k) { lines.push('• ' + LABELS[k] + ': ' + fld(k).value.trim() + ' سم'); });
      lines.push('');
    }
    if (fld('color').value.trim()) lines.push('• اللون المفضّل: ' + fld('color').value.trim());
    if (fld('notes').value.trim()) lines.push('• ملاحظات: ' + fld('notes').value.trim());
    lines.push('', 'جزاك الله خير 🤍');

    window.open(waLink(lines.join('\n')), '_blank', 'noopener');
  });
})();
