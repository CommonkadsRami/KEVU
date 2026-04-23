// Optional Firebase Auth + Firestore sync. Lazily loaded so the app still
// boots with no network and no config.

let mods = null;
let app = null, auth = null, db = null;
let userCb = null;
let unsubDoc = null;

async function loadSdk() {
  if (mods) return mods;
  const base = 'https://www.gstatic.com/firebasejs/10.12.0';
  const [appMod, authMod, fsMod] = await Promise.all([
    import(`${base}/firebase-app.js`),
    import(`${base}/firebase-auth.js`),
    import(`${base}/firebase-firestore.js`)
  ]);
  mods = { appMod, authMod, fsMod };
  return mods;
}

function hasConfig(cfg) {
  return cfg && cfg.apiKey && cfg.projectId && cfg.appId;
}

export async function initCloud(firebaseConfig) {
  if (!hasConfig(firebaseConfig)) {
    return makeStub();
  }
  const { appMod, authMod, fsMod } = await loadSdk();
  app = appMod.initializeApp(firebaseConfig);
  auth = authMod.getAuth(app);
  db = fsMod.getFirestore(app);

  authMod.onAuthStateChanged(auth, (u) => { if (userCb) userCb(u); });

  return {
    isReal: true,

    onUser(cb) {
      userCb = cb;
      if (auth.currentUser !== undefined) cb(auth.currentUser);
    },

    currentUser: () => auth.currentUser,

    async signInGoogle() {
      const provider = new authMod.GoogleAuthProvider();
      try {
        return await authMod.signInWithPopup(auth, provider);
      } catch (err) {
        if (String(err?.code || '').includes('popup')) {
          return authMod.signInWithRedirect(auth, provider);
        }
        throw err;
      }
    },

    async signInApple() {
      const provider = new authMod.OAuthProvider('apple.com');
      provider.addScope('email');
      provider.addScope('name');
      try {
        return await authMod.signInWithPopup(auth, provider);
      } catch (err) {
        if (String(err?.code || '').includes('popup')) {
          return authMod.signInWithRedirect(auth, provider);
        }
        throw err;
      }
    },

    signInEmail: (email, password) => authMod.signInWithEmailAndPassword(auth, email, password),
    signUpEmail: (email, password) => authMod.createUserWithEmailAndPassword(auth, email, password),
    sendReset:   (email)            => authMod.sendPasswordResetEmail(auth, email),
    signOut:     ()                 => authMod.signOut(auth),

    async subscribe(uid, onRemote) {
      if (unsubDoc) { unsubDoc(); unsubDoc = null; }
      const ref = fsMod.doc(db, 'users', uid);
      unsubDoc = fsMod.onSnapshot(ref, (snap) => {
        if (!snap.exists()) return;
        onRemote(snap.data());
      });
      return unsubDoc;
    },

    async push(uid, state) {
      const ref = fsMod.doc(db, 'users', uid);
      await fsMod.setDoc(ref, state, { merge: true });
    },

    async wipeCloud(uid) {
      const ref = fsMod.doc(db, 'users', uid);
      await fsMod.deleteDoc(ref);
    }
  };
}

function makeStub() {
  const warn = (name) => () => { throw new Error(`${name}() requires Firebase config (see config.example.js).`); };
  return {
    isReal: false,
    onUser(cb) { cb(null); },
    currentUser: () => null,
    signInGoogle: warn('signInGoogle'),
    signInApple:  warn('signInApple'),
    signInEmail:  warn('signInEmail'),
    signUpEmail:  warn('signUpEmail'),
    sendReset:    warn('sendReset'),
    signOut:      async () => {},
    subscribe:    async () => () => {},
    push:         async () => {},
    wipeCloud:    async () => {}
  };
}
