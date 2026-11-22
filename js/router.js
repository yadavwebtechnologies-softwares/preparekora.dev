(function (global) {
  'use strict';

  function boot() {
    const loginGate = document.getElementById('loginGate');
    const appShell = document.getElementById('appShell');
    const loginForm = document.getElementById('loginForm');
    const loginBtn = document.getElementById('loginBtn');
    const loginMsg = document.getElementById('loginMsg');
    const loginEmail = document.getElementById('loginEmail');
    const loginPassword = document.getElementById('loginPassword');
    const logoutBtn = document.getElementById('logoutBtn');
    const adminBtn = document.getElementById('adminBtn');

    const tabs = document.querySelectorAll('.tab');
    const tools = document.querySelectorAll('.tool');

    function activateTab(name) {
      tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === name));
      tools.forEach(tool => { tool.hidden = tool.dataset.tool !== name; });
      try { history.replaceState(null, '', '#' + name); } catch (e) {}
    }

    tabs.forEach(tab => {
      tab.addEventListener('click', () => activateTab(tab.dataset.tab));
    });

    function showApp(isAdmin) {
      loginGate.hidden = true;
      appShell.hidden = false;
      adminBtn.hidden = !isAdmin;
      const initial = (location.hash || '').replace(/^#/, '') || 'qa-image';
      activateTab(initial);
    }

    function showLogin() {
      loginGate.hidden = false;
      appShell.hidden = true;
    }

    loginForm.addEventListener('submit', async e => {
      e.preventDefault();
      loginMsg.textContent = '';
      loginBtn.disabled = true;
      loginBtn.textContent = 'Signing in…';
      try {
        const result = await PK_AUTH.login(loginEmail.value.trim(), loginPassword.value);
        if (!result.isAdmin) {
          loginMsg.textContent = 'Not authorized';
        } else {
          loginEmail.value = '';
          loginPassword.value = '';
          showApp(true);
        }
      } catch (err) {
        loginMsg.textContent = err.message || 'Sign in failed';
      } finally {
        loginBtn.disabled = false;
        loginBtn.textContent = 'Sign in';
      }
    });

    logoutBtn.addEventListener('click', async () => {
      await PK_AUTH.logout();
      showLogin();
    });

    global.addEventListener('pk:authchanged', e => {
      if (e.detail.isAdmin) showApp(true);
      else showLogin();
    });

    PK_AUTH.init().then(result => {
      if (result.isAdmin) showApp(true);
      else showLogin();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})(window);
