// ============================================================
// Fill these in from Firebase Console → Project settings (gear icon) →
// General tab → "Your apps" → the web app's config snippet.
// These values are safe to expose publicly — Firebase web config is not
// a secret; access is controlled by your Firestore/Auth security rules,
// not by hiding this object.
// ============================================================
window.ASO_FIREBASE_CONFIG = {
  apiKey: "YOUR-API-KEY",
  authDomain: "YOUR-PROJECT-ID.firebaseapp.com",
  projectId: "YOUR-PROJECT-ID",
  storageBucket: "YOUR-PROJECT-ID.appspot.com",
  messagingSenderId: "YOUR-SENDER-ID",
  appId: "YOUR-APP-ID",
};

// The base URL your Cloud Functions deploy to. After you run
// `firebase deploy --only functions`, the CLI prints each function's URL —
// they all share this same prefix, just swap the region/project below.
window.ASO_FUNCTIONS_BASE = "https://REGION-YOUR-PROJECT-ID.cloudfunctions.net";
