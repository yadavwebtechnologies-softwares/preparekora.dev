(function (global) {
  'use strict';

  const PREF = { state: 'th_state' };
  const DEFAULT = {
    mtId: 'MT-GK-003',
    subject: 'GENERAL KNOWLEDGE',
    title: 'Important\nMCQs',
    examType: 'MOCK EXAMINATION',
    examName: 'ADRE\nGeneral\nKnowledge',
    question: 'Who is the Education Minister of Assam?',
    optA: 'Ranoj Pegu',
    optB: 'Himanta Biswa Sarma',
    optC: 'Gaurav Gogoi',
    optD: 'Nitin Gadkari',
    questions: '120',
    time: '30 Min',
    marks: '50',
    url: 'https://chat.whatsapp.com/DLrcA98MrlYKOeZ5DMeN5Z'
  };
  const INPUT_MAP = {
    'th-question': 'question', 'th-optA': 'optA', 'th-optB': 'optB',
    'th-optC': 'optC', 'th-optD': 'optD', 'th-time': 'time', 'th-marks': 'marks'
  };

  let state = Object.assign({}, DEFAULT);
  let lastQRSrc = '';
  let initialized = false;

  const $ = id => document.getElementById(id);
  const ls = {
    get: k => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch {} }
  };

  function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
  function nl2br(s) { return esc(s).split('\n').join('<br>'); }
  function setText(bind, text) { const el = document.querySelector(`[data-tool="thumbnail"] [data-bind="${bind}"]`); if (el) el.textContent = text ?? ''; }
  function setHtml(bind, html) { const el = document.querySelector(`[data-tool="thumbnail"] [data-bind="${bind}"]`); if (el) el.innerHTML = html ?? ''; }

  function render() {
    setText('mtId', 'MT ID: ' + (state.mtId || ''));
    setText('subject', state.subject);
    setHtml('title', nl2br(state.title || ''));
    setText('examType', state.examType);
    setHtml('examName', nl2br(state.examName || ''));
    setText('question', state.question);
    setText('optA', state.optA);
    setText('optB', state.optB);
    setText('optC', state.optC);
    setText('optD', state.optD);
    setText('questions', state.questions);
    setText('time', state.time);
    setText('marks', state.marks);
    updateQR();
  }

  function updateQR() {
    const url = String(state.url || '').trim();
    const img = document.querySelector('[data-tool="thumbnail"] .th-qr-image');
    if (!img) return;
    if (!url) { img.removeAttribute('src'); lastQRSrc = ''; return; }
    const src = 'https://quickchart.io/qr?text=' + encodeURIComponent(url) + '&size=500&margin=2&ecLevel=H&dark=111111&light=ffffff';
    if (src === lastQRSrc) return;
    lastQRSrc = src;
    img.crossOrigin = 'anonymous';
    img.src = src;
  }

  function populateInputs() {
    Object.keys(INPUT_MAP).forEach(id => {
      const el = $(id);
      if (el) el.value = state[INPUT_MAP[id]] ?? '';
    });
  }

  function bindInputs() {
    Object.keys(INPUT_MAP).forEach(id => {
      const el = $(id);
      if (!el) return;
      el.addEventListener('input', () => {
        state[INPUT_MAP[id]] = el.value;
        ls.set(PREF.state, JSON.stringify(state));
        render();
      });
    });
  }

  function setFormat(fmt) {
    const banner = $('th-banner');
    banner.classList.remove('portrait', 'landscape');
    banner.classList.add(fmt);
    $('th-portrait').classList.toggle('active', fmt === 'portrait');
    $('th-portrait').classList.toggle('secondary', fmt !== 'portrait');
    $('th-landscape').classList.toggle('active', fmt === 'landscape');
    $('th-landscape').classList.toggle('secondary', fmt !== 'landscape');
  }

  function waitQR() {
    const img = document.querySelector('[data-tool="thumbnail"] .th-qr-image');
    if (img.complete && img.naturalWidth > 0) return Promise.resolve();
    return new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error('QR timeout')), 12000);
      img.onload = () => { clearTimeout(t); res(); };
      img.onerror = () => { clearTimeout(t); rej(new Error('QR failed')); };
    });
  }

  async function downloadPNG() {
    if (!global.html2canvas) { alert('PNG library not loaded.'); return; }
    const banner = $('th-banner');
    const isPortrait = banner.classList.contains('portrait');
    const cssW = isPortrait ? 360 : 960;
    const cssH = isPortrait ? 640 : 540;
    const outW = isPortrait ? 1080 : 1920;
    const outH = isPortrait ? 1920 : 1080;
    let clone = null;
    try {
      await waitQR();
      clone = banner.cloneNode(true);
      clone.removeAttribute('id');
      clone.style.cssText = `width:${cssW}px;height:${cssH}px;max-width:none;min-width:0;aspect-ratio:auto;position:fixed;left:-10000px;top:0;margin:0;transform:none`;
      document.body.appendChild(clone);
      const qr = clone.querySelector('.th-qr-image');
      if (qr && !(qr.complete && qr.naturalWidth > 0)) {
        await new Promise((res, rej) => { qr.onload = res; qr.onerror = () => rej(new Error('QR clone failed')); });
      }
      const canvas = await global.html2canvas(clone, {
        backgroundColor: '#f7f7f5',
        scale: outW / cssW,
        width: cssW,
        height: cssH,
        windowWidth: cssW,
        windowHeight: cssH,
        useCORS: true,
        logging: false
      });
      const finalCanvas = document.createElement('canvas');
      finalCanvas.width = outW;
      finalCanvas.height = outH;
      finalCanvas.getContext('2d').drawImage(canvas, 0, 0, outW, outH);
      const blob = await new Promise(r => finalCanvas.toBlob(r, 'image/png'));
      if (!blob) throw new Error('PNG creation failed');
      const fmt = isPortrait ? '9x16' : '16x9';
      const safeId = String(state.mtId || 'banner').replace(/[^a-zA-Z0-9-]/g, '-');

      // Reserve thumb ID and record
      try {
        const subj = state.subject || 'General';
        const r = await PK_API.post('/api/ids/reserve', { type: 'THUMB', subject: subj });
        await PK_API.post('/api/thumbnails', {
          id: r.id, paperMtId: state.mtId || null,
          orientation: isPortrait ? 'portrait' : 'landscape',
          format: 'png'
        });
      } catch (e) { console.warn('Thumb record failed:', e); }

      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'PrepareKora_' + safeId + '_' + fmt + '.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch (e) {
      alert(e.message || 'Export failed');
      console.error(e);
    } finally {
      if (clone && clone.parentNode) clone.parentNode.removeChild(clone);
    }
  }

  function reset() {
    if (!confirm('Reset all fields to default example?')) return;
    state = Object.assign({}, DEFAULT);
    ls.set(PREF.state, JSON.stringify(state));
    populateInputs();
    render();
  }

  function syncFromPaper(data) {
    if (!data) return;
    if (!data.questions || !data.questions.length) return;
    const q1 = data.questions[0] || {};
    const opts = q1.options || [];
    state.mtId = data.mtId || state.mtId;
    state.subject = (data.subject || '').toUpperCase() || state.subject;
    state.title = data.title || state.title;
    state.examType = data.examType || state.examType;
    state.examName = data.examName || state.examName;
    state.questions = String(data.totalQuestions || data.questions.length);
    state.question = q1.qEn || '';
    state.optA = (opts[0] && opts[0].en) || '';
    state.optB = (opts[1] && opts[1].en) || '';
    state.optC = (opts[2] && opts[2].en) || '';
    state.optD = (opts[3] && opts[3].en) || '';
    if (data.qrUrl) state.url = data.qrUrl;
    ls.set(PREF.state, JSON.stringify(state));
    populateInputs();
    render();
  }

  function wire() {
    if (!$('th-banner')) return;
    $('th-portrait').addEventListener('click', () => setFormat('portrait'));
    $('th-landscape').addEventListener('click', () => setFormat('landscape'));
    $('th-download').addEventListener('click', downloadPNG);
    $('th-reset').addEventListener('click', reset);
    global.addEventListener('pk:thumbrequested', e => {
      if (e && e.detail) syncFromPaper(e.detail);
    });
  }

  function init() {
    if (initialized) return;
    initialized = true;
    try { const s = JSON.parse(ls.get(PREF.state) || 'null'); if (s) state = Object.assign({}, DEFAULT, s); } catch {}
    populateInputs();
    bindInputs();
    render();
    setFormat('portrait');
    wire();
  }

  function maybeInit() {
    if (!PK_AUTH || !PK_AUTH.isAdmin()) return;
    init();
  }
  global.addEventListener('pk:authchanged', e => { if (e.detail && e.detail.isAdmin) maybeInit(); });
  if (document.readyState !== 'loading') setTimeout(maybeInit, 200);
  else document.addEventListener('DOMContentLoaded', () => setTimeout(maybeInit, 200));
})(window);
