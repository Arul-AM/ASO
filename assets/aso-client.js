// Shared Supabase client bootstrap. Depends on assets/config.js and the
// supabase-js CDN script being loaded first.
(function () {
  function whenReady(cb) {
    if (window.supabase && window.ASO_CONFIG) return cb();
    setTimeout(function () { whenReady(cb); }, 30);
  }
  window.asoReady = function (cb) {
    whenReady(function () {
      if (!window.asoClient) {
        window.asoClient = window.supabase.createClient(
          window.ASO_CONFIG.SUPABASE_URL,
          window.ASO_CONFIG.SUPABASE_ANON_KEY
        );
      }
      cb(window.asoClient);
    });
  };
})();
