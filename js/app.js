(function (global) {
  'use strict';

  const $ = id => document.getElementById(id);

  function showIntro() {
    $('workspaceScreen').hidden = true;
    $('gateScreen').hidden = true;
    $('introScreen').hidden = false;
    window.scrollTo(0, 0);
  }

  function showWorkspace() {
    $('introScreen').hidden = true;
    $('gateScreen').hidden = true;
    $('workspaceScreen').hidden = false;
    global.PKWorkspace.init();
  }

  function boot() {
    PKGate.init();
    if (PKStore.hasSession()) showWorkspace();
    else showIntro();
  }

  global.PKApp = { showIntro, showWorkspace };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})(window);
