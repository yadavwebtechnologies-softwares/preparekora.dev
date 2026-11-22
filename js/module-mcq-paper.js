(function (global) {
  'use strict';

  const PREF = { qr: 'mp_qr', subject: 'mp_subject', title: 'mp_title', examType: 'mp_examType', examName: 'mp_examName' };
  let initialized = false;
  let currentDraft = null;

  const $ = id => document.getElementById(id);
  const ls = {
    get: k => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch {} }
  };
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const aNum = n => String(n).replace(/[0-9]/g, d => '০১২৩৪৫৬৭৮৯'[+d]);

  function splitBi(raw) {
    const s = String(raw ?? '');
    let en = s.trim(), as = '';
    if (s.indexOf('|') !== -1) {
      const i = s.indexOf('|');
      en = s.slice(0, i).trim(); as = s.slice(i + 1).trim();
    } else {
      const m = en.match(/^(.*?)\s*\(([^()]+)\)\s*$/);
      if (m) { en = m[1].trim(); as = m[2].trim(); }
    }
    return { en, as };
  }

  function emptyOptions() { return [{ en: '', as: '' }, { en: '', as: '' }, { en: '', as: '' }, { en: '', as: '' }]; }

  function parseMCQs(text) {
    const lines = String(text || '').split(/\r?\n/);
    const qs = [];
    let title = '', cur = null;
    const flush = () => { if (!cur) return; const filled = cur.options.filter(o => o && o.en).length; if (cur.qEn && filled >= 2) qs.push(cur); cur = null; };
    for (let i = 0; i < lines.length; i++) {
      const line = String(lines[i]).trim();
      if (!line) continue;
      let m;
      if ((m = line.match(/^title\s*[:\-|]\s*(.+)$/i))) { if (!title) title = splitBi(m[1]).en; continue; }
      if ((m = line.match(/^q\s*\(\s*as\s*\)\s*[:\-|]\s*(.+)$/i))) { if (cur) cur.qAs = String(m[1]).trim(); continue; }
      if ((m = line.match(/^(?:q|question)\s*[:\-|]\s*(.+)$/i))) { flush(); const b = splitBi(m[1]); cur = { qEn: b.en, qAs: b.as, options: emptyOptions(), answer: null }; continue; }
      if ((m = line.match(/^(?:ans|answer|correct)\s*[:\-|]?\s*([A-Da-d])\b/i))) { if (cur) cur.answer = m[1].toUpperCase(); continue; }
      if ((m = line.match(/^([A-Da-d])\s*[\)\.\:]\s*(.+)$/))) {
        if (!cur) continue;
        const idx = 'ABCD'.indexOf(m[1].toUpperCase());
        if (idx >= 0) { const b = splitBi(m[2]); cur.options[idx] = { en: b.en, as: b.as }; }
        continue;
      }
    }
    flush();
    return { title, questions: qs };
  }

  function buildLanguageCard(q, number, lang) {
    const isEn = lang === 'en';
    const card = document.createElement('div');
    card.className = 'language-card ' + (isEn ? 'english' : 'assamese');
    const qText = isEn ? (q.qEn || '') : (q.qAs || '');
    const numText = isEn ? 'Q' + number + '.' : 'প্ৰশ্ন ' + aNum(number) + '.';
    const optsHtml = q.options.map((opt, i) => {
      const L = 'ABCD'[i];
      const txt = isEn ? (opt.en || '') : (opt.as || '');
      return `<div class="option"><b class="option-label">${L}.</b><span>${esc(txt)}</span></div>`;
    }).join('');
    let ans = '';
    if (q.answer && 'ABCD'.indexOf(q.answer) >= 0) {
      const opt = q.options['ABCD'.indexOf(q.answer)] || { en: '', as: '' };
      const t = isEn ? (opt.en || '') : (opt.as || '');
      ans = isEn ? `Correct: ${q.answer}. ${esc(t)}` : `শুদ্ধ উত্তৰ: ${q.answer}. ${esc(t)}`;
    }
    card.innerHTML = `<div class="question"><span class="question-number">${numText}</span> ${esc(qText)}</div><div class="options">${optsHtml}</div>${ans ? `<div class="answer">${ans}</div>` : ''}`;
    return card;
  }

  function buildSheet(d, qs, start, pageNum, totalPages, qrUrl) {
    const sheet = document.createElement('section');
    sheet.className = 'pk-pdf-sheet';
    sheet.style.cssText = 'width:210mm;height:297mm;padding:10mm 11mm 8mm;background:#fff;display:flex;flex-direction:column;box-sizing:border-box;font-family:Arial,sans-serif;color:#111';
    const header = document.createElement('header');
    header.style.cssText = 'flex:0 0 14mm;display:grid;grid-template-columns:max-content minmax(0,1fr) max-content 10mm;align-items:center;gap:3mm;border-bottom:0.3mm solid #777;padding-bottom:3mm';
    header.innerHTML = `<span style="font-size:8pt;font-weight:700">Preparekora<span style="color:#999">.in</span></span><span style="font-size:8pt;font-weight:600;color:#444;padding-left:4mm;border-left:0.2mm solid #d5d5d5;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(d.subject)}</span><span style="font-size:8pt;font-weight:600;color:#444;padding-left:4mm;border-left:0.2mm solid #d5d5d5;white-space:nowrap">MT ID: ${esc(d.mtId)}</span><img style="width:10mm;height:10mm;object-fit:contain" alt="QR" crossorigin="anonymous" src="https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=0&data=${encodeURIComponent(qrUrl || '')}">`;
    sheet.appendChild(header);

    const grid = document.createElement('main');
    grid.style.cssText = 'flex:1;min-height:0;display:grid;grid-template-rows:repeat(5,minmax(0,1fr))';
    qs.forEach((q, i) => {
      const pair = document.createElement('div');
      pair.style.cssText = 'min-height:0;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);border-bottom:0.25mm solid #d0d0d0;overflow:hidden';
      const en = buildLanguageCard(q, start + i + 1, 'en');
      en.style.cssText = 'min-width:0;padding:4mm;display:flex;flex-direction:column;font-family:"Times New Roman",Times,serif;border-right:0.3mm solid #bcbcbc;overflow:hidden';
      const as = buildLanguageCard(q, start + i + 1, 'as');
      as.style.cssText = 'min-width:0;padding:4mm;display:flex;flex-direction:column;font-family:"Noto Sans Bengali","Nirmala UI",sans-serif;overflow:hidden';
      pair.appendChild(en);
      pair.appendChild(as);
      grid.appendChild(pair);
    });
    sheet.appendChild(grid);

    const footer = document.createElement('footer');
    footer.style.cssText = 'flex:0 0 8mm;display:grid;grid-template-columns:1fr 1fr 1fr;align-items:end;border-top:0.25mm solid #bdbdbd;padding-top:2mm;font-size:7pt;font-weight:600;color:#666';
    footer.innerHTML = `<span style="color:#222;text-align:left">PREPAREKORA.IN</span><span style="text-align:center">${esc(d.subject.toUpperCase())}</span><span style="text-align:right">${String(pageNum).padStart(2, '0')} / ${String(totalPages).padStart(2, '0')}</span>`;
    sheet.appendChild(footer);
    return sheet;
  }

  function injectPdfCSS() {
    if (document.getElementById('mp-pdf-css')) return;
    const style = document.createElement('style');
    style.id = 'mp-pdf-css';
    style.textContent = `
      .pk-pdf-sheet .question{font-size:11pt;font-weight:700;line-height:1.35;margin:0 0 2mm;color:#111}
      .pk-pdf-sheet .assamese .question{font-size:10.5pt;font-weight:600}
      .pk-pdf-sheet .question-number{font-weight:700;white-space:nowrap}
      .pk-pdf-sheet .options{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:2.5mm;row-gap:1.5mm;font-size:9.5pt;line-height:1.3}
      .pk-pdf-sheet .option{min-width:0;display:flex;align-items:flex-start;gap:1.5mm}
      .pk-pdf-sheet .option-label{flex-shrink:0;font-weight:700}
      .pk-pdf-sheet .answer{margin-top:1.5mm;padding-top:1.5mm;border-top:0.2mm solid #e1e1e1;font-size:9pt;font-weight:700;line-height:1.3}
    `;
    document.head.appendChild(style);
  }

  async function generateRasterPDF(d) {
    if (!global.html2canvas) throw new Error('Rendering library not loaded');
    if (!global.jspdf || !global.jspdf.jsPDF) throw new Error('PDF library not loaded');
    injectPdfCSS();
    await document.fonts.ready;

    const perPage = 5;
    const total = d.questions.length;
    const totalPages = Math.ceil(total / perPage);
    const root = document.createElement('div');
    root.style.cssText = 'position:fixed;left:-10000px;top:0;pointer-events:none';
    for (let p = 0; p < totalPages; p++) {
      root.appendChild(buildSheet(d, d.questions.slice(p * perPage, (p + 1) * perPage), p * perPage, p + 1, totalPages, d.qrUrl));
    }
    document.body.appendChild(root);
    try {
      await new Promise(r => setTimeout(r, 200));
      const doc = new global.jspdf.jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
      doc.setProperties({ title: d.title || 'MCQ Paper', subject: d.subject, author: 'Preparekora.in', creator: 'Preparekora Studio' });
      const sheets = root.querySelectorAll('.pk-pdf-sheet');
      for (let i = 0; i < sheets.length; i++) {
        const canvas = await global.html2canvas(sheets[i], { scale: 3, backgroundColor: '#ffffff', useCORS: true, logging: false });
        if (i > 0) doc.addPage();
        doc.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, 210, 297);
      }
      return doc.output('blob');
    } finally {
      root.remove();
    }
  }

  function downloadBlob(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  async function peekNextId(subject) {
    if (!subject) return null;
    try {
      const res = await PK_API.post('/api/pdfs/reserve', { subject });
      return res;
    } catch (e) { return null; }
  }

  function getSubject() {
    let s = $('mp-subject').value;
    if (s === 'Custom') s = $('mp-custom-subject').value.trim();
    return s;
  }

  async function updateIdPreview() {
    const s = getSubject();
    if (!s) { $('mp-id-preview').hidden = true; return; }
    $('mp-id-preview').hidden = false;
    $('mp-next-id').textContent = 'will be reserved on Create';
  }

  async function handleCreate() {
    const subject = getSubject();
    if (!subject) { showMsg('Please select a subject.', false); return; }
    const parsed = parseMCQs($('mp-input').value);
    if (!parsed.questions.length) { showMsg('No valid questions. Each must start with "Q:" and have at least 2 options.', false); return; }

    const btn = $('mp-create');
    btn.disabled = true;
    btn.textContent = 'Creating…';
    showMsg('Reserving MT ID and generating PDF…', true);

    try {
      const reserve = await PK_API.post('/api/pdfs/reserve', { subject });
      const mtId = reserve.mtId;
      const subjectCode = reserve.subjectCode;

      const title = $('mp-title').value.trim() || parsed.title || (subject + ' — MCQ Practice Paper');
      const d = {
        mtId, subject, subjectCode,
        title,
        examType: $('mp-exam-type').value.trim() || 'MOCK TEST',
        examName: $('mp-exam-name').value.trim(),
        qrUrl: $('mp-qr-url').value.trim(),
        totalQuestions: parsed.questions.length,
        totalPages: Math.ceil(parsed.questions.length / 5),
        questions: parsed.questions
      };
      currentDraft = d;
      await PK_API.post('/api/pdfs', {
        mtId, subject, subjectCode,
        title: d.title, examType: d.examType, examName: d.examName, qrUrl: d.qrUrl,
        totalQuestions: d.totalQuestions, totalPages: d.totalPages
      });
      showSummary(d);
      showMsg('MT ID ' + mtId + ' · ' + parsed.questions.length + ' questions', true);
      window.dispatchEvent(new CustomEvent('pk:papercreated', { detail: d }));
    } catch (e) {
      console.error(e);
      showMsg('Failed: ' + e.message, false);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Create PDF';
    }
  }

  function showMsg(text, ok) {
    const el = $('mp-msg');
    el.textContent = text || '';
    el.className = 'msg' + (ok ? ' ok' : '');
  }

  function showSummary(d) {
    $('mp-sum-mtid').textContent = d.mtId;
    $('mp-sum-subject').textContent = d.subject;
    $('mp-sum-title').textContent = d.title;
    $('mp-sum-count').textContent = d.totalQuestions + (d.totalQuestions === 1 ? ' question' : ' questions');
    $('mp-summary').hidden = false;
  }

  async function handleDownload() {
    if (!currentDraft) { showMsg('Create a PDF first.', false); return; }
    const btn = $('mp-download-raster');
    btn.disabled = true;
    const orig = btn.textContent;
    btn.textContent = 'Rendering…';
    try {
      const blob = await generateRasterPDF(currentDraft);
      downloadBlob(blob, 'PrepareKora_' + currentDraft.mtId + '_' + currentDraft.subject.replace(/\s+/g, '-') + '.pdf');
      showMsg('PDF downloaded.', true);
    } catch (e) {
      console.error(e);
      showMsg('Failed: ' + e.message, false);
    } finally {
      btn.disabled = false;
      btn.textContent = orig;
    }
  }

  function handleThumbnail() {
    if (!currentDraft) { showMsg('Create a PDF first.', false); return; }
    window.dispatchEvent(new CustomEvent('pk:thumbrequested', { detail: currentDraft }));
    document.querySelector('[data-tab="thumbnail"]').click();
  }

  function wire() {
    if (!$('mp-create')) return;
    $('mp-subject').addEventListener('change', () => {
      $('mp-custom-wrap').hidden = $('mp-subject').value !== 'Custom';
      updateIdPreview();
    });
    $('mp-custom-subject').addEventListener('input', updateIdPreview);
    $('mp-create').addEventListener('click', handleCreate);
    $('mp-download-raster').addEventListener('click', handleDownload);
    $('mp-thumb-btn').addEventListener('click', handleThumbnail);
    const savedQr = ls.get(PREF.qr);
    if (savedQr) $('mp-qr-url').value = savedQr;
    $('mp-qr-url').addEventListener('input', () => ls.set(PREF.qr, $('mp-qr-url').value));
  }

  function init() {
    if (initialized) return;
    initialized = true;
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
