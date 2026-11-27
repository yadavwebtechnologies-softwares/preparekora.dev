
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

  const ASSAMESE_FONTS = ['Jyotirupa', 'Rangmon'];
  let previewRenderToken = 0;

  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ===== ASSAMESE FONT MANAGEMENT =====

  function getAssameseFont(cfg = PKStore.loadCfg()) {
    const selected = cfg?.typography?.assameseFont;
    return ASSAMESE_FONTS.includes(selected) ? selected : 'Jyotirupa';
  }

  async function waitForAssameseFont(fontName) {
    if (!document.fonts || typeof document.fonts.load !== 'function') {
      return false;
    }

    try {
      const sample = 'অসমীয়া ৰ ৱ';
      const faces = await document.fonts.load(`16px "${fontName}"`, sample);
      await document.fonts.ready;

      return faces.length > 0 && document.fonts.check(`16px "${fontName}"`, sample);
    } catch (error) {
      console.warn('Assamese font loading:', error);
      return false;
    }
  }

  // ===== FIXED INPUT FORMAT PARSER =====

  function splitBilingual(raw, label, errors) {
    const value = String(raw || '').trim();
    const splitAt = value.lastIndexOf(' (');

    if (splitAt <= 0 || !value.endsWith(')')) {
      errors.push(`${label}: Use English text (Assamese text).`);
      return { english: value, assamese: '' };
    }

    const english = value.slice(0, splitAt).trim();
    const assamese = value.slice(splitAt + 2, -1).trim();

    if (!english || !assamese) {
      errors.push(`${label}: Both English and Assamese text are required.`);
    }

    return { english, assamese };
  }

  function parseDirectBatch(raw) {
    const errors = [];
    const entries = [];

    let current = null;
    let activeField = '';

    function flush() {
      if (current) entries.push(current);
      current = null;
      activeField = '';
    }

    const lines = String(raw || '').split(/\r?\n/);

    lines.forEach(line => {
      const value = line.trim();
      if (!value) return;

      const match = value.match(/^([a-z]+)\s*:\s*(.*)$/i);

      if (match) {
        const label = match[1].toUpperCase();

        if (label === 'Q') {
          if (current) flush();

          current = {};
          current.question = match[2].trim();
          activeField = 'question';
          return;
        }

        if (label === 'ANS' || label === 'ANSWER') {
          if (!current) current = {};

          if (Object.prototype.hasOwnProperty.call(current, 'answer')) {
            errors.push('Duplicate Ans field found.');
            return;
          }

          current.answer = match[2].trim();
          activeField = 'answer';
          return;
        }

        errors.push(`Unexpected field "${match[1]}:" in Direct Answer module.`);
        activeField = '';
        return;
      }

      if (current && activeField) {
        current[activeField] += (current[activeField] ? ' ' : '') + value;
      } else {
        errors.push(`Unrecognised input line: ${value}`);
      }
    });

    flush();

    if (!entries.length) {
      errors.push('Enter at least one Question and Answer pair.');
    }

    if (entries.length > 5) {
      errors.push('Maximum 5 Question and Answer pairs are allowed per image.');
    }

    const questions = entries.slice(0, 5).map((entry, index) => {
      const q = splitBilingual(
        entry.question,
        `Question ${index + 1}`,
        errors
      );

      const a = splitBilingual(
        entry.answer,
        `Answer ${index + 1}`,
        errors
      );

      return {
        question: q.english,
        questionAs: q.assamese,
        answer: a.english,
        answerAs: a.assamese
      };
    });

    return { questions, errors };
  }

  function parseMcqInput(raw) {
    const errors = [];
    const fields = {};
    let activeField = '';

    const labels = {
      Q: 'question',
      QUESTION: 'question',
      A: 'optionA',
      B: 'optionB',
      C: 'optionC',
      D: 'optionD',
      CORRECT: 'correct',
      'CORRECT ANSWER': 'correct',
      EXPLANATION: 'explanation'
    };

    const lines = String(raw || '').split(/\r?\n/);

    lines.forEach(line => {
      const value = line.trim();
      if (!value) return;

      const match = value.match(/^([a-z]+(?:\s+[a-z]+)*)\s*:\s*(.*)$/i);

      if (match) {
        const label = match[1].trim().toUpperCase();
        const field = labels[label];

        if (!field) {
          errors.push(`Unknown field "${match[1]}:".`);
          activeField = '';
          return;
        }

        if (Object.prototype.hasOwnProperty.call(fields, field)) {
          errors.push(`Duplicate ${match[1]} field found.`);
          activeField = '';
          return;
        }

        fields[field] = match[2].trim();
        activeField = field;
        return;
      }

      if (activeField) {
        fields[activeField] += (fields[activeField] ? ' ' : '') + value;
      } else {
        errors.push(`Unrecognised input line: ${value}`);
      }
    });

    const question = splitBilingual(
      fields.question,
      'Question',
      errors
    );

    const options = {};
    const optionsAs = {};

    ['A', 'B', 'C', 'D'].forEach(letter => {
      const parsed = splitBilingual(
        fields['option' + letter],
        `Option ${letter}`,
        errors
      );

      options[letter] = parsed.english;
      optionsAs[letter] = parsed.assamese;
    });

    const correctMatch = String(fields.correct || '')
      .trim()
      .match(/^(?:OPTION\s*)?([A-D])$/i);

    const correct = correctMatch ? correctMatch[1].toUpperCase() : '';

    if (!correct) {
      errors.push('Correct must be A, B, C or D.');
    }

    const explanation = splitBilingual(
      fields.explanation,
      'Explanation',
      errors
    );

    return {
      question: question.english,
      questionAs: question.assamese,
      options,
      optionsAs,
      correct,
      explanation: explanation.english,
      explanationAs: explanation.assamese,
      errors
    };
  }

  // ===== NAVIGATION =====

  function switchTab(name) {
    document.querySelectorAll('.ws-tab').forEach(t =>
      t.classList.toggle('active', t.dataset.tab === name)
    );

    $('createTab').classList.toggle('active', name === 'create');
    $('createTab').hidden = name !== 'create';
    $('settingsTab').hidden = name !== 'settings';
    $('settingsTab').classList.toggle('active', name === 'settings');

    if (name === 'settings') renderSettings();
    if (name === 'create') renderPreview();
  }

  // ===== SUBJECT MANAGEMENT =====

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

    if (prev && cfg.subjects.some(s => s.code === prev)) {
      sel.value = prev;
    }
  }

  // ===== READ INPUT =====

  function readForm() {
    const cfg = PKStore.loadCfg();
    const code = $('inpSubject').value;
    const subj = cfg.subjects.find(s => s.code === code);

    const base = {
      type: state.questionType,
      subjectCode: code,
      subjectName: subj ? subj.name : '',
      ratio: state.ratio
    };

    // New structured Direct Answer input.
    if (state.questionType === 'direct' && $('inpDirectBatch')) {
      const parsed = parseDirectBatch($('inpDirectBatch').value);

      return {
        ...base,
        questions: parsed.questions,
        parseErrors: parsed.errors
      };
    }

    // New structured MCQ input.
    if (state.questionType === 'options' && $('inpMcqStructured')) {
      const parsed = parseMcqInput($('inpMcqStructured').value);
      const { errors, ...questionData } = parsed;

      return {
        ...base,
        ...questionData,
        parseErrors: errors
      };
    }

    // Backward compatibility with the existing individual input fields.
    if (state.questionType === 'direct') {
      return {
        ...base,
        question: $('inpQuestion').value.trim(),
        questionAs: $('inpQuestionAs').value.trim(),
        answer: $('inpAnswer').value.trim(),
        answerAs: $('inpAnswerAs').value.trim()
      };
    }

    return {
      ...base,
      question: $('inpQuestion').value.trim(),
      questionAs: $('inpQuestionAs').value.trim(),
      options: {
        A: $('inpOptA').value.trim(),
        B: $('inpOptB').value.trim(),
        C: $('inpOptC').value.trim(),
        D: $('inpOptD').value.trim()
      },
      optionsAs: {
        A: $('inpOptAAs').value.trim(),
        B: $('inpOptBAs').value.trim(),
        C: $('inpOptCAs').value.trim(),
        D: $('inpOptDAs').value.trim()
      },
      correct: $('inpCorrect').value,
      explanation: $('inpExplanation').value.trim(),
      explanationAs: $('inpExplanationAs').value.trim()
    };
  }

  // ===== VALIDATION =====

  function validate(d) {
    const errors = [];

    if (!d.subjectCode) errors.push('Select a subject.');

    if (d.parseErrors?.length) {
      errors.push(...d.parseErrors);
    }

    if (d.type === 'direct') {
      if (Array.isArray(d.questions)) {
        if (!d.questions.length) {
          errors.push('Enter at least one Question and Answer pair.');
        }

        d.questions.forEach((q, index) => {
          if (!q.question || !q.questionAs) {
            errors.push(`Question ${index + 1}: English and Assamese are required.`);
          }
          if (!q.answer || !q.answerAs) {
            errors.push(`Answer ${index + 1}: English and Assamese are required.`);
          }
        });
      } else {
        if (!d.question) errors.push('Question is required.');
        if (!d.answer) errors.push('Direct answer is required.');
      }
    } else {
      if (!d.question || !d.questionAs) {
        errors.push('Question requires both English and Assamese.');
      }

      ['A', 'B', 'C', 'D'].forEach(letter => {
        if (!d.options?.[letter] || !d.optionsAs?.[letter]) {
          errors.push(`Option ${letter} requires English and Assamese.`);
        }
      });

      if (!d.correct) errors.push('Select the correct answer.');
      if (!d.explanation || !d.explanationAs) {
        errors.push('Explanation requires both English and Assamese.');
      }
    }

    return [...new Set(errors)];
  }

  // ===== QUESTION TYPE AND RATIO =====

  function setType(t) {
    state.questionType = t;

    document.querySelectorAll('.seg-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.type === t)
    );

    $('directFields').hidden = t !== 'direct';
    $('optionsFields').hidden = t !== 'options';

    renderPreview();
  }

  function setRatio(r) {
    state.ratio = r;

    document.querySelectorAll('.ratio-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.ratio === r)
    );

    renderPreview();
  }

  // ===== BUILD IMAGE =====

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
      const questions = Array.isArray(d.questions)
        ? d.questions
        : [{
            question: d.question,
            questionAs: d.questionAs,
            answer: d.answer,
            answerAs: d.answerAs
          }];

      const items = questions.map((q, index) => {
        const qAs = q.questionAs
          ? ` <span class="as-inline">(${esc(q.questionAs)})</span>`
          : '';

        const aAs = q.answerAs
          ? ` <span class="as-inline">(${esc(q.answerAs)})</span>`
          : '';

        const separator = index
          ? 'style="border-top:1px solid var(--line);"'
          : '';

        return `<div class="item" ${separator}>
          <div class="row">
            <div class="marker">Q</div>
            <div class="text">${esc(q.question)}${qAs}</div>
          </div>
          <div class="row">
            <div class="marker">Ans</div>
            <div class="ans-text">${esc(q.answer)}${aAs}</div>
          </div>
        </div>`;
      }).join('');

      body = `<div class="list">${items}</div>`;

    } else {
      const opt = L => {
        const as = d.optionsAs[L]
          ? ` <span class="as-inline">(${esc(d.optionsAs[L])})</span>`
          : '';

        return `<div class="opt${d.correct === L ? ' correct' : ''}">
          <div class="key">${L}</div>
          <div>${esc(d.options[L])}${as}</div>
        </div>`;
      };

      const qAs = d.questionAs
        ? ` <span class="as-inline">(${esc(d.questionAs)})</span>`
        : '';

      const expAs = d.explanationAs
        ? `<div class="divider"></div><div class="exp-as">${esc(d.explanationAs)}</div>`
        : '';

      body = `<div class="list">
        <div class="item">
          <div class="q-row">
            <div class="marker">Q</div>
            <div class="q-text">${esc(d.question)}${qAs}</div>
          </div>
          <div class="options-grid">
            ${opt('A')}${opt('B')}${opt('C')}${opt('D')}
          </div>
          <div class="explanation">
            <div class="exp-label">Explanation</div>
            <div class="exp-text">${esc(d.explanation)}</div>
            ${expAs}
          </div>
        </div>
      </div>`;
    }

    return `<div class="poster" data-type="${d.type}" data-ratio="${d.ratio}">
      ${header}${body}${footer}
    </div>`;
  }

  // ===== IMAGE DIMENSIONS AND TYPOGRAPHY =====

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

    p.style.setProperty(
      '--font-as',
      `"${getAssameseFont(c)}", sans-serif`
    );
  }

  // ===== DYNAMIC CONTENT FITTING =====

  function fitPoster(p) {
    const body = p.querySelector('.list');
    if (!body) return true;

    const c = PKStore.loadCfg();

    const base = {
      q: c.typography.questionSize,
      a: c.typography.answerSize,
      o: c.typography.optionSize,
      e: c.typography.explanationSize
    };

    const items = [...body.querySelectorAll('.item')];
    const isDirectBatch = p.dataset.type === 'direct' && items.length > 1;

    let scale = 1;

    function applyScale() {
      p.style.setProperty('--fs-q', (base.q * scale) + 'px');
      p.style.setProperty('--fs-a', (base.a * scale) + 'px');
      p.style.setProperty('--fs-o', (base.o * scale) + 'px');
      p.style.setProperty('--fs-e', (base.e * scale) + 'px');

      // Compact vertical spacing only for multiple Direct Answer items.
      if (isDirectBatch) {
        const itemGap = Math.max(7, 16 * scale);
        const listMargin = Math.max(10, 28 * scale);

        body.style.marginTop = listMargin + 'px';
        body.style.marginBottom = listMargin + 'px';

        items.forEach((item, index) => {
          item.style.gap = itemGap + 'px';
          item.style.paddingTop = Math.max(
            6,
            (index === 0 ? 12 : 26) * scale
          ) + 'px';
          item.style.paddingBottom = Math.max(6, 26 * scale) + 'px';
        });
      }
    }

    for (let i = 0; i <= 30; i++) {
      applyScale();

      if (body.scrollHeight <= body.clientHeight + 1) {
        return true;
      }

      scale = Math.max(0.40, scale - 0.02);
    }

    applyScale();
    return body.scrollHeight <= body.clientHeight + 1;
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

  // ===== QR CODE =====

  function renderQR(container, url) {
    if (!container) return;

    container.innerHTML = '';

    if (!url || !global.QRCode) return;

    try {
      new QRCode(container, {
        text: url,
        width: 200,
        height: 200,
        correctLevel: QRCode.CorrectLevel.M
      });
    } catch (error) {
      console.error('QR generation failed:', error);
    }
  }

  // ===== STATUS =====

  function setStatus(text, type) {
    const status = $('formStatus');
    status.textContent = text;
    status.className = 'form-status' + (type ? ' ' + type : '');
  }

  // ===== LIVE PREVIEW =====

  function renderPreview() {
    const token = ++previewRenderToken;

    const d = readForm();
    const cfg = PKStore.loadCfg();
    const seq = PKStore.loadSeq();

    const nextId = d.subjectCode
      ? PKStore.peekNextId(cfg, seq, d.subjectCode)
      : `${cfg.idSettings.prefix}/.../--/--`;

    const vp = $('posterViewport');
    vp.innerHTML = buildPosterHTML(d, nextId);

    const poster = vp.querySelector('.poster');

    applyDimsAndTypo(poster);
    renderQR(poster.querySelector('.f-qr'), cfg.branding.qrUrl);

    $('previewId').textContent = nextId;

    const errors = validate(d);
    const downloadBtn = $('downloadBtn');

    downloadBtn.disabled = errors.length > 0;

    if (errors.length) {
      setStatus(errors[0], 'error');
    } else {
      setStatus('Preparing preview...', '');
    }

    waitForAssameseFont(getAssameseFont(cfg)).then(fontLoaded => {
      if (token !== previewRenderToken || !poster.isConnected) return;

      if (!fontLoaded) {
        console.warn('Selected Assamese font is not registered. Check the local font files and CSS.');
      }

      requestAnimationFrame(() => {
        if (token !== previewRenderToken || !poster.isConnected) return;

        const fits = fitPoster(poster);
        scaleViewport(poster, vp);

        if (errors.length) return;

        if (!fits) {
          setStatus(
            'Content is too long for this image. Shorten the text or select another aspect ratio.',
            'error'
          );
          downloadBtn.disabled = true;
        } else {
          setStatus('Ready to generate.', 'success');
          downloadBtn.disabled = false;
        }
      });
    });
  }

  // ===== IMAGE DOWNLOAD =====

  async function handleDownload() {
    if (!global.html2canvas) {
      alert('Export library failed to load. Check your connection.');
      return;
    }

    const d = readForm();
    const errors = validate(d);

    if (errors.length) {
      alert(errors[0]);
      return;
    }

    const cfg = PKStore.loadCfg();
    const fontName = getAssameseFont(cfg);

    let off = null;

    try {
      const fontLoaded = await waitForAssameseFont(fontName);

      if (!fontLoaded) {
        console.warn(`Custom font ${fontName} was not detected. Check fonts/${fontName}.ttf.`);
      }

      const seq = PKStore.loadSeq();
      const provisionalId = PKStore.peekNextId(cfg, seq, d.subjectCode);

      off = document.createElement('div');
      off.style.cssText = 'position:fixed;left:-99999px;top:0;pointer-events:none';
      off.innerHTML = buildPosterHTML(d, provisionalId);

      const poster = off.querySelector('.poster');

      applyDimsAndTypo(poster);
      renderQR(poster.querySelector('.f-qr'), cfg.branding.qrUrl);

      document.body.appendChild(off);

      await document.fonts.ready;
      await new Promise(resolve => setTimeout(resolve, 250));

      const fits = fitPoster(poster);

      if (!fits) {
        alert('The content does not fit safely. Shorten the text or select another aspect ratio. No ID has been reserved.');
        return;
      }

      // Reserve the ID only after validation and fitting succeed.
      const entry = PKStore.reserveId(
        cfg,
        seq,
        d.subjectCode,
        d.subjectName
      );

      poster.querySelector('.h-badge').textContent = entry.id;

      const canvas = await global.html2canvas(poster, {
        scale: 2,
        backgroundColor: '#fafbfc',
        useCORS: true,
        logging: false
      });

      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');

      a.href = url;
      a.download = entry.id.replace(/\//g, '-') + '.png';

      document.body.appendChild(a);
      a.click();
      a.remove();

      setTimeout(() => {
        renderPreview();
      }, 250);

    } catch (error) {
      alert('Download failed: ' + (error.message || error));
    } finally {
      if (off) off.remove();
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

    list.querySelectorAll('.subj-save').forEach(b =>
      b.addEventListener('click', () => saveSubjectEdit(b.dataset.code))
    );

    list.querySelectorAll('.subj-remove').forEach(b =>
      b.addEventListener('click', () => removeSubject(b.dataset.code))
    );

    $('setIdPrefix').value = cfg.idSettings.prefix;
    $('setPerSet').value = cfg.idSettings.perSet;
    $('setStartSet').value = cfg.idSettings.startSet;
    $('setStartQ').value = cfg.idSettings.startQ;

    $('fsQuestion').value = cfg.typography.questionSize;
    $('fsOption').value = cfg.typography.optionSize;
    $('fsAnswer').value = cfg.typography.answerSize;
    $('fsExplanation').value = cfg.typography.explanationSize;

    if ($('setAssameseFont')) {
      $('setAssameseFont').value = getAssameseFont(cfg);
    }

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

    if (!hist.length) {
      el.innerHTML = '<p class="settings-help">No IDs generated yet.</p>';
      return;
    }

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

    if (!newName) {
      alert('Subject name required.');
      return;
    }

    if (!/^[A-Z0-9]{1,8}$/.test(newCode)) {
      alert('Code must be 1–8 letters/numbers.');
      return;
    }

    const cfg = PKStore.loadCfg();

    if (newCode !== oldCode && cfg.subjects.some(s => s.code === newCode)) {
      alert('Code already used.');
      return;
    }

    const subj = cfg.subjects.find(s => s.code === oldCode);
    if (!subj) return;

    subj.name = newName;
    subj.code = newCode;

    PKStore.saveCfg(cfg);

    if (newCode !== oldCode) {
      const seq = PKStore.loadSeq();

      if (seq[oldCode]) {
        seq[newCode] = seq[oldCode];
        delete seq[oldCode];
        PKStore.saveSeq(seq);
      }
    }

    renderSettings();
    loadSubjectDropdown();
  }

  function removeSubject(code) {
    const cfg = PKStore.loadCfg();

    if (cfg.subjects.length <= 1) {
      alert('At least one subject must remain.');
      return;
    }

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

    if (!name) {
      msg('subjMsg', 'Enter a subject name.', false);
      return;
    }

    if (!/^[A-Z0-9]{1,8}$/.test(code)) {
      msg('subjMsg', 'Code must be 1–8 letters/numbers.', false);
      return;
    }

    const cfg = PKStore.loadCfg();

    if (cfg.subjects.some(s => s.code === code)) {
      msg('subjMsg', 'Code already exists.', false);
      return;
    }

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

    if (!/^\d{4,12}$/.test(v)) {
      msg('pwMsg', 'Password must be 4–12 digits.', false);
      return;
    }

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

    const fontSelect = $('setAssameseFont');

    if (fontSelect) {
      fontSelect.addEventListener('change', () => {
        const c = PKStore.loadCfg();

        c.typography.assameseFont = ASSAMESE_FONTS.includes(fontSelect.value)
          ? fontSelect.value
          : 'Jyotirupa';

        PKStore.saveCfg(c);
        renderPreview();
      });
    }

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

  // ===== CREATE FORM EVENTS =====

  function wireCreate() {
    document.querySelectorAll('.ws-tab').forEach(t =>
      t.addEventListener('click', () => switchTab(t.dataset.tab))
    );

    document.querySelectorAll('.seg-btn').forEach(b =>
      b.addEventListener('click', () => setType(b.dataset.type))
    );

    document.querySelectorAll('.ratio-btn').forEach(b =>
      b.addEventListener('click', () => setRatio(b.dataset.ratio))
    );

    const inputIds = [
      // New structured input fields.
      'inpDirectBatch',
      'inpMcqStructured',

      // Legacy fields remain supported until index.html is updated.
      'inpSubject',
      'inpQuestion',
      'inpQuestionAs',
      'inpAnswer',
      'inpAnswerAs',
      'inpOptA',
      'inpOptAAs',
      'inpOptB',
      'inpOptBAs',
      'inpOptC',
      'inpOptCAs',
      'inpOptD',
      'inpOptDAs',
      'inpCorrect',
      'inpExplanation',
      'inpExplanationAs'
    ];

    inputIds.forEach(id => {
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

  // ===== INITIALIZE =====

  function init() {
    const cfg = PKStore.loadCfg();
    const seq = PKStore.loadSeq();

    let changed = false;

    cfg.subjects.forEach(s => {
      if (!seq[s.code]) {
        seq[s.code] = {
          set: cfg.idSettings.startSet,
          q: cfg.idSettings.startQ
        };
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
