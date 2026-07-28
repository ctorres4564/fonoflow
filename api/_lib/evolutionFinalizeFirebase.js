import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { FINALIZE_ERROR_CODES, finalizeError } from './evolutionFinalizeErrors.js'

export function getEvolutionAdminApp() {
  if (getApps().length) return getApps()[0]
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID
  const emulatorProjectId = process.env.GCLOUD_PROJECT || 'demo-fonoflow'
  if (process.env.FIRESTORE_EMULATOR_HOST && emulatorProjectId?.startsWith('demo-')) {
    return initializeApp({ projectId: emulatorProjectId })
  }
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n')
  if (!projectId || !clientEmail || !privateKey) throw new Error('firebase_admin_not_configured')
  return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) })
}

export async function authenticateEvolutionRequest(token) {
  const auth = getAuth(getEvolutionAdminApp())
  const decoded = await auth.verifyIdToken(token, true)
  const account = await auth.getUser(decoded.uid)
  assertAccountEnabled(account)
  return { uid: decoded.uid }
}

export function assertAccountEnabled(account) {
  if (account?.disabled) throw finalizeError(FINALIZE_ERROR_CODES.UNAUTHENTICATED, 'account_disabled')
  return true
}

export function createEvolutionRepository({ rateLimit = Number(process.env.EVOLUTION_FINALIZE_REQUESTS_PER_MINUTE || 10) } = {}) {
  const configuredRateLimit = Number.isInteger(rateLimit) && rateLimit > 0 ? rateLimit : 10
  const database = () => getFirestore(getEvolutionAdminApp())
  return {
    createId(collectionPath) { return database().collection(collectionPath).doc().id },
    serverTimestamp() { return FieldValue.serverTimestamp() },
    async consumeRateLimit({ uid, documentId, windowKey, now }) {
      const db = database()
      const ref = db.collection('evolutionFinalizeRateLimits').doc(documentId)
      return db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(ref)
        const count = Number(snapshot.data()?.count || 0)
        if (count >= configuredRateLimit) throw finalizeError(FINALIZE_ERROR_CODES.RATE_LIMITED, 'rate_limit_exceeded')
        transaction.set(ref, {
          uid, windowKey, count: count + 1, updatedAt: FieldValue.serverTimestamp(),
          expiresAt: new Date(now.getTime() + 120000),
        })
      })
    },
    runTransaction(callback) {
      const db = database()
      return db.runTransaction(async (nativeTransaction) => callback({
        async readMany(paths) {
          const snapshots = await Promise.all(paths.filter(Boolean).map((path) => nativeTransaction.get(db.doc(path))))
          let index = 0
          return paths.map((path) => {
            if (!path) return null
            const snapshot = snapshots[index++]
            return snapshot.exists ? snapshot.data() : null
          })
        },
        create(path, value) { nativeTransaction.create(db.doc(path), value) },
        update(path, value) { nativeTransaction.update(db.doc(path), value) },
      }))
    },
  }
}
