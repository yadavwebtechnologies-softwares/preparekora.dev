(function (global) {
  'use strict';

  const PRESETS = {
    '1:1': { w: 1080, h: 1080 },
    '16:9': { w: 1920, h: 1080 },
    '9:16': { w: 1080, h: 1920 },
    '4:3': { w: 1440, h: 1080 },
    '3:4': { w: 1080, h: 1440 }
  };
  const DEFAULT_QR = 'https://chat.whatsapp.com/DLrcA98MrlYKOeZ5DMeN5Z';
  const PREF = { ratio: 'ms_ratio', input: 'ms_input', qr: 'ms_qr' };

  const state = {
    canvasWidth: 1440,
    canvasHeight: 1080,
    aspect: '4:3',
    qrDestination: DEFAULT_QR,
    previewConfirmed: false,
    pendingId: null
  };
  let initialized = false;
  let isExporting = false;

  const $ = id => document.getElementById(id);
  const ls = {
    get: k => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch {} }
  };

  function gcd(a, b) { a = Math.round(a); b = Math.round(b); while (b) { const t = a % b; a = b; b = t; } return a || 1; }
  function ratioLabel(w, h) { const d = gcd(w, h); return `${w / d}:${h / d}`; }

  function splitParagraph(text) { return String(text || '').trim(); }

  function parseMCQFormat(raw) {
    const res = { subject: '', question: '', options: { A: '', B: '', C: '', D: '' }, answer: '' };
    if (!raw || !raw.trim()) return res;
    const lines = raw.replace(/\r/g, '').split('\n');
    const qLines = [];
    let started = false;
    let active = null;
    const sPat = /^\s*(?:Subject|Topic)\s*[:：-]\s*(.*)$/i;
    const qPat = /^\s*(?:Q(?:uestion)?\s*\d*)\s*[:：.)-]\s*(.*)$/i;
    const aPat = /^\s*(?:Ans(?:wer)?|Correct\s*Answer)\s*[:：-]\s*(.*)$/i;
    const oPat = /^\s*(?:Option\s+([A-D])\s*[:.)-]|(?:\(([A-D])\)|\[([A-D])\]|([A-D])\s*[\).:：-]))\s*(.*)$/i;
    for (const line0 of lines) {
      const line = line0.trim();
      if (!line) continue;
      let m;
      if ((m = line.match(sPat))) { res.subject = m[1].trim(); active = null; continue; }
      if ((m = line.match(aPat))) { res.answer = m[1].trim(); active = null; continue; }
      if ((m = line.match(qPat))) {
        started = true; active = null;
        if (m[1].trim()) qLines.push(m[1].trim());
        continue;
      }
      if ((m = line.match(oPat))) {
        const L = (m[1] || m[2] || m[3] || m[4]).toUpperCase();
        active = L;
        res.options[L] = m[5].trim();
        continue;
      }
      if (started && !active) { qLines.push(line); continue; }
      if (active) { res.options[active] += (res.options[active] ? ' ' : '') + line; continue; }
    }
    res.question = qLines.join(' ').trim();
    return res;
  }

  async function reserveId(subject) {
    const r = await PK_API.post('/api/ids/reserve', { type: 'MCQS', subject });
    return r.id;
  }

  async function recordImage(id, subject) {
    try {
      await PK_API.post('/api/images', {
        id, type: 'MCQS', subject,
        meta: { ratio: state.aspect, width: state.canvasWidth, height: state.canvasHeight }
      });
    } catch (e) { console.warn(e); }
  }

  function renderQR(container, url) {
    if (!container) return;
    container.innerHTML = '';
    if (!url) return;
    try {
      new QRCode(container, { text: url, width: 54, height: 54, correctLevel: QRCode.CorrectLevel.H });
    } catch (e) {}
  }

  function refreshPoster() {
    const parsed = parseMCQFormat($('ms-bulk').value);
    const set = (el, v) => { if (el) el.textContent = String(v || '').trim() || '—'; };
    set($('ms-subject'), parsed.subject);
    set($('ms-question'), parsed.question);
    set($('ms-optA'), parsed.options.A);
    set($('ms-optB'), parsed.options.B);
    set($('ms-optC'), parsed.options.C);
    set($('ms-optD'), parsed.options.D);
    if ($('ms-id') && state.pendingId) $('ms-id').textContent = state.pendingId;
  }

  function updateCanvasInfo() {
    $('ms-canvas-dims').textContent = `${state.canvasWidth} × ${state.canvasHeight} px`;
    $('ms-preview-size').textContent = `${state.canvasWidth} × ${state.canvasHeight}`;
    $('ms-aspect-label').textContent = state.aspect === 'custom' ? 'Custom' : state.aspect;
    $('ms-ratio-label').textContent = `${ratioLabel(state.canvasWidth, state.canvasHeight)} aspect ratio`;
    updateExportInfo();
  }

  function updateExportInfo() {
    const r = Number($('ms-resolution').value) || 2;
    $('ms-export-dims').textContent = `${(state.canvasWidth * r).toLocaleString('en-IN')} × ${(state.canvasHeight * r).toLocaleString('en-IN')} px`;
  }

  function setPreviewState(ok) {
    state.previewConfirmed = ok;
    $('ms-resolution').disabled = !ok;
    $('ms-export-btn').disabled = !ok;
    if (!ok) {
      $('ms-preview-status').textContent = 'Changes detected. Click Preview again.';
      $('ms-export-status').textContent = 'Preview your image again before downloading.';
    }
  }

  function invalidate() { setPreviewState(false); }

  function applyAspect() {
    const sel = $('ms-aspect').value;
    if (sel === 'custom') {
      $('ms-custom-fields').hidden = false;
      state.canvasWidth = Number($('ms-cw').value) || 1080;
      state.canvasHeight = Number($('ms-ch').value) || 1350;
    } else {
      $('ms-custom-fields').hidden = true;
      const p = PRESETS[sel];
      state.canvasWidth = p.w;
      state.canvasHeight = p.h;
      state.aspect = sel;
    }
    if (sel === 'custom') state.aspect = 'custom';
    updateCanvasInfo();
    invalidate();
  }

  async function handlePreview() {
    const parsed = parseMCQFormat($('ms-bulk').value);
    if (!parsed.question) { $('ms-preview-status').textContent = 'Question not detected.'; return; }
    const missing = ['A', 'B', 'C', 'D'].filter(L => !parsed.options[L].trim());
    if (missing.length) { $('ms-preview-status').textContent = 'Missing option(s): ' + missing.join(', '); return; }
    const subject = parsed.subject || 'General';
    $('ms-preview-btn').disabled = true;
    $('ms-preview-btn').textContent = 'Reserving ID…';
    try {
      state.pendingId = await reserveId(subject);
      refreshPoster();
      setPreviewState(true);
      $('ms-preview-status').textContent = 'Preview ready. Select resolution and download.';
      $('ms-export-status').textContent = 'Your image is ready to export.';
    } catch (e) {
      $('ms-preview-status').textContent = 'Failed to reserve ID: ' + e.message;
    } finally {
      $('ms-preview-btn').disabled = false;
      $('ms-preview-btn').textContent = 'Preview image';
    }
  }

  async function handleExport() {
    if (isExporting) return;
    if (!state.previewConfirmed || !state.pendingId) return;
    if (!global.html2canvas) { alert('html2canvas not loaded.'); return; }
    isExporting = true;
    const btn = $('ms-export-btn');
    btn.disabled = true;
    const orig = btn.textContent;
    btn.textContent = 'Preparing…';
    const overlay = $('exportOverlay');
    if (overlay) overlay.hidden = false;
    const resolution = Number($('ms-resolution').value) || 4;

    try {
      await document.fonts.ready;
      const posterEl = $('ms-poster');
      const rect = posterEl.getBoundingClientRect();
      const scale = (state.canvasWidth * resolution) / rect.width;
      const canvas = await global.html2canvas(posterEl, {
        scale: scale,
        backgroundColor: null,
        useCORS: true,
        logging: false
      });
      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = 'preparekora-' + state.pendingId.replace(/\//g, '-') + '.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
      $('ms-export-status').textContent = 'Downloaded ' + state.pendingId;
      const subject = parseMCQFormat($('ms-bulk').value).subject || 'General';
      await recordImage(state.pendingId, subject);
      state.pendingId = null;
      setPreviewState(false);
    } catch (e) {
      console.error(e);
      alert('Export failed: ' + e.message);
    } finally {
      btn.textContent = orig;
      btn.disabled = false;
      if (overlay) setTimeout(() => { overlay.hidden = true; }, 350);
      isExporting = false;
    }
  }

  async function loadQR() {
    try {
      const res = await PK_API.get('/api/qr/mcq-studio');
      state.qrDestination = (res.qrDestination || '').trim() || DEFAULT_QR;
    } catch { state.qrDestination = DEFAULT_QR; }
  }

  function wire() {
    const bulk = $('ms-bulk');
    if (!bulk) return;
    bulk.addEventListener('input', () => { ls.set(PREF.input, bulk.value); refreshPoster(); invalidate(); });
    $('ms-aspect').addEventListener('change', applyAspect);
    $('ms-cw').addEventListener('input', applyAspect);
    $('ms-ch').addEventListener('input', applyAspect);
    $('ms-resolution').addEventListener('change', updateExportInfo);
    $('ms-qr').addEventListener('input', () => {
      ls.set(PREF.qr, $('ms-qr').value);
      renderQR($('ms-qr-code'), $('ms-qr').value || state.qrDestination);
    });
    $('ms-preview-btn').addEventListener('click', handlePreview);
    $('ms-export-btn').addEventListener('click', handleExport);
  }

  async function init() {
    if (initialized) return;
    initialized = true;
    await loadQR();
    const savedInput = ls.get(PREF.input);
    if (savedInput) $('ms-bulk').value = savedInput;
    const savedQr = ls.get(PREF.qr);
    if (savedQr) $('ms-qr').value = savedQr;
    $('ms-qr').placeholder = state.qrDestination ? 'Blank = use module default' : 'https://...';
    $('ms-aspect').value = '4:3';
    applyAspect();
    wire();
    refreshPoster();
    renderQR($('ms-qr-code'), $('ms-qr').value || state.qrDestination);
    $('ms-preview-status').textContent = 'Paste format and click Preview.';
  }

  function maybeInit() {
    if (!PK_AUTH || !PK_AUTH.isAdmin()) return;
    init();
  }
  global.addEventListener('pk:authchanged', e => { if (e.detail && e.detail.isAdmin) maybeInit(); });
  if (document.readyState !== 'loading') setTimeout(maybeInit, 200);
  else document.addEventListener('DOMContentLoaded', () => setTimeout(maybeInit, 200));
})(window);
