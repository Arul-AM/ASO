// Shared Firebase client bootstrap. Depends on the firebase-*-compat.js CDN
// scripts and assets/firebase-config.js being loaded first.
(function () {
  function whenReady(cb) {
    if (window.firebase && window.ASO_FIREBASE_CONFIG) return cb();
    setTimeout(function () { whenReady(cb); }, 30);
  }
  window.asoReady = function (cb) {
    whenReady(function () {
      if (!window.firebase.apps.length) {
        window.firebase.initializeApp(window.ASO_FIREBASE_CONFIG);
      }
      cb({
        auth: window.firebase.auth(),
        db: window.firebase.firestore(),
      });
    });
  };
})();
