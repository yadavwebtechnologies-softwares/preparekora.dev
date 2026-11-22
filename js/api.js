(function (global) {
  'use strict';
  const WORKER = global.PK_CONFIG.WORKER_URL;

  async function getIdToken(force) {
    const user = firebase.auth().currentUser;
    if (!user) throw new Error('Not signed in');
    return user.getIdToken(!!force);
  }

  async function request(path, options) {
    options = options || {};
    const headers = Object.assign({}, options.headers || {});
    if (options.body && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
    if (options.auth !== false) {
      headers['Authorization'] = 'Bearer ' + await getIdToken(false);
    }

    let res = await fetch(WORKER + path, { ...options, headers });

    if (res.status === 401 && options.auth !== false) {
      headers['Authorization'] = 'Bearer ' + await getIdToken(true);
      res = await fetch(WORKER + path, { ...options, headers });
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
    return data;
  }

  global.PK_API = {
    get: (p, o) => request(p, { method: 'GET', ...(o || {}) }),
    post: (p, b, o) => request(p, { method: 'POST', body: JSON.stringify(b), ...(o || {}) }),
    put: (p, b, o) => request(p, { method: 'PUT', body: JSON.stringify(b), ...(o || {}) }),
    del: (p, o) => request(p, { method: 'DELETE', ...(o || {}) }),
    request,
    getIdToken
  };
})(window);
