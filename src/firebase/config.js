import { initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth } from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore'

const useEmulators = import.meta.env.DEV && import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || (useEmulators ? 'demo-api-key' : undefined),
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || (useEmulators ? 'demo-fonoflow.firebaseapp.com' : undefined),
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || (useEmulators ? 'demo-fonoflow' : undefined),
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || (useEmulators ? 'demo-fonoflow.appspot.com' : undefined),
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || (useEmulators ? '000000000000' : undefined),
  appId: import.meta.env.VITE_FIREBASE_APP_ID || (useEmulators ? '1:000000000000:web:demo' : undefined),
}

export const app = initializeApp(firebaseConfig)

export const auth = getAuth(app)
export const db = getFirestore(app)

if (useEmulators && !globalThis.__FONOFLOW_FIREBASE_EMULATORS_CONNECTED__) {
  connectAuthEmulator(auth, import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_URL || 'http://127.0.0.1:9099', { disableWarnings: true })
  connectFirestoreEmulator(db, import.meta.env.VITE_FIRESTORE_EMULATOR_HOST || '127.0.0.1', Number(import.meta.env.VITE_FIRESTORE_EMULATOR_PORT || 8080))
  globalThis.__FONOFLOW_FIREBASE_EMULATORS_CONNECTED__ = true
}
