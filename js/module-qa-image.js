(function (global) {
  'use strict';

  const THEMES = [
    { id:'cream',    bg:'linear-gradient(135deg,#fef9f3 0%,#fdf2e9 100%)' },
    { id:'lavender', bg:'linear-gradient(135deg,#f5f3fb 0%,#ede7f6 100%)' },
    { id:'mint',     bg:'linear-gradient(135deg,#f0f8f3 0%,#e0f2e7 100%)' },
    { id:'sky',      bg:'linear-gradient(135deg,#f0f7fd 0%,#e3eef9 100%)' },
    { id:'rose',     bg:'linear-gradient(135deg,#fdf3f5 0%,#fce7ec 100%)' },
    { id:'butter',   bg:'linear-gradient(135deg,#fffdf0 0%,#fdf6d8 100%)' },
    { id:'grey',     bg:'linear-gradient(135deg,#f7f8fa 0%,#ecedf1 100%)' },
    { id:'coral',    bg:'linear-gradient(135deg,#fff5f0 0%,#ffe8de 100%)' },
    { id:'teal',     bg:'linear-gradient(135deg,#f0f9f8 0%,#dff1ef 100%)' },
    { id:'peach',    bg:'linear-gradient(135deg,#fff6f0 0%,#ffe9d8 100%)' }
  ];

  const RATIOS = {
    '1:1':  { w: 1080, h: 1080 },
    '3:4':  { w: 1080, h: 1440 },
    '4:5':  { w: 1080, h: 1350 },
    '9:16': { w: 1080, h: 1920 }
  };

  const PREF_KEYS = {
    format: 'qa_format', ratio: 'qa_ratio', layout: 'qa_layout',
    theme: 'qa_theme', subject: 'qa_subject', input: 'qa_input'
  };

  const DEFAULT_QR = 'https://chat.whatsapp.com/DLrcA98MrlYKOeZ5DMeN5Z';

  const state = {
    ratio: '4:5',
    layout: '2col',
    theme: 'cream',
    mode: 'edit',
    items: [],
    pages: [],
    pageIds: [],
    qrDestination: DEFAULT_QR,
    downloadedPages: new Set()
  };

  let initialized = false;
  let isExporting = false;

  const $ = id => document.getElementById(id);

  // ---------- HELPERS ----------
  function lsGet(k){ try { return localStorage.getItem(k); } catch { return null; } }
  function lsSet(k,v){ try { localStorage.setItem(k,v); } catch {} }

  function escapeHTML(s){
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  function waitFrame(){
    return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  }

  function fontsReady(){
    return new Promise(async resolve => {
      try {
        await Promise.all([
          document.fonts.load('700 16px Roboto'),
          document.fonts.load('600 16px Roboto'),
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

  // ---------- QR ----------
  function renderQR(container){
    if (!container || !global.QRCode || !state.qrDestination) return;
    container.innerHTML = '';
    try {
      new QRCode(container, {
        text: state.qrDestination,
        width: 224, height: 224,
        colorDark: '#000000', colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M
      });
    } catch (e) { console.warn('QR error:', e); }
  }

  async function loadQRDestination(){
    try {
      const res = await PK_API.get('/api/qr/qa-image');
      state.qrDestination = (res.qrDestination || '').trim() || DEFAULT_QR;
    } catch (e) {
      state.qrDestination = DEFAULT_QR;
    }
  }

  // ---------- PARSER (verbatim from site 2) ----------
  function splitInline(text){
    const t = (text || '').trim();
    if (!t) return { en:'', as:'' };
    const m = t.match(/^(.*?)\s*\(([^()]+)\)\s*$/);
    if (m && m[1].trim()) return { en: m[1].trim(), as: m[2].trim() };
    const onlyParens = t.match(/^\(([^()]+)\)$/);
    if (onlyParens) return { en:'', as: onlyParens[1].trim() };
    return { en: t, as: '' };
  }

  function parseQA(text){
    const items = []; let cur = null;
    for (const raw of String(text || '').split(/\r?\n/)){
      const line = raw.trim(); if (!line) continue;
      const q = line.match(/^Q\s*[:：]\s*(.*)$/i);
      if (q) {
        if (cur && cur.ansEn !== undefined) items.push(cur);
        const p = splitInline(q[1]);
        cur = { qEn: p.en, qAs: p.as, ansEn: undefined, ansAs: undefined };
        continue;
      }
      const a = line.match(/^Ans(?:wer)?\s*[:：]\s*(.*)$/i);
      if (a && cur) {
        const p = splitInline(a[1]);
        cur.ansEn = p.en; cur.ansAs = p.as;
        items.push(cur); cur = null;
      }
    }
    if (cur && cur.ansEn !== undefined) items.push(cur);
    return items;
  }

  function paginateRough(items, per){
    const pages = [];
    for (let i = 0; i < items.length; i += per) pages.push(items.slice(i, i + per));
    return pages;
  }

  // ---------- HTML BUILDERS ----------
  function buildQABlockHTML(item){
    const qParts = [];
    if (item.qEn) qParts.push(`<span class="qa-en">${escapeHTML(item.qEn)}</span>`);
    if (item.qAs) qParts.push(`<span class="qa-as">(${escapeHTML(item.qAs)})</span>`);
    if (!qParts.length) qParts.push(`<span class="qa-en">—</span>`);
    const aParts = [];
    if (item.ansEn) aParts.push(`<span class="qa-en">${escapeHTML(item.ansEn)}</span>`);
    if (item.ansAs) aParts.push(`<span class="qa-as">(${escapeHTML(item.ansAs)})</span>`);
    if (!aParts.length) aParts.push(`<span class="qa-en">—</span>`);
    return `
      <div class="qa-item">
        <div class="qa-line qa-q"><span class="qa-lbl">Q</span>
          <div class="qa-content">${qParts.join(' ')}</div></div>
        <div class="qa-line"><span class="qa-lbl qa-lbl-a">Ans</span>
          <div class="qa-content">${aParts.join(' ')}</div></div>
      </div>`;
  }

  function buildQABodyHTML(items){
    if (state.layout === '2col' && items.length > 1) {
      const half = Math.ceil(items.length / 2);
      return `<div class="qa-2col">
        <div class="qa-col">${items.slice(0, half).map(buildQABlockHTML).join('')}</div>
        <div class="qa-col">${items.slice(half).map(buildQABlockHTML).join('')}</div>
      </div>`;
    }
    return `<div class="qa-1col">${items.map(buildQABlockHTML).join('')}</div>`;
  }

  function buildQAPageHTML(items, pageIndex, totalPages, idOverride){
    const subject = $('qa-subject').value.trim();
    const id = idOverride || (state.pageIds[pageIndex] || 'PK/1.0/QA/.../----');
    return `
      <header class="poster-header">
        <div class="ph-brand">preparekora<span class="ph-domain">.in</span></div>
        <div class="ph-subject">${escapeHTML(subject || 'Subject')}</div>
        <div class="ph-id">${escapeHTML(id)}</div>
      </header>
      <section class="poster-body"><div class="poster-body-inner">${buildQABodyHTML(items)}</div></section>
      <footer class="poster-footer">
        <span class="pf-brand">preparekora.in</span>
        <span class="pf-page">${pageIndex + 1} / ${totalPages}</span>
        <div class="pf-qr"></div>
      </footer>`;
  }

  // ---------- LIVE PREVIEW ----------
  function renderLive(){
    if (state.mode !== 'edit') return;
    const holder = $('qa-live-holder');
    if (!holder) return;
    holder.innerHTML = '';

    const items = parseQA($('qa-input').value);
    const pages = paginateRough(items, 10);
    const totalPages = Math.max(pages.length, 1);

    const poster = document.createElement('div');
    poster.className = 'poster';
    poster.setAttribute('data-theme', state.theme);
    poster.style.setProperty('--aspect-ratio', state.ratio.replace(':', '/'));

    if (!items.length) {
      poster.innerHTML = buildQAPageHTML([], 0, 1, 'PK/1.0/QA/----');
      poster.querySelector('.poster-body-inner').innerHTML =
        '<div class="empty-state">Paste Q&amp;A to see preview</div>';
    } else {
      poster.innerHTML = buildQAPageHTML(pages[0], 0, totalPages);
    }

    holder.appendChild(poster);
    renderQR(poster.querySelector('.pf-qr'));

    const status = $('qa-status');
    if (status) {
      status.innerHTML = `<strong>${items.length}</strong> Q&amp;A · <strong>${totalPages}</strong> page${totalPages > 1 ? 's' : ''} (approx)<br><span style="color:#888;font-size:11px">Click Preview for accurate fit</span>`;
    }
  }

  // ---------- ACCURATE PAGINATION ----------
  async function computeQAPages(items){
    if (!items.length) return [];
    const ratio = RATIOS[state.ratio];
    const posterH = Math.round(540 * ratio.h / ratio.w);

    const measure = document.createElement('div');
    measure.className = 'poster';
    measure.setAttribute('data-theme', state.theme);
    measure.style.cssText = `position:fixed;left:-99999px;top:0;width:540px;height:${posterH}px;visibility:hidden;pointer-events:none`;
    measure.style.setProperty('--aspect-ratio', `${ratio.w}/${ratio.h}`);
    measure.innerHTML = `
      <header class="poster-header">
        <div class="ph-brand">preparekora<span class="ph-domain">.in</span></div>
        <div class="ph-subject">x</div>
        <div class="ph-id">PK/1.0/QA/x/0000</div>
      </header>
      <section class="poster-body"><div class="poster-body-inner"></div></section>
      <footer class="poster-footer">
        <span class="pf-brand">preparekora.in</span>
        <span class="pf-page">1/1</span>
        <div class="pf-qr" style="width:48px;height:48px"></div>
      </footer>`;
    document.body.appendChild(measure);
    await waitFrame();

    const body = measure.querySelector('.poster-body');
    const inner = measure.querySelector('.poster-body-inner');
    const fits = subset => {
      inner.innerHTML = buildQABodyHTML(subset);
      void inner.offsetHeight;
      return body.scrollHeight <= body.clientHeight + 1;
    };

    const greedy = [];
    let i = 0;
    while (i < items.length) {
      let n = 1;
      while (i + n <= items.length && fits(items.slice(i, i + n))) n++;
      n--;
      if (n < 1) n = 1;
      greedy.push(items.slice(i, i + n));
      i += n;
    }

    let result = greedy;
    if (greedy.length > 1) {
      const balanced = [];
      let s = 0;
      while (s < items.length) {
        const left = greedy.length - balanced.length;
        const remain = items.length - s;
        const target = Math.ceil(remain / Math.max(1, left));
        let n = target;
        while (n > 1 && !fits(items.slice(s, s + n))) n--;
        if (n < 1) n = 1;
        balanced.push(items.slice(s, s + n));
        s += n;
      }
      if (balanced.length <= greedy.length) result = balanced;
    }

    measure.remove();
    return result;
  }

  // ---------- WORKER IDS ----------
  async function reserveIds(count, subject){
    const jobs = [];
    for (let i = 0; i < count; i++) {
      jobs.push(PK_API.post('/api/ids/reserve', { type: 'QA', subject }));
    }
    const results = await Promise.all(jobs);
    return results.map(r => r.id);
  }

  async function recordImage(id, subject, itemCount){
    try {
      await PK_API.post('/api/images', {
        id, type: 'QA', subject,
        meta: {
          ratio: state.ratio,
          theme: state.theme,
          layout: state.layout,
          itemCount
        }
      });
    } catch (e) {
      console.warn('Failed to record image:', e);
    }
  }

  // ---------- ANALYZE ----------
  async function enterPreviewMode(){
    const overlay = $('exportOverlay');
    const previewBtn = $('qa-preview-btn');
    const subject = $('qa-subject').value.trim();

    if (overlay) overlay.hidden = false;
    previewBtn.disabled = true;
    previewBtn.textContent = 'Analyzing…';

    try {
      await fontsReady();

      const items = parseQA($('qa-input').value);
      if (!items.length) {
        alert('Please paste at least one Q&A.');
        return;
      }

      if (!subject) {
        alert('Please enter a subject.');
        return;
      }

      const pages = await computeQAPages(items);
      state.items = items;
      state.pages = pages;

      previewBtn.textContent = 'Reserving IDs…';
      state.pageIds = await reserveIds(pages.length, subject);

      state.downloadedPages = new Set();
      state.mode = 'result';

      $('qa-preview-edit').hidden = true;
      $('qa-preview-result').hidden = false;
      previewBtn.hidden = true;
      $('qa-back-btn').hidden = false;

      renderResultView();
    } catch (err) {
      console.error(err);
      alert('Analysis failed: ' + err.message);
      previewBtn.disabled = false;
      previewBtn.textContent = 'Analyze & Preview images';
    } finally {
      if (overlay) setTimeout(() => { overlay.hidden = true; }, 300);
    }
  }

  function exitPreviewMode(){
    state.mode = 'edit';
    state.downloadedPages = new Set();
    $('qa-preview-edit').hidden = false;
    $('qa-preview-result').hidden = true;
    $('qa-preview-btn').hidden = false;
    $('qa-preview-btn').disabled = false;
    $('qa-preview-btn').textContent = 'Analyze & Preview images';
    $('qa-back-btn').hidden = true;
    renderLive();
  }

  function renderResultView(){
    const total = state.pages.length;
    const ratio = RATIOS[state.ratio];

    $('qa-result-count').textContent = `${total} image${total > 1 ? 's' : ''} generated`;
    $('qa-result-breakdown').textContent =
      state.pages.map((p, i) => `P${i + 1}: ${p.length} Q`).join('  ·  ');
    updateBadge();

    const grid = $('qa-result-grid');
    grid.innerHTML = '';

    for (let i = 0; i < total; i++) {
      const card = document.createElement('div');
      card.className = 'result-card';
      card.dataset.page = i;

      const preview = document.createElement('div');
      preview.className = 'result-preview';
      preview.style.aspectRatio = ratio.w + '/' + ratio.h;

      const pv = document.createElement('div');
      pv.className = 'poster-viewport';
      pv.style.aspectRatio = ratio.w + '/' + ratio.h;

      const poster = document.createElement('div');
      poster.className = 'poster';
      poster.setAttribute('data-theme', state.theme);
      poster.style.setProperty('--aspect-ratio', state.ratio.replace(':', '/'));
      poster.innerHTML = buildQAPageHTML(state.pages[i], i, total, state.pageIds[i]);
      pv.appendChild(poster);
      preview.appendChild(pv);
      card.appendChild(preview);

      requestAnimationFrame(() => {
        const z = pv.clientWidth / 540;
        poster.style.setProperty('--z', z);
        poster.style.transform = `scale(${z})`;
        poster.style.transformOrigin = 'top left';
        poster.style.position = 'absolute';
        poster.style.top = '0';
        poster.style.left = '0';
        poster.style.maxWidth = 'none';
        poster.style.borderRadius = '0';
        poster.style.border = 'none';
        poster.style.boxShadow = 'none';
      });
      renderQR(poster.querySelector('.pf-qr'));

      const meta = document.createElement('div');
      meta.className = 'result-meta';
      meta.innerHTML = `
        <div class="result-meta-text">
          <span class="result-meta-page">Image ${i + 1} <span class="rmp-count" style="color:#667085;font-weight:500;font-size:11px">· ${state.pages[i].length} items</span></span>
          <span class="result-meta-id">${escapeHTML(state.pageIds[i])}</span>
        </div>
        <button class="btn-download" data-page="${i}" type="button">Download</button>`;
      card.appendChild(meta);

      grid.appendChild(card);
      meta.querySelector('.btn-download').addEventListener('click', e => {
        downloadPage(i, e.currentTarget);
      });
    }
  }

  function updateBadge(){
    $('qa-result-badge').textContent =
      `${state.downloadedPages.size} / ${state.pages.length} downloaded`;
  }

  function markDownloaded(i){
    state.downloadedPages.add(i);
    updateBadge();
    const card = document.querySelector(`.result-card[data-page="${i}"]`);
    if (card) {
      const btn = card.querySelector('.btn-download');
      btn.classList.add('done');
      btn.textContent = 'Downloaded';
      btn.disabled = true;
    }
  }

  // ---------- DOWNLOAD ----------
  async function downloadPage(i, btnEl){
    if (isExporting) return;
    if (!global.html2canvas) { alert('Export library not loaded.'); return; }

    isExporting = true;
    const orig = btnEl.textContent;
    btnEl.disabled = true;
    btnEl.textContent = '…';

    const id = state.pageIds[i];
    const ratio = RATIOS[state.ratio];
    const overlay = $('exportOverlay');
    if (overlay) overlay.hidden = false;

    await fontsReady();

    const off = document.createElement('div');
    off.style.cssText = 'position:fixed;left:-99999px;top:0;pointer-events:none';
    const posterH = Math.round(540 * ratio.h / ratio.w);
    const poster = document.createElement('div');
    poster.className = 'poster';
    poster.setAttribute('data-theme', state.theme);
    poster.style.cssText = `width:540px;height:${posterH}px;`;
    poster.style.setProperty('--aspect-ratio', state.ratio.replace(':', '/'));
    poster.innerHTML = buildQAPageHTML(state.pages[i], i, state.pages.length, id);
    off.appendChild(poster);
    renderQR(poster.querySelector('.pf-qr'));
    document.body.appendChild(off);

    await waitFrame();
    await new Promise(r => setTimeout(r, 200));

    try {
      const canvas = await global.html2canvas(poster, {
        scale: 4,
        backgroundColor: null,
        useCORS: true,
        logging: false,
        imageTimeout: 15000
      });

      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = 'preparekora-' + id.replace(/\//g, '-') + '.png';
      document.body.appendChild(a);
      a.click();
      a.remove();

      markDownloaded(i);
      btnEl.classList.add('done');
      btnEl.textContent = 'Downloaded';

      await recordImage(id, $('qa-subject').value.trim(), state.pages[i].length);
    } catch (err) {
      console.error(err);
      alert('Download failed: ' + err.message);
      btnEl.textContent = orig;
      btnEl.disabled = false;
    } finally {
      off.remove();
      if (overlay) setTimeout(() => { overlay.hidden = true; }, 350);
      isExporting = false;
    }
  }

  // ---------- UI WIRING ----------
  function renderThemeGrid(){
    const grid = $('qa-theme-grid');
    grid.innerHTML = '';
    THEMES.forEach(t => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'theme-swatch' + (t.id === state.theme ? ' active' : '');
      btn.dataset.theme = t.id;
      btn.title = t.id;
      btn.style.background = t.bg;
      btn.addEventListener('click', () => {
        state.theme = t.id;
        lsSet(PREF_KEYS.theme, t.id);
        document.querySelectorAll('[data-tool="qa-image"] .theme-swatch').forEach(b =>
          b.classList.toggle('active', b.dataset.theme === t.id));
        renderLive();
      });
      grid.appendChild(btn);
    });
  }

  function applyRatioUI(){
    document.querySelectorAll('[data-tool="qa-image"] .ratio-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.ratio === state.ratio));
  }

  function applyLayoutUI(){
    document.querySelectorAll('[data-tool="qa-image"] .layout-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.layout === state.layout));
  }

  function loadPrefs(){
    const sr = lsGet(PREF_KEYS.ratio);
    if (sr && RATIOS[sr]) state.ratio = sr;
    const sl = lsGet(PREF_KEYS.layout);
    if (sl === '1col' || sl === '2col') state.layout = sl;
    const st = lsGet(PREF_KEYS.theme);
    if (st && THEMES.some(t => t.id === st)) state.theme = st;
    const ss = lsGet(PREF_KEYS.subject);
    if (ss) $('qa-subject').value = ss;
    const si = lsGet(PREF_KEYS.input);
    if (si) $('qa-input').value = si;
  }

  function wire(){
    const input = $('qa-input');
    const subject = $('qa-subject');
    if (!input || !subject) return;

    input.addEventListener('input', () => {
      lsSet(PREF_KEYS.input, input.value);
      renderLive();
    });
    subject.addEventListener('input', () => {
      lsSet(PREF_KEYS.subject, subject.value);
      renderLive();
    });

    document.querySelectorAll('[data-tool="qa-image"] .ratio-btn').forEach(b => {
      b.addEventListener('click', () => {
        state.ratio = b.dataset.ratio;
        lsSet(PREF_KEYS.ratio, state.ratio);
        applyRatioUI();
        renderLive();
      });
    });
    document.querySelectorAll('[data-tool="qa-image"] .layout-btn').forEach(b => {
      b.addEventListener('click', () => {
        state.layout = b.dataset.layout;
        lsSet(PREF_KEYS.layout, state.layout);
        applyLayoutUI();
        renderLive();
      });
    });

    $('qa-preview-btn').addEventListener('click', enterPreviewMode);
    $('qa-back-btn').addEventListener('click', exitPreviewMode);
  }

  async function init(){
    if (initialized) return;
    initialized = true;

    loadPrefs();
    applyRatioUI();
    applyLayoutUI();
    renderThemeGrid();
    wire();
    await loadQRDestination();
    renderLive();

    console.log('[QA Image] initialized · qr:', state.qrDestination);
  }

  function maybeInit(){
    if (!PK_AUTH || !PK_AUTH.isAdmin()) return;
    init();
  }

  global.addEventListener('pk:authchanged', e => {
    if (e.detail && e.detail.isAdmin) maybeInit();
  });
  if (document.readyState !== 'loading') {
    setTimeout(maybeInit, 200);
  } else {
    document.addEventListener('DOMContentLoaded', () => setTimeout(maybeInit, 200));
  }
})(window);
