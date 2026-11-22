(function (global) {
  'use strict';
  const WORKER = global.PK_CONFIG.WORKER_URL;

  let currentUser = null;
  let currentIsAdmin = false;

  function emit() {
    global.dispatchEvent(new CustomEvent('pk:authchanged', {
      detail: { user: currentUser, isAdmin: currentIsAdmin }
    }));
  }

  async function verifyUser(user) {
    if (!user) {
      currentUser = null;
      currentIsAdmin = false;
      emit();
      return { user: null, isAdmin: false };
    }
    try {
      const token = await user.getIdToken();
      const res = await fetch(WORKER + '/api/auth/verify', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token }
      }).then(r => r.json());
      if (!res.isAdmin) {
        await firebase.auth().signOut();
        currentUser = null;
        currentIsAdmin = false;
        emit();
        return { user: null, isAdmin: false };
      }
      currentUser = user;
      currentIsAdmin = true;
      emit();
      return { user, isAdmin: true };
    } catch (e) {
      console.error('verifyUser failed:', e);
      currentUser = null;
      currentIsAdmin = false;
      emit();
      return { user: null, isAdmin: false };
    }
  }

  async function init() {
    const cfg = await fetch(WORKER + '/api/firebase-config').then(r => r.json());
    firebase.initializeApp(cfg);
    return new Promise(resolve => {
      const unsub = firebase.auth().onAuthStateChanged(async user => {
        const result = await verifyUser(user);
        resolve(result);
      });
    });
  }

  async function login(email, password) {
    const cred = await firebase.auth().signInWithEmailAndPassword(email, password);
    return await verifyUser(cred.user);
  }

  async function logout() {
    await firebase.auth().signOut();
  }

  global.PK_AUTH = {
    init, login, logout,
    getUser: () => currentUser,
    isAdmin: () => currentIsAdmin
  };
})(window);
