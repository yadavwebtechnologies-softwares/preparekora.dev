(function (global) {
  'use strict';
  const $ = id => document.getElementById(id);

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  let pin = '';

  function renderDots() {
    const el = $('pinDisplay');
    el.innerHTML = '';
    const max = Math.min(pin.length, 12);
    for (let i = 0; i < max; i++) {
      const d = document.createElement('span');
      d.className = 'pin-dot filled';
      el.appendChild(d);
    }
  }

  function shake() {
    const el = $('pinDisplay');
    el.classList.remove('shake');
    void el.offsetWidth;
    el.classList.add('shake');
  }

  function setMsg(text, cls) {
    const m = $('gateMsg');
    m.textContent = text || '';
    m.className = 'gate-msg' + (cls ? ' ' + cls : '');
  }

  function buildKeypad() {
    const keypad = $('keypad');
    keypad.innerHTML = '';
    const digits = shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    digits.forEach(d => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'key-btn';
      b.textContent = String(d);
      b.addEventListener('click', () => press(String(d)));
      keypad.appendChild(b);
    });
    const row = document.createElement('div');
    row.className = 'keypad-last-row';
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'key-btn key-clear';
    clear.textContent = 'Clear';
    clear.addEventListener('click', () => { pin = ''; renderDots(); setMsg(''); });
    row.appendChild(clear);
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'key-btn key-back';
    back.textContent = 'Delete';
    back.addEventListener('click', () => { pin = pin.slice(0, -1); renderDots(); setMsg(''); });
    row.appendChild(back);
    keypad.appendChild(row);
  }

  function press(d) {
    pin += d;
    if (pin.length > 12) pin = pin.slice(0, 12);
    renderDots();
    setMsg('');
    if (pin.length >= 4) tryUnlock();
  }

  function tryUnlock() {
    const cfg = PKStore.loadCfg();
    if (pin === String(cfg.password)) {
      setMsg('Unlocked.', 'success');
      setTimeout(() => {
        PKStore.setSession();
        global.PKApp.showWorkspace();
      }, 260);
    } else if (pin.length >= String(cfg.password).length) {
      shake();
      setMsg('Incorrect password. Try again.');
      setTimeout(() => { pin = ''; renderDots(); }, 400);
    }
  }

  function openGate() {
    pin = '';
    renderDots();
    setMsg('');
    buildKeypad();
    $('introScreen').hidden = true;
    $('gateScreen').hidden = false;
  }

  function closeGate() {
    $('gateScreen').hidden = true;
    $('introScreen').hidden = false;
  }

  function init() {
    $('goToWorkspace').addEventListener('click', openGate);
    $('gateBack').addEventListener('click', closeGate);
  }

  global.PKGate = { init, openGate, closeGate };
})(window);
