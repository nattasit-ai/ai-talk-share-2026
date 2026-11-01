/* AI Talk & Share 2026 — presentation controller (no dependencies) */
(function () {
  'use strict';

  const W = 1920, H = 1080;
  const NOTES_RATIO = 0.3; // notes panel height as share of window height

  const stage = document.getElementById('stage');
  const viewport = document.getElementById('viewport');
  const slides = Array.from(stage.querySelectorAll('.slide'));
  const total = slides.length;
  const counter = document.getElementById('counter');
  const fill = document.getElementById('progressFill');
  const notesPanel = document.getElementById('notesPanel');
  const npBody = document.getElementById('npBody');
  const npTitle = document.getElementById('npTitle');
  const npTime = document.getElementById('npTime');
  const helpOv = document.getElementById('helpOverlay');
  const refsOv = document.getElementById('refsOverlay');
  const toast = document.getElementById('toast');
  const btnNotes = document.getElementById('btnNotes');

  let current = 0;
  let notesOn = false;

  /* ---------- Stagger indices ---------- */
  slides.forEach(slide => {
    slide.querySelectorAll('.r').forEach((el, i) => el.style.setProperty('--d', i));
    slide.querySelectorAll('.wm').forEach((el, i) => el.style.setProperty('--k', i));
    slide.querySelectorAll('.matrix tbody tr').forEach((tr, ri) => {
      tr.querySelectorAll('.m').forEach((m, ci) => m.style.setProperty('--j', ri * 3 + ci));
    });
  });

  /* ---------- Scaling ---------- */
  function fit() {
    const notesH = notesOn ? Math.round(window.innerHeight * NOTES_RATIO) : 0;
    document.documentElement.style.setProperty('--notes-h', notesH + 'px');
    const vw = window.innerWidth;
    const vh = window.innerHeight - notesH;
    const s = Math.min(vw / W, vh / H);
    stage.style.transform = `scale(${s}) translate(-50%, -50%)`;
  }
  // translate after scale uses unscaled units, so -50% of 1920/1080 centers correctly.
  window.addEventListener('resize', fit);

  /* ---------- Navigation ---------- */
  function pad(n) { return String(n).padStart(2, '0'); }

  function go(i) {
    i = Math.max(0, Math.min(total - 1, i));
    if (i === current && slides[i].classList.contains('active')) return;
    slides.forEach((s, k) => {
      s.classList.toggle('active', k === i);
      s.classList.toggle('past', k < i);
      s.setAttribute('aria-hidden', k === i ? 'false' : 'true');
    });
    current = i;
    counter.textContent = `${pad(i + 1)} / ${pad(total)}`;
    fill.style.width = ((i + 1) / total * 100) + '%';
    if (location.hash !== '#' + (i + 1)) history.replaceState(null, '', '#' + (i + 1));
    renderNotes();
  }
  const next = () => go(current + 1);
  const prev = () => go(current - 1);

  /* ---------- Notes ---------- */
  function renderNotes() {
    const src = slides[current].querySelector('.notes');
    npTitle.textContent = `Speaker Notes — สไลด์ ${current + 1}`;
    npTime.textContent = slides[current].dataset.time ? 'เวลา ' + slides[current].dataset.time : '';
    npBody.innerHTML = src ? src.innerHTML : '<p>—</p>';
    npBody.scrollTop = 0;
  }
  function toggleNotes(force) {
    notesOn = typeof force === 'boolean' ? force : !notesOn;
    notesPanel.hidden = !notesOn;
    btnNotes.classList.toggle('on', notesOn);
    btnNotes.setAttribute('aria-pressed', String(notesOn));
    fit();
  }

  /* ---------- Overlays ---------- */
  function openOv(ov) { closeOv(); ov.hidden = false; const b = ov.querySelector('[data-close]'); if (b) b.focus(); }
  function closeOv() { [helpOv, refsOv].forEach(o => { o.hidden = true; }); }
  const anyOpen = () => !helpOv.hidden || !refsOv.hidden;
  [helpOv, refsOv].forEach(ov => {
    ov.addEventListener('click', e => { if (e.target === ov || e.target.closest('[data-close]')) closeOv(); });
  });
  document.querySelectorAll('[data-open="refs"]').forEach(b => b.addEventListener('click', () => openOv(refsOv)));

  /* ---------- Fullscreen ---------- */
  function toggleFull() {
    if (!document.fullscreenElement) {
      (document.documentElement.requestFullscreen || function () {}).call(document.documentElement);
    } else if (document.exitFullscreen) {
      document.exitFullscreen();
    }
  }

  /* ---------- Toast ---------- */
  let toastTimer;
  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 1800);
  }

  /* ---------- Copy prompt ---------- */
  const copyBtn = document.getElementById('copyBtn');
  const promptText = document.getElementById('promptText');
  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', '');
    ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }
  function copied(ok) {
    const label = copyBtn.querySelector('span');
    if (ok) {
      copyBtn.classList.add('done'); label.textContent = 'คัดลอกแล้ว';
      showToast('คัดลอก Prompt แล้ว — วางในแอป AI ได้เลย');
      setTimeout(() => { copyBtn.classList.remove('done'); label.textContent = 'Copy Prompt'; }, 2000);
    } else {
      showToast('คัดลอกไม่สำเร็จ — กรุณาเลือกข้อความแล้วกด Ctrl+C');
    }
  }
  copyBtn.addEventListener('click', e => {
    e.stopPropagation();
    const text = promptText.textContent.trim();
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(() => copied(true), () => copied(fallbackCopy(text)));
    } else {
      copied(fallbackCopy(text));
    }
  });

  /* ---------- Matrix interaction ---------- */
  const info = document.getElementById('matrixInfo');
  const rows = document.querySelectorAll('#matrix tbody tr');
  rows.forEach(tr => {
    tr.tabIndex = 0;
    const pick = () => {
      rows.forEach(r => r.classList.remove('sel'));
      tr.classList.add('sel');
      info.innerHTML = '<b></b>';
      info.firstChild.textContent = tr.cells[0].textContent;
      info.appendChild(document.createTextNode(tr.dataset.info));
    };
    tr.addEventListener('click', e => { e.stopPropagation(); pick(); });
    tr.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); pick(); } });
  });

  /* ---------- Buttons ---------- */
  document.getElementById('btnNext').addEventListener('click', next);
  document.getElementById('btnPrev').addEventListener('click', prev);
  document.getElementById('btnRestart').addEventListener('click', () => go(0));
  document.getElementById('btnFull').addEventListener('click', toggleFull);
  document.getElementById('btnHelp').addEventListener('click', () => (helpOv.hidden ? openOv(helpOv) : closeOv()));
  document.getElementById('btnRefs').addEventListener('click', () => (refsOv.hidden ? openOv(refsOv) : closeOv()));
  btnNotes.addEventListener('click', () => toggleNotes());

  /* ---------- Keyboard ---------- */
  document.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    if (k === 'Escape') { if (anyOpen()) { closeOv(); e.preventDefault(); } return; }
    if (k === '?' || (k === '/' && e.shiftKey)) { e.preventDefault(); helpOv.hidden ? openOv(helpOv) : closeOv(); return; }
    if (anyOpen()) return;
    const tag = (e.target.tagName || '').toLowerCase();
    const onButton = tag === 'button' || e.target.closest && e.target.closest('tr[tabindex]');
    switch (k) {
      case 'ArrowRight': case 'PageDown': e.preventDefault(); next(); break;
      case 'ArrowLeft': case 'PageUp': e.preventDefault(); prev(); break;
      case ' ': if (onButton) return; e.preventDefault(); e.shiftKey ? prev() : next(); break;
      case 'Home': e.preventDefault(); go(0); break;
      case 'End': e.preventDefault(); go(total - 1); break;
      case 'n': case 'N': toggleNotes(); break;
      case 'f': case 'F': toggleFull(); break;
      case 'r': case 'R': openOv(refsOv); break;
      default:
        if (/^[1-9]$/.test(k)) go(parseInt(k, 10) - 1);
        else if (k === '0') go(9);
    }
  });

  /* ---------- Touch swipe ---------- */
  let sx = 0, sy = 0, st = 0;
  viewport.addEventListener('touchstart', e => {
    const t = e.changedTouches[0]; sx = t.clientX; sy = t.clientY; st = Date.now();
  }, { passive: true });
  viewport.addEventListener('touchend', e => {
    const t = e.changedTouches[0];
    const dx = t.clientX - sx, dy = t.clientY - sy;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.4 && Date.now() - st < 800) {
      dx < 0 ? next() : prev();
    }
  }, { passive: true });

  /* ---------- Auto-hide controls ---------- */
  let idleTimer;
  function wake() {
    document.body.classList.remove('idle');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => document.body.classList.add('idle'), 2800);
  }
  ['mousemove', 'touchstart', 'keydown'].forEach(ev => document.addEventListener(ev, wake, { passive: true }));

  /* ---------- Init ---------- */
  const startHash = parseInt((location.hash || '').slice(1), 10);
  fit();
  // let the first frame paint before animating in
  requestAnimationFrame(() => go(startHash >= 1 && startHash <= total ? startHash - 1 : 0));
  wake();
})();
