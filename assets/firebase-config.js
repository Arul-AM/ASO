// ============================================================
// Fill these in from Firebase Console → Project settings (gear icon) →
// General tab → "Your apps" → the web app's config snippet.
// These values are safe to expose publicly — Firebase web config is not
// a secret; access is controlled by your Firestore/Auth security rules,
// not by hiding this object.
// ============================================================
// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyA8rJlEFvFPHjiax3tjOJN5t9zBx64_wJw",
  authDomain: "a-s-o-1a347.firebaseapp.com",
  projectId: "a-s-o-1a347",
  storageBucket: "a-s-o-1a347.firebasestorage.app",
  messagingSenderId: "258762368777",
  appId: "1:258762368777:web:a6115f2594445209f115d8",
  measurementId: "G-YPMD37DBY1"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

// The base URL your Cloud Functions deploy to. After you run
// `firebase deploy --only functions`, the CLI prints each function's URL —
// they all share this same prefix, just swap the region/project below.
window.ASO_FUNCTIONS_BASE = "https://REGION-YOUR-PROJECT-ID.cloudfunctions.net";
