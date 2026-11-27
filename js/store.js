(function (global) {
  'use strict';

  const KEY_CFG = 'pk_cfg_v2';
  const KEY_SEQ = 'pk_seq_v2';
  const KEY_HIST = 'pk_hist_v1';
  const KEY_SESSION = 'pk_session';

  const DEFAULT_CFG = {
    version: 2,
    password: '08092003',
    subjects: [{ name: 'General Knowledge', code: 'GK' }],
    idSettings: { prefix: 'PK', perSet: 99, startSet: 1, startQ: 1 },
    typography: {
      questionSize: 24, optionSize: 20, answerSize: 24, explanationSize: 20,
      brandSize: 26, subjectSize: 20
    },
    branding: { topBrand: 'preparekora.in', bottomBrand: 'preparekora.in', qrUrl: '' }
  };

  function read(k, fb) { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : fb; } catch { return fb; } }
  function write(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } }
  function deepMerge(base, o) {
    if (!o || typeof o !== 'object') return base;
    for (const k of Object.keys(o)) {
      const v = o[k];
      if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object') base[k] = deepMerge(base[k], v);
      else base[k] = v;
    }
    return base;
  }

  function loadCfg() {
    const stored = read(KEY_CFG, null);
    if (!stored) { write(KEY_CFG, DEFAULT_CFG); return JSON.parse(JSON.stringify(DEFAULT_CFG)); }
    return deepMerge(JSON.parse(JSON.stringify(DEFAULT_CFG)), stored);
  }
  function saveCfg(cfg) { write(KEY_CFG, cfg); }

  function loadSeq() { return read(KEY_SEQ, {}); }
  function saveSeq(seq) { write(KEY_SEQ, seq); }

  function getSubjectSeq(seq, code, cfg) {
    return seq[code] || { set: cfg.idSettings.startSet, q: cfg.idSettings.startQ };
  }

  function pad2(n) { return String(n).padStart(2, '0'); }
  function buildId(cfg, code, s) {
    return `${cfg.idSettings.prefix}/${code}/${pad2(s.set)}/${pad2(s.q)}`;
  }

  function peekNextId(cfg, seq, code) {
    return buildId(cfg, code, getSubjectSeq(seq, code, cfg));
  }

  function loadHistory() { return read(KEY_HIST, []); }
  function saveHistory(h) { write(KEY_HIST, h); }
  function idExists(history, id) { return history.some(h => h.id === id); }

  function reserveId(cfg, seq, code, subjectName) {
    const history = loadHistory();
    let s = getSubjectSeq(seq, code, cfg);
    let id = buildId(cfg, code, s);
    let guard = 0;
    while (idExists(history, id) && guard < 100000) {
      s = { set: s.set, q: s.q + 1 };
      if (s.q > cfg.idSettings.perSet) { s.set += 1; s.q = 1; }
      id = buildId(cfg, code, s);
      guard++;
    }
    let nextSet = s.set, nextQ = s.q + 1;
    if (nextQ > cfg.idSettings.perSet) { nextSet += 1; nextQ = 1; }
    seq[code] = { set: nextSet, q: nextQ };
    saveSeq(seq);
    const entry = {
      id, subjectName, subjectCode: code,
      set: s.set, question: s.q,
      createdAt: new Date().toISOString()
    };
    history.push(entry);
    saveHistory(history);
    return entry;
  }

  function resetAllSeq(cfg) {
    const empty = {};
    cfg.subjects.forEach(s => { empty[s.code] = { set: cfg.idSettings.startSet, q: cfg.idSettings.startQ }; });
    saveSeq(empty);
    return empty;
  }

  function setSession() { try { sessionStorage.setItem(KEY_SESSION, '1'); } catch {} }
  function clearSession() { try { sessionStorage.removeItem(KEY_SESSION); } catch {} }
  function hasSession() { try { return sessionStorage.getItem(KEY_SESSION) === '1'; } catch { return false; } }

  global.PKStore = {
    loadCfg, saveCfg, DEFAULT_CFG,
    loadSeq, saveSeq, getSubjectSeq,
    peekNextId, reserveId, resetAllSeq,
    loadHistory, saveHistory,
    setSession, clearSession, hasSession
  };
})(window);
