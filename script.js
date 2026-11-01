/* AI Talk & Share 2026 — cinematic keynote controller (no dependencies)
 *
 * Reveal engine
 *   [data-step="k"]      shown when slide step >= k   (.on)
 *   [data-focus] > [data-step]   newest shown child gets .cur
 *   [data-dim]           gets .past once a later step is shown
 *   [data-pick-group]    buttons [data-pick] ↔ panels [data-panel]
 *       data-pick-steps="1"    step n selects pick n (picks are part of the step sequence)
 *       data-pick-steps="0"    step n selects pick n, starting at pick 0
 *       data-pick-steps="none" click-only, not part of the step sequence
 *   Next: reveal next step → when complete, next slide.  Prev: hide last step → previous slide (fully revealed).
 */
(function () {
  'use strict';

  var W = 1920, H = 1080, NOTES_RATIO = 0.3;
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var stage = document.getElementById('stage');
  var viewport = document.getElementById('viewport');
  var slides = Array.prototype.slice.call(stage.querySelectorAll('.slide'));
  var total = slides.length;
  var mainCount = slides.filter(function (s) { return !s.hasAttribute('data-appendix'); }).length;  // appendix slides sit after the closing slide
  var $ = function (id) { return document.getElementById(id); };
  var counter = $('counter'), fill = $('progressFill'), dots = $('stepDots');
  var notesPanel = $('notesPanel'), npBody = $('npBody'), npTitle = $('npTitle'), npTime = $('npTime'), npStep = $('npStep');
  var helpOv = $('helpOverlay'), refsOv = $('refsOverlay'), toast = $('toast'), btnNotes = $('btnNotes');

  var current = 0, step = 0, notesOn = false;

  /* ---------- Per-slide model ---------- */
  var model = slides.map(function (slide) {
    slide.querySelectorAll('.r').forEach(function (el, i) { el.style.setProperty('--d', i); });
    var stepEls = Array.prototype.slice.call(slide.querySelectorAll('[data-step]'));
    var max = 0;
    stepEls.forEach(function (el) { max = Math.max(max, +el.getAttribute('data-step')); });
    var groups = Array.prototype.slice.call(slide.querySelectorAll('[data-pick-group]')).map(function (g) {
      var mode = g.getAttribute('data-pick-steps');
      var picks = Array.prototype.slice.call(g.querySelectorAll('[data-pick]'));
      var panels = Array.prototype.slice.call(g.querySelectorAll('[data-panel]'));
      var maxPick = 0;
      picks.forEach(function (p) { maxPick = Math.max(maxPick, +p.getAttribute('data-pick')); });
      if (mode === '1' || mode === '0') max = Math.max(max, maxPick);
      var grp = { el: g, mode: mode, picks: picks, panels: panels, sel: null };
      picks.forEach(function (p) {
        p.addEventListener('click', function (e) {
          e.stopPropagation();
          var k = +p.getAttribute('data-pick');
          if (grp.mode === 'none') { select(grp, k); return; }
          setStep(k);               // clicking a stepped pick jumps the reveal sequence to it
        });
      });
      // initial selection for click-only groups
      if (mode === 'none') select(grp, 0, true);
      return grp;
    });
    return { el: slide, steps: stepEls, max: max, groups: groups,
             dim: Array.prototype.slice.call(slide.querySelectorAll('[data-dim]')),
             focus: Array.prototype.slice.call(slide.querySelectorAll('[data-focus]')) };
  });

  function select(grp, k, silent) {
    if (grp.sel === k) return;
    grp.sel = k;
    grp.el.setAttribute('data-sel', k);
    grp.picks.forEach(function (p) {
      var on = +p.getAttribute('data-pick') === k;
      p.classList.toggle('sel', on);
      p.setAttribute('aria-pressed', String(on));
    });
    grp.panels.forEach(function (p) {
      var on = +p.getAttribute('data-panel') === k;
      p.hidden = !on;
      p.classList.remove('show');
      if (on && !silent) { void p.offsetWidth; p.classList.add('show'); }
      if (on && silent) p.classList.add('show');
    });
    // flow nodes: index for staggered packet animation
    grp.el.querySelectorAll('[data-panel]:not([hidden]) .flow').forEach(function (f) {
      var n = 0, a = 0;
      Array.prototype.forEach.call(f.children, function (c) {
        if (c.classList.contains('fn')) c.style.setProperty('--i', n++);
        if (c.classList.contains('fa')) c.style.setProperty('--i', a++);
      });
    });
  }

  /* ---------- Apply step state ---------- */
  function apply(fromEnter) {
    var m = model[current], s = m.el;
    s.setAttribute('data-at', step);
    var shownCount = 0;
    m.steps.forEach(function (el) {
      var k = +el.getAttribute('data-step');
      var on = k <= step;
      el.classList.toggle('on', on);
      // stagger only for items that appear with the slide entrance
      el.classList.toggle('enter', !!fromEnter && k === 0);
      if (on && k === 0) el.style.setProperty('--d', shownCount++);
    });
    m.dim.forEach(function (el) {
      var k = el.hasAttribute('data-step') ? +el.getAttribute('data-step') : 0;
      el.classList.toggle('past', step > k);
    });
    m.focus.forEach(function (f) {
      var kids = Array.prototype.slice.call(f.querySelectorAll(':scope > [data-step]'));
      var best = -1;
      kids.forEach(function (el) { var k = +el.getAttribute('data-step'); if (k <= step) best = Math.max(best, k); });
      kids.forEach(function (el) { el.classList.toggle('cur', +el.getAttribute('data-step') === best); });
    });
    m.groups.forEach(function (g) {
      if (g.mode === 'none') return;
      var maxPick = g.picks.length - 1 + (g.mode === '1' ? 1 : 0);
      var k = Math.min(step, maxPick);
      select(g, k, false);
    });
    // stepped reveals of SVG rings use .on as well (handled by CSS)
    renderChrome();
    renderNotes();
    net.target(s);
  }

  function renderChrome() {
    var m = model[current];
    var appx = m.el.hasAttribute('data-appendix');
    counter.textContent = appx ? 'เสริม A' + (current - mainCount + 1) : pad(current + 1) + ' / ' + pad(mainCount);
    fill.style.width = (appx ? 100 : (current + (m.max ? step / (m.max + 1) : 0) + 1) / mainCount * 100) + '%';
    var html = '';
    for (var i = 0; i <= m.max && m.max > 0; i++) html += '<i' + (i <= step ? ' class="on"' : '') + '></i>';
    dots.innerHTML = html;
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  /* ---------- Scaling (safe-area aware) ---------- */
  // Size comes from the visible window (visualViewport on iPad Safari, which tracks the
  // browser bars), minus safe-area insets and the notes panel. We do NOT measure the
  // .viewport box: its bottom edge is animated and env()-dependent, so it can be stale.
  function px(v) { return parseFloat(v) || 0; }
  function fit() {
    var vv = window.visualViewport;
    var winW = vv ? vv.width * (vv.scale || 1) : window.innerWidth;
    var winH = vv ? vv.height * (vv.scale || 1) : window.innerHeight;
    winW = Math.min(winW, document.documentElement.clientWidth || winW);
    winH = Math.min(winH, document.documentElement.clientHeight || winH);
    var nh = notesOn ? Math.round(winH * NOTES_RATIO) : 0;
    document.documentElement.style.setProperty('--notes-h', nh + 'px');
    var cs = getComputedStyle(viewport);
    var sab = px(getComputedStyle(notesPanel).paddingBottom);           // = env(safe-area-inset-bottom)
    var vw = winW - px(cs.left) - px(cs.right);
    var vh = winH - px(cs.top) - nh - sab;
    if (!(vw > 0 && vh > 0)) { vw = window.innerWidth; vh = window.innerHeight - nh; }
    var sc = Math.min(vw / W, vh / H);
    // explicit pixel offsets + scale from the top-left corner (no percentage translate)
    stage.style.left = Math.round((vw - W * sc) / 2) + 'px';
    stage.style.top = Math.round((vh - H * sc) / 2) + 'px';
    stage.style.transform = 'scale(' + sc + ')';
  }
  var fitQueued = false;
  function queueFit() { if (fitQueued) return; fitQueued = true; requestAnimationFrame(function () { fitQueued = false; fit(); }); }
  window.addEventListener('resize', queueFit);
  window.addEventListener('orientationchange', function () { queueFit(); setTimeout(fit, 300); setTimeout(fit, 800); });
  window.addEventListener('pageshow', fit);
  window.addEventListener('load', fit);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', queueFit);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);

  /* ---------- Navigation ---------- */
  function go(i, toEnd) {
    i = Math.max(0, Math.min(total - 1, i));
    slides.forEach(function (s, k) {
      if (k !== i) s.classList.remove('active');
      s.classList.toggle('past-slide', k < i);
      s.setAttribute('aria-hidden', k === i ? 'false' : 'true');
    });
    current = i;
    step = toEnd ? model[i].max : 0;
    var s = slides[i];
    s.classList.remove('active'); void s.offsetWidth; s.classList.add('active');
    // Safari can throw SecurityError for replaceState on file:// pages; never let that stop the reveal.
    try { if (location.hash !== '#' + (i + 1)) history.replaceState(null, '', '#' + (i + 1)); } catch (err) {}
    apply(true);
  }
  function setStep(k) {
    var m = model[current];
    k = Math.max(0, Math.min(m.max, k));
    if (k === step) return;
    step = k; apply(false);
  }
  function next() { if (step < model[current].max) setStep(step + 1); else if (current < total - 1) go(current + 1); }
  function prev() { if (step > 0) setStep(step - 1); else if (current > 0) go(current - 1, true); }
  function skip() {
    if (step < model[current].max) {
      stage.classList.add('ff'); setStep(model[current].max);
      setTimeout(function () { stage.classList.remove('ff'); }, 60);
    } else next();
  }
  function replay() { go(current, false); }

  /* ---------- Notes ---------- */
  function renderNotes() {
    var src = slides[current].querySelector('.notes');
    npTitle.textContent = 'Speaker Notes — ' + (current >= mainCount ? 'สไลด์เสริม A' + (current - mainCount + 1) : 'สไลด์ ' + (current + 1) + '/' + mainCount);
    npTime.textContent = slides[current].getAttribute('data-time') ? 'เวลา ' + slides[current].getAttribute('data-time') : '';
    npStep.textContent = model[current].max ? 'ขั้น ' + (step + 1) + '/' + (model[current].max + 1) : '';
    var html = src ? src.innerHTML : '<p>—</p>';
    if (npBody.getAttribute('data-for') !== String(current)) { npBody.innerHTML = html; npBody.scrollTop = 0; npBody.setAttribute('data-for', current); }
  }
  function toggleNotes(force) {
    notesOn = typeof force === 'boolean' ? force : !notesOn;
    notesPanel.hidden = !notesOn;
    btnNotes.classList.toggle('on', notesOn);
    btnNotes.setAttribute('aria-pressed', String(notesOn));
    fit(); setTimeout(fit, 420);
  }

  /* ---------- Overlays ---------- */
  function openOv(ov) { closeOv(); ov.hidden = false; var b = ov.querySelector('[data-close]'); if (b) b.focus(); }
  function closeOv() { helpOv.hidden = true; refsOv.hidden = true; }
  function anyOpen() { return !helpOv.hidden || !refsOv.hidden; }
  [helpOv, refsOv].forEach(function (ov) {
    ov.addEventListener('click', function (e) { if (e.target === ov || e.target.closest('[data-close]')) closeOv(); });
  });
  document.querySelectorAll('[data-open="refs"]').forEach(function (b) { b.addEventListener('click', function (e) { e.stopPropagation(); openOv(refsOv); }); });
  document.querySelectorAll('[data-action="next"]').forEach(function (b) { b.addEventListener('click', function (e) { e.stopPropagation(); go(current + 1); }); });

  /* ---------- Fullscreen (incl. older Safari prefix) ---------- */
  function toggleFull() {
    var d = document, el = d.documentElement;
    var isFull = d.fullscreenElement || d.webkitFullscreenElement;
    var req = el.requestFullscreen || el.webkitRequestFullscreen;
    var exit = d.exitFullscreen || d.webkitExitFullscreen;
    if (!isFull && req) { try { var p = req.call(el); if (p && p.catch) p.catch(fsHint); } catch (e) { fsHint(); } }
    else if (isFull && exit) exit.call(d);
    else fsHint();
  }
  function fsHint() { showToast('อุปกรณ์นี้ไม่รองรับเต็มจอ — บน iPad ใช้ “เพิ่มไปยังหน้าจอโฮม” แล้วเปิดจากไอคอน'); }

  /* ---------- Toast ---------- */
  var toastTimer;
  function showToast(msg) {
    toast.textContent = msg; toast.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { toast.classList.remove('show'); }, 2200);
  }

  /* ---------- Copy prompt ---------- */
  var copyBtn = $('copyBtn'), promptText = $('promptText');
  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0'; ta.style.fontSize = '16px';
    document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
    var ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta); return ok;
  }
  function copied(ok) {
    var label = copyBtn.querySelector('span');
    if (ok) {
      copyBtn.classList.add('done'); label.textContent = 'คัดลอกแล้ว';
      showToast('คัดลอก Prompt แล้ว — วางในแอป AI ได้เลย');
      setTimeout(function () { copyBtn.classList.remove('done'); label.textContent = 'Copy Prompt'; }, 2000);
    } else showToast('คัดลอกไม่สำเร็จ — กดค้างที่ข้อความเพื่อเลือกแล้วคัดลอก');
  }
  copyBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    var text = promptText.textContent.trim();
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(function () { copied(true); }, function () { copied(fallbackCopy(text)); });
    else copied(fallbackCopy(text));
  });

  /* ---------- Token simulator (same calculation as before) ---------- */
  (function () {
    var sim = $('tokenSim'); if (!sim) return;
    var C = 2 * Math.PI * 80;
    var fmt = function (n) { return Math.round(n).toLocaleString('en-US'); };
    var money = function (n) { return n.toLocaleString('en-US', { maximumFractionDigits: n < 1 ? 4 : 2 }); };
    var shown = 0, raf;
    function animateTotal(target) {
      cancelAnimationFrame(raf);
      if (reduceMotion) { shown = target; $('tTotal').textContent = fmt(target); return; }
      var from = shown, t0 = performance.now(), dur = 450;
      (function stepFn(now) {
        var k = Math.min(1, (now - t0) / dur);
        shown = from + (target - from) * (1 - Math.pow(1 - k, 3));
        $('tTotal').textContent = fmt(shown);
        if (k < 1) raf = requestAnimationFrame(stepFn);
      })(t0);
    }
    function calc() {
      var jobs = +$('tJobs').value, tin = +$('tIn').value, tout = +$('tOut').value;
      var inTot = jobs * tin, outTot = jobs * tout, totalT = inTot + outTot;
      $('vJobs').textContent = fmt(jobs); $('vIn').textContent = fmt(tin); $('vOut').textContent = fmt(tout);
      $('tInTot').textContent = fmt(inTot); $('tOutTot').textContent = fmt(outTot);
      var fi = inTot / totalT, fo = outTot / totalT;
      $('barIn').style.width = (fi * 100) + '%'; $('barOut').style.width = (fo * 100) + '%';
      $('dIn').setAttribute('stroke-dasharray', (fi * C) + ' ' + C);
      $('dOut').setAttribute('stroke-dasharray', (fo * C) + ' ' + C);
      $('dOut').setAttribute('stroke-dashoffset', String(-fi * C));
      $('dIn').style.strokeDasharray = (fi * C) + ' ' + C;
      $('dOut').style.strokeDasharray = (fo * C) + ' ' + C;
      $('dOut').style.strokeDashoffset = String(-fi * C);
      animateTotal(totalT);
      var pIn = parseFloat($('pIn').value), pOut = parseFloat($('pOut').value), cost = $('tCost');
      if (!isNaN(pIn) || !isNaN(pOut)) {
        var c = (inTot / 1e6) * (isNaN(pIn) ? 0 : pIn) + (outTot / 1e6) * (isNaN(pOut) ? 0 : pOut);
        cost.innerHTML = 'ประมาณ <b></b> (หน่วยเงินเดียวกับราคาที่กรอก)' + ((isNaN(pIn) || isNaN(pOut)) ? ' — ยังกรอกราคาไม่ครบ' : '');
        cost.querySelector('b').textContent = money(c);
      } else cost.textContent = 'กรอกราคาของโมเดลที่ใช้จริง เพื่อคำนวณค่าใช้จ่าย';
    }
    document.querySelectorAll('#tokenSim input, .price input').forEach(function (i) {
      i.addEventListener('input', calc);
      i.addEventListener('click', function (e) { e.stopPropagation(); });
    });
    calc();
  })();

  /* ---------- AI network canvas (hook + closing) ---------- */
  var net = (function () {
    var canvases = slides.map(function (s) { return s.hasAttribute('data-net') ? s.querySelector('canvas.net') : null; });
    var N = 64, nodes = [], level = 0, goal = 0, ctx = null, cv = null, rafId = 0, last = 0, running = false;
    for (var i = 0; i < N; i++) nodes.push({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - .5) * .25, vy: (Math.random() - .5) * .25, r: 1.5 + Math.random() * 2.2, p: Math.random() * 6.28 });
    function draw(t) {
      if (!ctx) return;
      ctx.clearRect(0, 0, W, H);
      var spd = reduceMotion ? 0 : (0.4 + level * 1.2);
      var reach = 150 + level * 90, R2 = reach * reach;
      for (var i = 0; i < N; i++) {
        var a = nodes[i];
        a.x += a.vx * spd; a.y += a.vy * spd;
        if (a.x < 0 || a.x > W) a.vx *= -1; if (a.y < 0 || a.y > H) a.vy *= -1;
      }
      ctx.lineWidth = 1.2;
      for (i = 0; i < N; i++) {
        for (var j = i + 1; j < N; j++) {
          var dx = nodes[i].x - nodes[j].x, dy = nodes[i].y - nodes[j].y, d2 = dx * dx + dy * dy;
          if (d2 < R2) {
            var al = (1 - d2 / R2) * (0.12 + level * 0.35);
            ctx.strokeStyle = 'rgba(76,141,255,' + al.toFixed(3) + ')';
            ctx.beginPath(); ctx.moveTo(nodes[i].x, nodes[i].y); ctx.lineTo(nodes[j].x, nodes[j].y); ctx.stroke();
          }
        }
      }
      for (i = 0; i < N; i++) {
        var n = nodes[i], pulse = reduceMotion ? 1 : (0.6 + 0.4 * Math.sin(t / 900 + n.p));
        ctx.fillStyle = 'rgba(44,230,230,' + ((0.25 + level * 0.65) * pulse).toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r * (1 + level * .4), 0, 6.283); ctx.fill();
      }
    }
    function loop(t) {
      if (!running) return;
      var dt = Math.min(64, t - (last || t)); last = t;
      level += (goal - level) * Math.min(1, dt / 600);
      draw(t);
      if (reduceMotion && Math.abs(goal - level) < 0.01) { running = false; return; }
      rafId = requestAnimationFrame(loop);
    }
    function start() { if (!running) { running = true; last = 0; rafId = requestAnimationFrame(loop); } }
    function stop() { running = false; cancelAnimationFrame(rafId); }
    document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); else if (cv) start(); });
    return {
      target: function (slide) {
        var idx = slides.indexOf(slide), c = canvases[idx];
        if (!c) { stop(); cv = null; ctx = null; return; }
        if (c !== cv) { cv = c; ctx = c.getContext('2d'); level = 0; }
        var at = +slide.getAttribute('data-at') || 0;
        goal = (slide.classList.contains('s-hook') ? [0.25, 0.4, 0.9, 0.95, 1] : [0.3, 0.75, 0.6, 0.6])[at];
        if (goal == null) goal = 0.6;
        if (reduceMotion) { level = goal; draw(0); return; }
        start();
      }
    };
  })();

  /* ---------- Buttons ---------- */
  $('btnNext').addEventListener('click', next);
  $('btnPrev').addEventListener('click', prev);
  $('btnSkip').addEventListener('click', skip);
  $('btnReplay').addEventListener('click', replay);
  $('btnRestart').addEventListener('click', function () { go(0); });
  $('btnFull').addEventListener('click', toggleFull);
  $('btnHelp').addEventListener('click', function () { helpOv.hidden ? openOv(helpOv) : closeOv(); });
  $('btnRefs').addEventListener('click', function () { refsOv.hidden ? openOv(refsOv) : closeOv(); });
  btnNotes.addEventListener('click', function () { toggleNotes(); });

  /* ---------- Keyboard ---------- */
  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var k = e.key;
    if (k === 'Escape') { if (anyOpen()) { closeOv(); e.preventDefault(); } return; }
    if (k === '?' || (k === '/' && e.shiftKey)) { e.preventDefault(); helpOv.hidden ? openOv(helpOv) : closeOv(); return; }
    if (anyOpen()) return;
    var tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;   // sliders and fields keep their keys
    var onControl = tag === 'button';
    switch (k) {
      case 'ArrowRight': case 'PageDown': e.preventDefault(); e.shiftKey ? skip() : next(); break;
      case 'ArrowLeft': case 'PageUp': e.preventDefault(); prev(); break;
      case ' ': case 'Enter':
        if (onControl) return;                // let the focused button act, never navigate
        if (k === 'Enter') return;
        e.preventDefault(); e.shiftKey ? prev() : next(); break;
      case 'Home': e.preventDefault(); go(0); break;
      case 'End': e.preventDefault(); go(total - 1); break;
      case 's': case 'S': skip(); break;
      case 'a': case 'A': replay(); break;
      case 'n': case 'N': toggleNotes(); break;
      case 'f': case 'F': toggleFull(); break;
      case 'r': case 'R': openOv(refsOv); break;
      default:
        if (/^[1-9]$/.test(k)) go(parseInt(k, 10) - 1);
        else if (k === '0') go(9);
    }
  });

  /* ---------- Touch swipe (ignores interactive elements) ---------- */
  var sx = 0, sy = 0, st = 0;
  viewport.addEventListener('touchstart', function (e) {
    if (e.target.closest('input, button, a, .np-body, .prompt-text')) { st = 0; return; }
    var t = e.changedTouches[0]; sx = t.clientX; sy = t.clientY; st = Date.now();
  }, { passive: true });
  // keep horizontal swipes inside the deck (stops browser back/forward gestures and rubber-banding)
  viewport.addEventListener('touchmove', function (e) {
    if (!st) return;
    var t = e.changedTouches[0];
    if (Math.abs(t.clientX - sx) > Math.abs(t.clientY - sy) && e.cancelable) e.preventDefault();
  }, { passive: false });
  viewport.addEventListener('touchend', function (e) {
    if (!st) return;
    var t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.4) { dx < 0 ? next() : prev(); }
    st = 0;
  }, { passive: true });

  /* ---------- Auto-hide controls (mouse only; always visible on touch) ---------- */
  var idleTimer;
  function wake() { document.body.classList.remove('idle'); clearTimeout(idleTimer); idleTimer = setTimeout(function () { document.body.classList.add('idle'); }, 3000); }
  ['mousemove', 'keydown', 'touchstart'].forEach(function (ev) { document.addEventListener(ev, wake, { passive: true }); });

  window.addEventListener('hashchange', function () {
    var h = parseInt(location.hash.slice(1), 10);
    if (h >= 1 && h <= total && h - 1 !== current) go(h - 1);
  });

  /* ---------- Init ---------- */
  var startHash = parseInt((location.hash || '').slice(1), 10);
  fit();
  requestAnimationFrame(function () { go(startHash >= 1 && startHash <= total ? startHash - 1 : 0); });
  wake();

  // test hook (read-only state for automated checks)
  window.__deck = { state: function () { return { slide: current + 1, step: step, max: model[current].max }; } };
})();
