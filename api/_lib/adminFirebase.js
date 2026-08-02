import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'

/**
 * Inicialização compartilhada do Admin SDK — consciente do emulador (mesmo
 * padrão de evolutionFinalizeFirebase.js), para que os workflows governados
 * de agenda/evolução sejam testáveis contra o Firestore Emulator sem subir
 * um servidor HTTP real.
 */
export function getAdminApp() {
  if (getApps().length) return getApps()[0]
  const emulatorProjectId = process.env.GCLOUD_PROJECT || 'demo-fonoflow'
  if (process.env.FIRESTORE_EMULATOR_HOST && emulatorProjectId?.startsWith('demo-')) {
    return initializeApp({ projectId: emulatorProjectId })
  }
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n')
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Firebase Admin credentials not configured')
  }
  return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) })
}

export function adminDb() {
  return getFirestore(getAdminApp())
}

export function adminServerTimestamp() {
  return FieldValue.serverTimestamp()
}

export async function verifyBearerToken(request) {
  const match = request.headers?.authorization?.match(/^Bearer\s+(\S+)$/)
  if (!match) return null
  try {
    return await getAuth(getAdminApp()).verifyIdToken(match[1])
  } catch {
    return null
  }
}

export function corsHeaders(request, response) {
  const origin = request.headers?.origin
  const allowed =
    origin === 'https://fonoflow.vercel.app' ||
    /^http:\/\/localhost(:\d+)?$/.test(origin || '')
  response.setHeader('Access-Control-Allow-Origin', allowed ? origin : 'https://fonoflow.vercel.app')
  response.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS')
  response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
}
