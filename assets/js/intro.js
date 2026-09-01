/* ═══════════════════════════════════════════════════════════════════════════
   مقدّمة الموقع — أريج شاولي للخياطة

   قصّة قصيرة في خمس لقطات: قماش ← غرزة ← طيّ ← العلامة ← الصفحة.

   مبنية على canvas ثنائي الأبعاد بدون أي مكتبة خارجية — راجعي
   docs/identity-contract.md §8 لسبب اختيار هذا المسار بدل WebGL.
   طبقة الرسم معزولة في createClothRenderer، فتبديلها لا يمسّ بقية الملف.

   قواعد ملزمة (من العقد):
   • المقدّمة طبقة فوق الصفحة — الصفحة موجودة كاملة تحتها من أول لحظة.
   • آخر لقطة = واجهة الصفحة نفسها. لا انتقال ولا قفزة.
   • تُتخطّى في أي لحظة، ولا تظهر لمن فضّل تقليل الحركة أو زارها في نفس الجلسة.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var root = document.documentElement;
  var mode = root.getAttribute('data-intro');          // 'on' | 'static' | null
  if (!mode) return;                                   // القرار اتُّخذ في <head>

  window.__introBooted = true;
  clearTimeout(window.__introWatchdog);

  /* ألوان العقد — نفس قيم tailwind.config.js حرفيًا */
  var C = {
    page:  '#EFE6DA',
    card:  '#F8F3EC',
    deep:  '#E4D9C9',
    cloth: '#F1DCD3',   // blush — قماش AS-01 الحقيقي
    plum:  '#6B4B5E',
    ink:   '#2E2A28'
  };

  /* توقيت اللقطات (مللي ثانية) */
  /* اللقطات: تُسرَّع البدايات ليبقى وقت حقيقي للعلامة قبل الخروج.
     بين reveal و out فترة ثبات ~700ms — لحظة العلامة تحتاج أن تُرى فعلًا. */
  var BEAT = {
    material: [   0,  900 ],
    craft:    [ 800, 2100 ],
    fold:     [1950, 3100 ],
    reveal:   [3000, 3700 ],
    out:      [4400, 4950 ]
  };
  var TOTAL = BEAT.out[1];

  var prefersReduced = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── بناء الطبقة ──────────────────────────────────────────────────────── */
  var overlay = document.createElement('div');
  overlay.id = 'intro';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'مقدّمة قصيرة عن أريج شاولي للخياطة');

  var canvas = null;
  if (mode === 'on') {
    canvas = document.createElement('canvas');
    canvas.id = 'intro-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    overlay.appendChild(canvas);
  }

  /* لحظة العلامة: الشعار صغير عمدًا — الملف المتوفر ١٩٢ بكسل فقط
     وتكبيره على كامل الشاشة يظهره مهترئًا (راجعي العقد §9). */
  var brand = document.createElement('div');
  brand.id = 'intro-brand';
  brand.innerHTML =
    '<img src="assets/images/brand/logo.png" alt="" width="88" height="88" id="intro-logo">' +
    '<p id="intro-name">أريج شاولي<span>للخياطة</span></p>';
  overlay.appendChild(brand);

  var skip = document.createElement('button');
  skip.type = 'button';
  skip.id = 'intro-skip';
  skip.textContent = 'تخطّي المقدّمة';
  overlay.appendChild(skip);

  /* نص بديل لقارئات الشاشة — التجربة مفهومة بلا رؤية الحركة */
  var sr = document.createElement('p');
  sr.className = 'sr-only';
  sr.textContent = 'مقدّمة قصيرة: قماش يتحوّل إلى قطعة مخيطة. تخطّيها للانتقال إلى الموقع.';
  overlay.appendChild(sr);

  document.body.appendChild(overlay);
  var scrollLocked = document.body.style.overflow;
  document.body.style.overflow = 'hidden';

  var lastFocus = document.activeElement;
  skip.focus();

  /* ── طبقة الرسم (قابلة للاستبدال) ─────────────────────────────────────── */
  function createClothRenderer(cv) {
    var ctx = cv.getContext && cv.getContext('2d');
    if (!ctx) return null;                             // canvas غير مدعوم

    var w = 0, h = 0, dpr = 1, tier = null;

    /* لكل حجم شاشة مشهد خاص، لا تصغير للمشهد نفسه:
       الجوال يحصل على طيّ أبسط (موجة واحدة، أعمدة أعرض، تجميع أقل)
       بنفس القصّة وبكلفة رسم أقل. */
    function tierFor(width) {
      if (width < 640)  return { step: 6, dpr: 1.5,  gather: 0.12, amp: 20, harmonic: false };
      if (width < 1024) return { step: 4, dpr: 1.75, gather: 0.20, amp: 24, harmonic: true  };
      return              { step: 3, dpr: 2,    gather: 0.26, amp: 26, harmonic: true  };
    }

    function resize() {
      w = cv.clientWidth; h = cv.clientHeight;
      tier = tierFor(w);
      dpr = Math.min(window.devicePixelRatio || 1, tier.dpr);
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    /* تظليل بسيط: كل عمود يُضاء حسب ميل الطيّة، فيقرأ كقماش معلّق */
    function shade(base, amount) {
      var r = parseInt(base.slice(1, 3), 16),
          g = parseInt(base.slice(3, 5), 16),
          b = parseInt(base.slice(5, 7), 16);
      var f = function (v) { return Math.max(0, Math.min(255, Math.round(v + amount))); };
      return 'rgb(' + f(r) + ',' + f(g) + ',' + f(b) + ')';
    }

    /* ١. القماش: طيّات رأسية تتموّج ببطء */
    function drawCloth(t, gather, alpha) {
      var step = tier.step;
      var freq = 0.010 + gather * 0.022;               // الطيّ يقارب الطيّات
      var amp  = tier.amp * (1 - gather * 0.55);
      var inset = gather * w * tier.gather;            // القماش يتجمّع نحو المنتصف
      ctx.globalAlpha = alpha;
      for (var x = inset; x < w - inset; x += step) {
        var phase = x * freq + t * 0.0011;
        var fold  = Math.sin(phase) + (tier.harmonic ? 0.45 * Math.sin(phase * 2.3 + 1.1) : 0);
        var slope = Math.cos(phase);
        ctx.fillStyle = shade(C.cloth, slope * 15 - Math.abs(fold) * 6);
        var top = h * 0.06 + fold * amp * 0.35;
        ctx.fillRect(x, top, step + 1, h - top - h * 0.05 + fold * amp * 0.25);
      }
      ctx.globalAlpha = 1;
    }

    /* ٢. الغرزة: تُرسم غرزة بعد غرزة — نفس دافع .stitch في الموقع.
       تبقى دائمًا داخل حدود القماش، وتختفي تمامًا مع بداية الطيّ حتى لا
       تُترك غرزات معلّقة على الخلفية. */
    function drawStitch(p, gather, alpha) {
      var vis = alpha * Math.pow(1 - gather, 2);
      if (p <= 0 || vis <= 0.01) return;
      var inset = gather * w * tier.gather;
      var left = inset + (w - inset * 2) * 0.10;
      var right = w - inset - (w - inset * 2) * 0.10;
      var total = Math.round((right - left) / 26) + 4;
      var shown = Math.floor(total * p);
      ctx.strokeStyle = C.plum;
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.globalAlpha = 0.75 * vis;
      for (var i = 0; i < shown; i++) {
        var f = i / total;
        var x = left + f * (right - left);
        var y = h * 0.56 - Math.sin(f * Math.PI) * h * 0.10;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(Math.min(x + 13, right), y - 2.5);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    return {
      resize: resize,
      frame: function (elapsed) {
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = C.page;
        ctx.fillRect(0, 0, w, h);

        var gather = ease(span(elapsed, BEAT.fold));
        var fade   = 1 - ease(span(elapsed, BEAT.out));
        drawCloth(elapsed, gather, fade);
        drawStitch(ease(span(elapsed, BEAT.craft)), gather, fade);
      },
      destroy: function () {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, cv.width, cv.height);
        cv.width = cv.height = 0;                      // يحرّر ذاكرة اللوحة
      }
    };
  }

  function span(t, beat) {
    return Math.max(0, Math.min(1, (t - beat[0]) / (beat[1] - beat[0])));
  }
  function ease(p) { return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; }

  /* ── التشغيل ──────────────────────────────────────────────────────────── */
  var renderer = canvas ? createClothRenderer(canvas) : null;
  var raf = 0, started = 0, paused = 0, finished = false;

  if (canvas && !renderer) {                           // canvas غير مدعوم
    canvas.remove();
    canvas = null;
    mode = 'static';
    overlay.setAttribute('data-mode', 'static');
  }

  /* الشعار قد لا يُحمَّل — الاسم النصّي وحده يكفي للحظة العلامة */
  var logo = document.getElementById('intro-logo');
  logo.addEventListener('error', function () { logo.style.display = 'none'; }, { once: true });

  function onResize() { if (renderer) renderer.resize(); }
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); finish(); return; }
    if (e.key !== 'Tab') return;
    e.preventDefault();                                // الطبقة فيها زر واحد
    skip.focus();
  }
  function onVisibility() {
    if (document.hidden) {
      if (raf) { cancelAnimationFrame(raf); raf = 0; paused = performance.now(); }
    } else if (!finished && !raf) {
      if (paused) { started += performance.now() - paused; paused = 0; }
      raf = requestAnimationFrame(tick);
    }
  }

  function tick(now) {
    if (!started) started = now;
    var t = now - started;

    if (renderer) renderer.frame(t);

    var revealP = span(t, BEAT.reveal);
    overlay.style.setProperty('--reveal', ease(revealP).toFixed(3));
    if (t >= BEAT.out[0]) overlay.classList.add('is-leaving');

    if (t >= TOTAL) { finish(); return; }
    raf = requestAnimationFrame(tick);
  }

  /* ── الإنهاء والتنظيف ─────────────────────────────────────────────────── */
  function finish() {
    if (finished) return;
    finished = true;

    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    window.removeEventListener('resize', onResize);
    window.removeEventListener('orientationchange', onResize);
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('visibilitychange', onVisibility);
    skip.removeEventListener('click', finish);

    try { sessionStorage.setItem('areej:intro', '1'); } catch (e) {}

    overlay.classList.add('is-done');
    var remove = function () {
      if (renderer) { renderer.destroy(); renderer = null; }
      if (canvas) { canvas.remove(); canvas = null; }
      overlay.remove();
      root.removeAttribute('data-intro');
      document.body.style.overflow = scrollLocked;

      /* التركيز ينتقل إلى بداية المحتوى، لا يضيع */
      var main = document.getElementById('main');
      if (main && (!lastFocus || lastFocus === document.body || lastFocus === skip)) {
        main.setAttribute('tabindex', '-1');
        main.focus({ preventScroll: true });
        main.removeAttribute('tabindex');
      } else if (lastFocus && lastFocus.focus) {
        lastFocus.focus({ preventScroll: true });
      }
    };
    if (prefersReduced) remove();
    else setTimeout(remove, 420);                      // مدّة تلاشي الطبقة
  }

  skip.addEventListener('click', finish);
  document.addEventListener('keydown', onKey);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('resize', onResize, { passive: true });
  window.addEventListener('orientationchange', onResize, { passive: true });

  if (mode === 'static') {
    /* الأجهزة الضعيفة: انتقال هادئ بالعلامة فقط، بلا رسم ولا حلقة */
    overlay.classList.add('is-static');
    overlay.style.setProperty('--reveal', '1');
    setTimeout(finish, 900);
  } else {
    renderer.resize();
    raf = requestAnimationFrame(tick);
  }
})();
