(function (global) {
  'use strict';

  const adminBtn = document.getElementById('adminBtn');
  const adminPanel = document.getElementById('adminPanel');
  const adminClose = document.getElementById('adminClose');
  const adminContent = document.getElementById('adminContent');

  const MODULES = ['qa-image', 'mcq-explanation', 'mcq-studio', 'mcq-paper', 'thumbnail'];

  async function loadAndRender() {
    adminContent.innerHTML = 'Loading…';
    try {
      const settings = await PK_API.get('/api/admin/settings');
      render(settings);
    } catch (e) {
      adminContent.innerHTML = '<p style="color:#d92d20">Failed to load settings: ' + e.message + '</p>';
    }
  }

  function render(settings) {
    const modules = settings.modules || {};
    adminContent.innerHTML = '';

    MODULES.forEach(key => {
      const cfg = modules[key] || {};
      const card = document.createElement('div');
      card.className = 'admin-module';
      card.innerHTML = `
        <h3>${key.replace(/-/g, ' ')}</h3>
        <div class="admin-field">
          <label>QR destination URL</label>
          <input type="url" data-module="${key}" data-field="qrDestination" value="${escapeAttr(cfg.qrDestination || '')}">
        </div>
        <button class="admin-save" data-save="${key}" type="button">Save</button>
        <p class="admin-msg" data-msg="${key}"></p>
      `;
      adminContent.appendChild(card);
    });

    adminContent.querySelectorAll('[data-save]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const key = btn.dataset.save;
        const input = adminContent.querySelector(`input[data-module="${key}"][data-field="qrDestination"]`);
        const msg = adminContent.querySelector(`[data-msg="${key}"]`);
        msg.textContent = 'Saving…';
        try {
          await PK_API.put('/api/admin/settings/module/' + key, {
            qrDestination: input.value.trim()
          });
          msg.textContent = 'Saved';
        } catch (e) {
          msg.textContent = 'Error: ' + e.message;
        }
      });
    });
  }

  function escapeAttr(s) {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  adminBtn.addEventListener('click', () => {
    adminPanel.hidden = false;
    loadAndRender();
  });
  adminClose.addEventListener('click', () => { adminPanel.hidden = true; });
  adminPanel.addEventListener('click', e => {
    if (e.target === adminPanel) adminPanel.hidden = true;
  });
})(window);
