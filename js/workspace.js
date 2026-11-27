(function (global) {
  'use strict';
  const $ = id => document.getElementById(id);

  const state = { questionType: 'direct', ratio: '4:3' };

  const RATIO_DIMS = {
    '1:1': { w: 1080, h: 1080 },
    '4:3': { w: 1440, h: 1080 },
    '3:4': { w: 1080, h: 1440 },
    '16:9': { w: 1920, h: 1080 }
  };

  function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function switchTab(name) {
    document.querySelectorAll('.ws-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    $('createTab').classList.toggle('active', name === 'create');
    $('createTab').hidden = name !== 'create';
    $('settingsTab').hidden = name !== 'settings';
    $('settingsTab').classList.toggle('active', name === 'settings');
    if (name === 'settings') renderSettings();
    if (name === 'create') renderPreview();
  }

  function loadSubjectDropdown() {
    const cfg = PKStore.loadCfg();
    const sel = $('inpSubject');
    const prev = sel.value;
    sel.innerHTML = '';
    cfg.subjects.forEach(s => {
      const o = document.createElement('option');
      o.value = s.code;
      o.textContent = `${s.name} (${s.code})`;
      sel.appendChild(o);
    });
    if (prev && cfg.subjects.some(s => s.code === prev)) sel.value = prev;
  }

  function readForm() {
    const cfg = PKStore.loadCfg();
    const code = $('inpSubject').value;
    const subj = cfg.subjects.find(s => s.code === code);
    const d = {
      type: state.questionType,
      subjectCode: code,
      subjectName: subj ? subj.name : '',
      question: $('inpQuestion').value.trim(),
      questionAs: $('inpQuestionAs').value.trim(),
      ratio: state.ratio
    };
    if (state.questionType === 'direct') {
      d.answer = $('inpAnswer').value.trim();
      d.answerAs = $('inpAnswerAs').value.trim();
    } else {
      d.options = {
        A: $('inpOptA').value.trim(), B: $('inpOptB').value.trim(),
        C: $('inpOptC').value.trim(), D: $('inpOptD').value.trim()
      };
      d.optionsAs = {
        A: $('inpOptAAs').value.trim(), B: $('inpOptBAs').value.trim(),
        C: $('inpOptCAs').value.trim(), D: $('inpOptDAs').value.trim()
      };
      d.correct = $('inpCorrect').value;
      d.explanation = $('inpExplanation').value.trim();
      d.explanationAs = $('inpExplanationAs').value.trim();
    }
    return d;
  }

  function validate(d) {
    const e = [];
    if (!d.subjectCode) e.push('Select a subject.');
    if (!d.question) e.push('Question is required.');
    if (d.type === 'direct') { if (!d.answer) e.push('Direct answer is required.'); }
    else {
      ['A','B','C','D'].forEach(L => { if (!d.options[L]) e.push(`Option ${L} is required.`); });
      if (!d.explanation) e.push('Explanation is required.');
    }
    return e;
  }

  function setType(t) {
    state.questionType = t;
    document.querySelectorAll('.seg-btn').forEach(b => b.classList.toggle('active', b.dataset.type === t));
    $('directFields').hidden = t !== 'direct';
    $('optionsFields').hidden = t !== 'options';
    renderPreview();
  }

  function setRatio(r) {
    state.ratio = r;
    document.querySelectorAll('.ratio-btn').forEach(b => b.classList.toggle('active', b.dataset.ratio === r));
    renderPreview();
  }

  function buildPosterHTML(d, id) {
    const cfg = PKStore.loadCfg();
    const top = cfg.branding.topBrand || 'preparekora.in';
    const bottom = cfg.branding.bottomBrand || 'preparekora.in';
    const subject = (d.subjectName || 'SUBJECT').toUpperCase();

    const header = `<div class="header">
      <div class="h-brand">${esc(top)}</div>
      <div class="h-subject">${esc(subject)}</div>
      <div class="h-badge">${esc(id)}</div>
    </div>`;

    const footer = `<div class="footer">
      <div class="f-left">${esc(bottom)}</div>
      <div class="f-page">1 / 1</div>
      <div class="f-qr"></div>
    </div>`;

    let body;
    if (d.type === 'direct') {
      const qAs = d.questionAs ? ` <span class="as-inline">(${esc(d.questionAs)})</span>` : '';
      const aAs = d.answerAs ? ` <span class="as-inline">(${esc(d.answerAs)})</span>` : '';
      body = `<div class="list"><div class="item">
        <div class="row"><div class="marker">Q</div><div class="text">${esc(d.question)}${qAs}</div></div>
        <div class="row"><div class="marker">Ans</div><div class="ans-text">${esc(d.answer)}${aAs}</div></div>
      </div></div>`;
    } else {
      const opt = L => {
        const as = d.optionsAs[L] ? ` <span class="as-inline">(${esc(d.optionsAs[L])})</span>` : '';
        return `<div class="opt${d.correct === L ? ' correct' : ''}"><div class="key">${L}</div><div>${esc(d.options[L])}${as}</div></div>`;
      };
      const qAs = d.questionAs ? ` <span class="as-inline">(${esc(d.questionAs)})</span>` : '';
      const expAs = d.explanationAs ? `<div class="divider"></div><div class="exp-as">${esc(d.explanationAs)}</div>` : '';
      body = `<div class="list"><div class="item">
        <div class="q-row"><div class="marker">Q</div><div class="q-text">${esc(d.question)}${qAs}</div></div>
        <div class="options-grid">${opt('A')}${opt('B')}${opt('C')}${opt('D')}</div>
        <div class="explanation">
          <div class="exp-label">Explanation</div>
          <div class="exp-text">${esc(d.explanation)}</div>
          ${expAs}
        </div>
      </div></div>`;
    }

    return `<div class="poster" data-type="${d.type}" data-ratio="${d.ratio}">${header}${body}${footer}</div>`;
  }

  function applyDimsAndTypo(p) {
    const c = PKStore.loadCfg();
    const dims = RATIO_DIMS[p.dataset.ratio] || RATIO_DIMS['4:3'];
    p.style.width = dims.w + 'px';
    p.style.height = dims.h + 'px';
    p.style.setProperty('--fs-q', c.typography.questionSize + 'px');
    p.style.setProperty('--fs-a', c.typography.answerSize + 'px');
    p.style.setProperty('--fs-o', c.typography.optionSize + 'px');
    p.style.setProperty('--fs-e', c.typography.explanationSize + 'px');
    p.style.setProperty('--fs-h', c.typography.brandSize + 'px');
    p.style.setProperty('--fs-b', c.typography.subjectSize + 'px');
  }

  function fitPoster(p) {
    const body = p.querySelector('.list');
    if (!body) return;
    const c = PKStore.loadCfg();
    const base = {
      q: c.typography.questionSize,
      a: c.typography.answerSize,
      o: c.typography.optionSize,
      e: c.typography.explanationSize
    };
    let scale = 1;
    const set = s => {
      p.style.setProperty('--fs-q', (base.q * s) + 'px');
      p.style.setProperty('--fs-a', (base.a * s) + 'px');
      p.style.setProperty('--fs-o', (base.o * s) + 'px');
      p.style.setProperty('--fs-e', (base.e * s) + 'px');
    };
    set(1);
    for (let i = 0; i < 40; i++) {
      if (body.scrollHeight <= body.clientHeight + 1) break;
      scale -= 0.03;
      if (scale < 0.45) { set(0.45); break; }
      set(scale);
    }
  }

  function scaleViewport(poster, vp) {
    const w = vp.clientWidth;
    const pw = parseInt(poster.style.width) || 1080;
    const s = w / pw;
    poster.style.position = 'absolute';
    poster.style.top = '0';
    poster.style.left = '0';
    poster.style.transformOrigin = 'top left';
    poster.style.transform = `scale(${s})`;
    const dims = RATIO_DIMS[poster.dataset.ratio] || RATIO_DIMS['4:3'];
    vp.style.aspectRatio = `${dims.w} / ${dims.h}`;
  }

  function renderQR(container, url) {
    if (!container) return;
    container.innerHTML = '';
    if (!url || !global.QRCode) return;
    try { new QRCode(container, { text: url, width: 200, height: 200, correctLevel: QRCode.CorrectLevel.M }); } catch {}
  }

  function renderPreview() {
    const d = readForm();
    const cfg = PKStore.loadCfg();
    const seq = PKStore.loadSeq();
    const nextId = d.subjectCode ? PKStore.peekNextId(cfg, seq, d.subjectCode) : `${cfg.idSettings.prefix}/.../--/--`;

    const vp = $('posterViewport');
    vp.innerHTML = buildPosterHTML(d, nextId);
    const poster = vp.querySelector('.poster');
    applyDimsAndTypo(poster);
    renderQR(poster.querySelector('.f-qr'), cfg.branding.qrUrl);
    requestAnimationFrame(() => { fitPoster(poster); scaleViewport(poster, vp); });

    $('previewId').textContent = nextId;

    const errs = validate(d);
    const status = $('formStatus');
    if (errs.length) { status.textContent = errs[0]; status.className = 'form-status error'; }
    else { status.textContent = 'Ready to generate.'; status.className = 'form-status success'; }

    $('downloadBtn').disabled = errs.length > 0;
  }

  async function handleDownload() {
    if (!global.html2canvas) { alert('Export library failed to load. Check your connection.'); return; }
    const d = readForm();
    const errs = validate(d);
    if (errs.length) { alert(errs[0]); return; }

    const cfg = PKStore.loadCfg();
    const seq = PKStore.loadSeq();
    const entry = PKStore.reserveId(cfg, seq, d.subjectCode, d.subjectName);

    const off = document.createElement('div');
    off.style.cssText = 'position:fixed;left:-99999px;top:0;pointer-events:none';
    off.innerHTML = buildPosterHTML(d, entry.id);
    const poster = off.querySelector('.poster');
    applyDimsAndTypo(poster);
    renderQR(poster.querySelector('.f-qr'), cfg.branding.qrUrl);
    document.body.appendChild(off);

    await new Promise(r => setTimeout(r, 300));
    fitPoster(poster);

    try {
      const canvas = await global.html2canvas(poster, { scale: 2, backgroundColor: '#fafbfc', useCORS: true, logging: false });
      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = entry.id.replace(/\//g, '-') + '.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => renderPreview(), 250);
    } catch (e) {
      alert('Download failed: ' + (e.message || e));
    } finally {
      off.remove();
    }
  }

  // ===== SETTINGS =====
  function renderSettings() {
    const cfg = PKStore.loadCfg();
    $('setPassword').value = '';

    const list = $('subjectList');
    list.innerHTML = '';
    cfg.subjects.forEach(s => {
      const row = document.createElement('div');
      row.className = 'subject-row';
      row.innerHTML = `
        <input class="subj-name-edit input" style="flex:1;min-width:100px" value="${esc(s.name)}" data-code="${esc(s.code)}">
        <input class="subj-code-edit input" style="max-width:90px" value="${esc(s.code)}" data-code="${esc(s.code)}">
        <button class="btn-secondary subj-save" data-code="${esc(s.code)}" type="button">Save</button>
        <button class="subj-remove" data-code="${esc(s.code)}" type="button">Remove</button>`;
      list.appendChild(row);
    });
    list.querySelectorAll('.subj-save').forEach(b => b.addEventListener('click', () => saveSubjectEdit(b.dataset.code)));
    list.querySelectorAll('.subj-remove').forEach(b => b.addEventListener('click', () => removeSubject(b.dataset.code)));

    $('setIdPrefix').value = cfg.idSettings.prefix;
    $('setPerSet').value = cfg.idSettings.perSet;
    $('setStartSet').value = cfg.idSettings.startSet;
    $('setStartQ').value = cfg.idSettings.startQ;
    $('fsQuestion').value = cfg.typography.questionSize;
    $('fsOption').value = cfg.typography.optionSize;
    $('fsAnswer').value = cfg.typography.answerSize;
    $('fsExplanation').value = cfg.typography.explanationSize;
    $('setTopBrand').value = cfg.branding.topBrand || '';
    $('setBottomBrand').value = cfg.branding.bottomBrand || '';
    $('setQrUrl').value = cfg.branding.qrUrl || '';

    const seq = PKStore.loadSeq();
    const seqList = $('seqList');
    seqList.innerHTML = '';
    cfg.subjects.forEach(s => {
      const id = PKStore.peekNextId(cfg, seq, s.code);
      const r = document.createElement('div');
      r.className = 'seq-row';
      r.innerHTML = `<span>${esc(s.name)}</span><span class="seq-val">${esc(id)}</span>`;
      seqList.appendChild(r);
    });

    renderHistory();
  }

  function renderHistory() {
    const hist = PKStore.loadHistory();
    const el = $('historyList');
    if (!el) return;
    if (!hist.length) { el.innerHTML = '<p class="settings-help">No IDs generated yet.</p>'; return; }
    const rows = hist.slice().reverse().map(h => {
      const dt = new Date(h.createdAt);
      const dateStr = dt.toLocaleDateString() + ' ' + dt.toLocaleTimeString();
      return `<tr>
        <td style="font-family:ui-monospace,monospace;font-size:12px">${esc(h.id)}</td>
        <td>${esc(h.subjectName)}</td>
        <td>${esc(h.subjectCode)}</td>
        <td style="text-align:center">${h.set}</td>
        <td style="text-align:center">${h.question}</td>
        <td style="font-size:12px;color:var(--muted)">${esc(dateStr)}</td>
      </tr>`;
    }).join('');
    el.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead><tr style="text-align:left;border-bottom:1px solid var(--border)">
        <th style="padding:8px 4px">ID</th>
        <th style="padding:8px 4px">Subject</th>
        <th style="padding:8px 4px">Code</th>
        <th style="padding:8px 4px;text-align:center">Set</th>
        <th style="padding:8px 4px;text-align:center">Q#</th>
        <th style="padding:8px 4px">Generated</th>
      </tr></thead>
      <tbody>${rows}</tbody></table>`;
  }

  function saveSubjectEdit(oldCode) {
    const row = document.querySelector(`.subj-name-edit[data-code="${oldCode}"]`).closest('.subject-row');
    const newName = row.querySelector('.subj-name-edit').value.trim();
    const newCode = row.querySelector('.subj-code-edit').value.trim().toUpperCase();
    if (!newName) { alert('Subject name required.'); return; }
    if (!/^[A-Z0-9]{1,8}$/.test(newCode)) { alert('Code must be 1–8 letters/numbers.'); return; }
    const cfg = PKStore.loadCfg();
    if (newCode !== oldCode && cfg.subjects.some(s => s.code === newCode)) { alert('Code already used.'); return; }
    const subj = cfg.subjects.find(s => s.code === oldCode);
    if (!subj) return;
    subj.name = newName;
    subj.code = newCode;
    PKStore.saveCfg(cfg);
    if (newCode !== oldCode) {
      const seq = PKStore.loadSeq();
      if (seq[oldCode]) { seq[newCode] = seq[oldCode]; delete seq[oldCode]; PKStore.saveSeq(seq); }
    }
    renderSettings();
    loadSubjectDropdown();
  }

  function removeSubject(code) {
    const cfg = PKStore.loadCfg();
    if (cfg.subjects.length <= 1) { alert('At least one subject must remain.'); return; }
    if (!confirm(`Remove subject "${code}"?`)) return;
    cfg.subjects = cfg.subjects.filter(s => s.code !== code);
    PKStore.saveCfg(cfg);
    const seq = PKStore.loadSeq();
    delete seq[code];
    PKStore.saveSeq(seq);
    renderSettings();
    loadSubjectDropdown();
  }

  function addSubject() {
    const name = $('newSubjectName').value.trim();
    const code = $('newSubjectCode').value.trim().toUpperCase();
    if (!name) { msg('subjMsg', 'Enter a subject name.', false); return; }
    if (!/^[A-Z0-9]{1,8}$/.test(code)) { msg('subjMsg', 'Code must be 1–8 letters/numbers.', false); return; }
    const cfg = PKStore.loadCfg();
    if (cfg.subjects.some(s => s.code === code)) { msg('subjMsg', 'Code already exists.', false); return; }
    cfg.subjects.push({ name, code });
    PKStore.saveCfg(cfg);
    $('newSubjectName').value = '';
    $('newSubjectCode').value = '';
    msg('subjMsg', 'Subject added.', true);
    renderSettings();
    loadSubjectDropdown();
  }

  function msg(id, text, ok) {
    const el = $(id);
    el.textContent = text;
    el.className = 'field-msg' + (ok ? ' success' : '');
  }

  function savePassword() {
    const v = $('setPassword').value.trim();
    if (!/^\d{4,12}$/.test(v)) { msg('pwMsg', 'Password must be 4–12 digits.', false); return; }
    const cfg = PKStore.loadCfg();
    cfg.password = v;
    PKStore.saveCfg(cfg);
    $('setPassword').value = '';
    msg('pwMsg', 'Password updated.', true);
  }

  function clamp(n, min, max, fb) {
    if (!Number.isFinite(n)) return fb;
    return Math.max(min, Math.min(max, n));
  }

  function wireSettings() {
    $('savePassword').addEventListener('click', savePassword);
    $('addSubjectBtn').addEventListener('click', addSubject);

    const idFields = {
      setIdPrefix: (c, v) => c.idSettings.prefix = v.toUpperCase(),
      setPerSet: (c, v) => c.idSettings.perSet = Math.max(1, Number(v) || 99),
      setStartSet: (c, v) => c.idSettings.startSet = Math.max(1, Number(v) || 1),
      setStartQ: (c, v) => c.idSettings.startQ = Math.max(1, Number(v) || 1)
    };
    Object.keys(idFields).forEach(id => {
      $(id).addEventListener('change', () => {
        const c = PKStore.loadCfg();
        idFields[id](c, $(id).value);
        PKStore.saveCfg(c);
        renderSettings();
      });
    });

    const tyFields = {
      fsQuestion: (c, v) => c.typography.questionSize = clamp(Number(v), 12, 60, 24),
      fsOption: (c, v) => c.typography.optionSize = clamp(Number(v), 10, 40, 20),
      fsAnswer: (c, v) => c.typography.answerSize = clamp(Number(v), 12, 48, 24),
      fsExplanation: (c, v) => c.typography.explanationSize = clamp(Number(v), 10, 40, 20)
    };
    Object.keys(tyFields).forEach(id => {
      $(id).addEventListener('change', () => {
        const c = PKStore.loadCfg();
        tyFields[id](c, $(id).value);
        PKStore.saveCfg(c);
        renderPreview();
      });
    });

    const brFields = {
      setTopBrand: (c, v) => c.branding.topBrand = v,
      setBottomBrand: (c, v) => c.branding.bottomBrand = v,
      setQrUrl: (c, v) => c.branding.qrUrl = v
    };
    Object.keys(brFields).forEach(id => {
      $(id).addEventListener('change', () => {
        const c = PKStore.loadCfg();
        brFields[id](c, $(id).value.trim());
        PKStore.saveCfg(c);
        renderPreview();
      });
    });

    $('resetAllSeq').addEventListener('click', () => {
      if (!confirm('Reset all subject sequences to the starting set/question?')) return;
      const c = PKStore.loadCfg();
      PKStore.resetAllSeq(c);
      renderSettings();
      renderPreview();
    });
  }

  function wireCreate() {
    document.querySelectorAll('.ws-tab').forEach(t => t.addEventListener('click', () => switchTab(t.dataset.tab)));
    document.querySelectorAll('.seg-btn').forEach(b => b.addEventListener('click', () => setType(b.dataset.type)));
    document.querySelectorAll('.ratio-btn').forEach(b => b.addEventListener('click', () => setRatio(b.dataset.ratio)));

    ['inpSubject','inpQuestion','inpQuestionAs','inpAnswer','inpAnswerAs',
     'inpOptA','inpOptAAs','inpOptB','inpOptBAs','inpOptC','inpOptCAs','inpOptD','inpOptDAs',
     'inpCorrect','inpExplanation','inpExplanationAs'].forEach(id => {
      const el = $(id);
      if (!el) return;
      el.addEventListener('input', renderPreview);
      el.addEventListener('change', renderPreview);
    });

    $('previewBtn').addEventListener('click', renderPreview);
    $('downloadBtn').addEventListener('click', handleDownload);

    window.addEventListener('resize', () => {
      const vp = $('posterViewport');
      const poster = vp && vp.querySelector('.poster');
      if (poster) scaleViewport(poster, vp);
    });

    $('lockBtn').addEventListener('click', () => {
      if (!confirm('Lock the workspace? You will need to enter the password again.')) return;
      PKStore.clearSession();
      PKApp.showIntro();
    });
  }

  function init() {
    const cfg = PKStore.loadCfg();
    const seq = PKStore.loadSeq();
    let changed = false;
    cfg.subjects.forEach(s => {
      if (!seq[s.code]) {
        seq[s.code] = { set: cfg.idSettings.startSet, q: cfg.idSettings.startQ };
        changed = true;
      }
    });
    if (changed) PKStore.saveSeq(seq);

    loadSubjectDropdown();
    wireCreate();
    wireSettings();
    switchTab('create');
    renderPreview();
  }

  global.PKWorkspace = { init, renderPreview };
})(window);
