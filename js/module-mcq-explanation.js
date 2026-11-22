(function (global) {
  'use strict';

  const RATIOS = {
    '1:1':  { w: 1080, h: 1080, cls: 'r11' },
    '3:4':  { w: 1080, h: 1440, cls: 'r34' },
    '4:5':  { w: 1080, h: 1350, cls: 'r45' },
    '9:16': { w: 1080, h: 1920, cls: 'r916' }
  };
  const DEFAULT_QR = 'https://chat.whatsapp.com/DLrcA98MrlYKOeZ5DMeN5Z';
  const PREF_KEY = { ratio: 'mx_ratio', input: 'mx_input' };

  const state = {
    ratio: '4:5',
    mode: 'edit',
    mcqs: [],
    ids: [],
    qrDestination: DEFAULT_QR,
    downloaded: new Set()
  };
  let initialized = false;
  let isExporting = false;

  const $ = id => document.getElementById(id);
  const ls = {
    get: k => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch {} }
  };
  const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const waitFrame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

  function fontsReady() {
    return new Promise(async resolve => {
      try {
        await Promise.all([
          document.fonts.load('700 16px Inter'),
          document.fonts.load('600 16px Inter'),
          document.fonts.load('700 16px "Noto Sans Assamese"'),
          document.fonts.load('600 16px "Noto Sans Assamese"')
        ]);
        await document.fonts.ready;
      } catch (_) {}
      resolve();
    });
  }

  function renderQR(container) {
    if (!container || !global.QRCode || !state.qrDestination) return;
    container.innerHTML = '';
    try {
      new QRCode(container, {
        text: state.qrDestination,
        width: 224, height: 224,
        colorDark: '#000000', colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M
      });
    } catch (e) {}
  }

  async function loadQR() {
    try {
      const res = await PK_API.get('/api/qr/mcq-explanation');
      state.qrDestination = (res.qrDestination || '').trim() || DEFAULT_QR;
    } catch { state.qrDestination = DEFAULT_QR; }
  }

  function parseMCQs(text) {
    const blocks = String(text || '').split(/\n\s*---\s*\n/);
    return blocks.map(block => {
      const d = {};
      block.split(/\r?\n/).forEach(line => {
        const m = line.match(/^([A-Za-z][A-Za-z\-]*)\s*:\s*(.*)$/);
        if (m) d[m[1].toUpperCase()] = m[2].trim();
      });
      return {
        subject: d.SUBJECT || 'Subject',
        set: d.SET || '',
        qEn: d['Q-EN'] || '', qAs: d['Q-AS'] || '',
        aEn: d['A-EN'] || '', aAs: d['A-AS'] || '',
        bEn: d['B-EN'] || '', bAs: d['B-AS'] || '',
        cEn: d['C-EN'] || '', cAs: d['C-AS'] || '',
        dEn: d['D-EN'] || '', dAs: d['D-AS'] || '',
        ans: (d.ANS || '').toUpperCase().trim(),
        expEn: d['EXP-EN'] || d['EXPLANATION-EN'] || '',
        expAs: d['EXP-AS'] || d['EXPLANATION-AS'] || ''
      };
    }).filter(x => x.qEn || x.qAs);
  }

  function buildFrameHTML(mcq) {
    const correct = letter => mcq.ans === letter ? ' is-correct' : '';
    const opt = (L, en, as) => `
      <li class="opt${correct(L)}">
        <span class="key">${L}</span>
        <span class="txt"><span class="en">${esc(en)}</span>${as ? `<span class="as">${esc(as)}</span>` : ''}</span>
        <span class="tick">✓</span>
      </li>`;
    const showRule = mcq.expEn && mcq.expAs;
    return `
      <div class="topbar">
        <span class="pill">${esc(mcq.subject || 'Subject')}</span>
        <span class="pill dark">Answer Key</span>
      </div>
      <div class="q">
        <div class="q-label">Question</div>
        ${mcq.qEn ? `<div class="q-en">${esc(mcq.qEn)}</div>` : ''}
        ${mcq.qAs ? `<div class="q-as">${esc(mcq.qAs)}</div>` : ''}
      </div>
      <ul class="opts">
        ${opt('A', mcq.aEn, mcq.aAs)}${opt('B', mcq.bEn, mcq.bAs)}
        ${opt('C', mcq.cEn, mcq.cAs)}${opt('D', mcq.dEn, mcq.dAs)}
      </ul>
      <section class="explain">
        <div class="ex-head">Explanation <span class="as-head">ব্যাখ্যা</span></div>
        ${mcq.expEn ? `<p class="ex-en">${esc(mcq.expEn)}</p>` : ''}
        ${showRule ? `<div class="rule"></div>` : ''}
        ${mcq.expAs ? `<p class="ex-as">${esc(mcq.expAs)}</p>` : ''}
      </section>
      <div class="foot">
        <span class="set">${esc(mcq.set || '')}</span>
        <div class="foot-right">
          <span class="foot-subject">${esc(mcq.subject || '')}</span>
          <div class="foot-qr"></div>
        </div>
      </div>`;
  }

  function makeFrame(mcq, forExport) {
    const ratio = RATIOS[state.ratio];
    const f = document.createElement('div');
    f.className = `mcq-frame ${ratio.cls}`;
    f.dataset.h = ratio.h;
    if (forExport) {
      f.style.setProperty('--z', '1');
      f.style.position = 'static';
      f.style.transform = 'none';
    }
    f.innerHTML = buildFrameHTML(mcq);
    const qrEl = f.querySelector('.foot-qr');
    if (qrEl) renderQR(qrEl);
    return f;
  }

  function fitFrame(frame) {
    if (!frame) return;
    const explain = frame.querySelector('.explain');
    if (!explain) return;
    const test = f => {
      frame.style.setProperty('--ex-fit', String(f));
      void explain.offsetHeight;
      return explain.scrollHeight <= explain.clientHeight + 1;
    };
    if (test(1)) {
      let best = 1;
      for (let s = 1; s <= 5; s++) {
        const f = +(1 + s * 0.04).toFixed(2);
        if (!test(f)) break;
        best = f;
      }
      test(best);
    } else {
      for (let s = 1; s <= 12; s++) {
        const f = +(1 - s * 0.04).toFixed(2);
        if (f < 0.5) break;
        if (test(f)) return;
      }
      test(0.5);
    }
  }

  function scaleVP(vp, frame) {
    const w = vp.clientWidth;
    if (w < 1) return;
    const scale = w / 1080;
    frame.style.setProperty('--z', scale);
    vp.style.height = (parseInt(frame.dataset.h) * scale) + 'px';
  }

  function renderLive() {
    if (state.mode !== 'edit') return;
    const holder = $('mx-live-holder');
    holder.innerHTML = '';
    const mcqs = parseMCQs($('mx-input').value);
    const ratio = RATIOS[state.ratio];

    if (!mcqs.length) {
      const vp = document.createElement('div');
      vp.className = 'mcq-viewport';
      vp.style.aspectRatio = ratio.w + '/' + ratio.h;
      vp.innerHTML = '<div style="padding:40px;text-align:center;color:#999;font-family:Inter,sans-serif">Paste MCQ blocks separated by --- to see preview</div>';
      holder.appendChild(vp);
      $('mx-status').innerHTML = 'No MCQ blocks found. Separate each with <code>---</code>.';
      return;
    }

    const vp = document.createElement('div');
    vp.className = 'mcq-viewport';
    vp.style.aspectRatio = ratio.w + '/' + ratio.h;
    const frame = makeFrame(mcqs[0], false);
    frame.style.position = 'absolute';
    frame.style.top = '0';
    frame.style.left = '0';
    vp.appendChild(frame);
    holder.appendChild(vp);
    scaleVP(vp, frame);
    fitFrame(frame);
    document.fonts.ready.then(() => { if (state.mode === 'edit') fitFrame(frame); });
    $('mx-status').innerHTML = `<strong>${mcqs.length}</strong> MCQ${mcqs.length > 1 ? 's' : ''} · <strong>${mcqs.length}</strong> image${mcqs.length > 1 ? 's' : ''}<br><span style="color:#888;font-size:11px">One MCQ = one image</span>`;
  }

  async function reserveIds(count, subject) {
    const jobs = [];
    for (let i = 0; i < count; i++) jobs.push(PK_API.post('/api/ids/reserve', { type: 'MCQX', subject }));
    const results = await Promise.all(jobs);
    return results.map(r => r.id);
  }

  async function recordImage(id, subject) {
    try {
      await PK_API.post('/api/images', { id, type: 'MCQX', subject, meta: { ratio: state.ratio } });
    } catch (e) { console.warn(e); }
  }

  async function enterPreview() {
    const btn = $('mx-preview-btn');
    const overlay = $('exportOverlay');
    if (overlay) overlay.hidden = false;
    btn.disabled = true;
    btn.textContent = 'Analyzing…';
    try {
      await fontsReady();
      const mcqs = parseMCQs($('mx-input').value);
      if (!mcqs.length) { alert('Paste at least one MCQ block separated by ---.'); return; }
      state.mcqs = mcqs;
      btn.textContent = 'Reserving IDs…';
      const subject = mcqs[0].subject || 'General';
      state.ids = await reserveIds(mcqs.length, subject);
      state.downloaded = new Set();
      state.mode = 'result';
      $('mx-preview-edit').hidden = true;
      $('mx-preview-result').hidden = false;
      btn.hidden = true;
      $('mx-back-btn').hidden = false;
      renderResult();
    } catch (err) {
      console.error(err);
      alert('Analysis failed: ' + err.message);
      btn.disabled = false;
      btn.textContent = 'Analyze & Preview images';
    } finally {
      if (overlay) setTimeout(() => { overlay.hidden = true; }, 300);
    }
  }

  function exitPreview() {
    state.mode = 'edit';
    state.downloaded = new Set();
    $('mx-preview-edit').hidden = false;
    $('mx-preview-result').hidden = true;
    $('mx-preview-btn').hidden = false;
    $('mx-preview-btn').disabled = false;
    $('mx-preview-btn').textContent = 'Analyze & Preview images';
    $('mx-back-btn').hidden = true;
    renderLive();
  }

  function renderResult() {
    const total = state.mcqs.length;
    const ratio = RATIOS[state.ratio];
    $('mx-result-count').textContent = `${total} image${total > 1 ? 's' : ''} generated`;
    $('mx-result-breakdown').textContent = `${total} MCQs · 1 per image`;
    updateBadge();
    const grid = $('mx-result-grid');
    grid.innerHTML = '';
    for (let i = 0; i < total; i++) {
      const card = document.createElement('div');
      card.className = 'result-card';
      card.dataset.page = i;
      const preview = document.createElement('div');
      preview.className = 'result-preview';
      preview.style.aspectRatio = ratio.w + '/' + ratio.h;
      const vp = document.createElement('div');
      vp.className = 'mcq-viewport';
      vp.style.aspectRatio = ratio.w + '/' + ratio.h;
      vp.style.position = 'relative';
      const frame = makeFrame(state.mcqs[i], false);
      frame.style.position = 'absolute';
      frame.style.top = '0';
      frame.style.left = '0';
      vp.appendChild(frame);
      preview.appendChild(vp);
      card.appendChild(preview);
      requestAnimationFrame(() => { fitFrame(frame); scaleVP(vp, frame); });
      document.fonts.ready.then(() => fitFrame(frame));

      const meta = document.createElement('div');
      meta.className = 'result-meta';
      meta.innerHTML = `
        <div class="result-meta-text">
          <span class="result-meta-page">Image ${i + 1} <span style="color:#667085;font-weight:500;font-size:11px">· Q${i + 1}</span></span>
          <span class="result-meta-id">${esc(state.ids[i])}</span>
        </div>
        <button class="btn-download" data-page="${i}" type="button">Download</button>`;
      card.appendChild(meta);
      grid.appendChild(card);
      meta.querySelector('.btn-download').addEventListener('click', e => downloadPage(i, e.currentTarget));
    }
  }

  function updateBadge() {
    $('mx-result-badge').textContent = `${state.downloaded.size} / ${state.mcqs.length} downloaded`;
  }

  function markDownloaded(i) {
    state.downloaded.add(i);
    updateBadge();
    const card = document.querySelector(`.result-card[data-page="${i}"]`);
    if (card) {
      const b = card.querySelector('.btn-download');
      b.classList.add('done');
      b.textContent = 'Downloaded';
      b.disabled = true;
    }
  }

  async function downloadPage(i, btn) {
    if (isExporting) return;
    if (!global.html2canvas) { alert('Export library not loaded.'); return; }
    isExporting = true;
    const orig = btn.textContent;
    btn.disabled = true;
    btn.textContent = '…';
    const id = state.ids[i];
    const overlay = $('exportOverlay');
    if (overlay) overlay.hidden = false;
    await fontsReady();

    const off = document.createElement('div');
    off.style.cssText = 'position:fixed;left:-99999px;top:0;pointer-events:none';
    const frame = makeFrame(state.mcqs[i], true);
    off.appendChild(frame);
    document.body.appendChild(off);
    await waitFrame();
    await new Promise(r => setTimeout(r, 200));
    fitFrame(frame);
    await waitFrame();

    try {
      const canvas = await global.html2canvas(frame, {
        scale: 2, backgroundColor: null, useCORS: true, logging: false, imageTimeout: 15000
      });
      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = 'preparekora-' + id.replace(/\//g, '-') + '.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
      markDownloaded(i);
      btn.classList.add('done');
      btn.textContent = 'Downloaded';
      await recordImage(id, state.mcqs[i].subject || 'General');
    } catch (err) {
      console.error(err);
      alert('Download failed: ' + err.message);
      btn.textContent = orig;
      btn.disabled = false;
    } finally {
      off.remove();
      if (overlay) setTimeout(() => { overlay.hidden = true; }, 350);
      isExporting = false;
    }
  }

  function applyRatioUI() {
    document.querySelectorAll('[data-tool="mcq-explanation"] .ratio-btn').forEach(b => b.classList.toggle('active', b.dataset.ratio === state.ratio));
  }

  function loadPrefs() {
    const r = ls.get(PREF_KEY.ratio);
    if (r && RATIOS[r]) state.ratio = r;
    const i = ls.get(PREF_KEY.input);
    if (i) $('mx-input').value = i;
  }

  function wire() {
    const input = $('mx-input');
    if (!input) return;
    input.addEventListener('input', () => { ls.set(PREF_KEY.input, input.value); renderLive(); });
    document.querySelectorAll('[data-tool="mcq-explanation"] .ratio-btn').forEach(b => {
      b.addEventListener('click', () => {
        state.ratio = b.dataset.ratio;
        ls.set(PREF_KEY.ratio, state.ratio);
        applyRatioUI();
        renderLive();
      });
    });
    $('mx-preview-btn').addEventListener('click', enterPreview);
    $('mx-back-btn').addEventListener('click', exitPreview);
  }

  async function init() {
    if (initialized) return;
    initialized = true;
    loadPrefs();
    applyRatioUI();
    wire();
    await loadQR();
    renderLive();
  }

  function maybeInit() {
    if (!PK_AUTH || !PK_AUTH.isAdmin()) return;
    init();
  }

  global.addEventListener('pk:authchanged', e => { if (e.detail && e.detail.isAdmin) maybeInit(); });
  if (document.readyState !== 'loading') setTimeout(maybeInit, 200);
  else document.addEventListener('DOMContentLoaded', () => setTimeout(maybeInit, 200));
})(window);
