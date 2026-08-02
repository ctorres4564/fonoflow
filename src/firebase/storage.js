import { connectStorageEmulator, getStorage } from 'firebase/storage'
import { app } from './config'

export const storage = getStorage(app)

if (
  import.meta.env.DEV &&
  import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true' &&
  !globalThis.__FONOFLOW_STORAGE_EMULATOR_CONNECTED__
) {
  connectStorageEmulator(
    storage,
    import.meta.env.VITE_STORAGE_EMULATOR_HOST || '127.0.0.1',
    Number(import.meta.env.VITE_STORAGE_EMULATOR_PORT || 9199),
  )
  globalThis.__FONOFLOW_STORAGE_EMULATOR_CONNECTED__ = true
}
