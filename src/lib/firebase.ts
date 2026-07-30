import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { initializeFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

const requiredConfig = [
  firebaseConfig.apiKey,
  firebaseConfig.authDomain,
  firebaseConfig.projectId,
  firebaseConfig.appId,
];

if (requiredConfig.some((value) => !value)) {
  throw new Error(
    "Firebase configuration is incomplete. Copy .env.example to .env.local and provide the Firebase web configuration.",
  );
}

export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const firebaseAuth = getAuth(firebaseApp);
// Optional form fields are common throughout the planner. Ignoring undefined
// values prevents one optional property from rejecting an entire wallet or
// feature document while still preserving explicit null values.
export const firestore = initializeFirestore(firebaseApp, {
  ignoreUndefinedProperties: true,
});

export async function initializeFirebaseAnalytics() {
  if (typeof window === "undefined" || !firebaseConfig.measurementId) return null;

  const { getAnalytics, isSupported } = await import("firebase/analytics");
  if (!(await isSupported())) return null;

  return getAnalytics(firebaseApp);
}
