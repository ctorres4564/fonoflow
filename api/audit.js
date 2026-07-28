import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'

const ACTIONS = new Set([
  'patient.created', 'patient.updated', 'patient.deleted',
  'record.viewed', 'record.exported',
  'evolution.created', 'evolution.revised', 'evolution.deleted',
  'anamnesis.updated', 'document.uploaded', 'document.deleted',
])

function cors(request, response) {
  const origin = request.headers.origin
  const allowed = origin === 'https://fonoflow.vercel.app' || /^http:\/\/localhost(:\d+)?$/.test(origin || '')
  response.setHeader('Access-Control-Allow-Origin', allowed ? origin : 'https://fonoflow.vercel.app')
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
}

function adminApp() {
  if (getApps().length) return getApps()[0]
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n')
  if (!projectId || !clientEmail || !privateKey) throw new Error('Firebase Admin credentials are not configured')
  return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) })
}

async function actor(request) {
  const match = request.headers.authorization?.match(/^Bearer\s+(\S+)$/)
  if (!match) return null
  return getAuth(adminApp()).verifyIdToken(match[1])
}

function cleanString(value, max = 120) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

async function ownsPatient(db, uid, patientId) {
  if (!patientId) return false
  const snapshot = await db.collection('patients').doc(patientId).get()
  return snapshot.exists && snapshot.data()?.userId === uid
}

export default async function handler(request, response) {
  cors(request, response)
  if (request.method === 'OPTIONS') return response.status(200).end()
  if (!['GET', 'POST'].includes(request.method)) return response.status(405).json({ error: 'Method not allowed' })

  let decoded
  try {
    decoded = await actor(request)
  } catch (error) {
    console.error('Audit authentication failed:', error?.code || error?.message)
  }
  if (!decoded?.uid) return response.status(401).json({ error: 'Sessão inválida ou expirada.' })

  const db = getFirestore(adminApp())
  if (request.method === 'GET') {
    const limit = Math.min(Math.max(Number(request.query?.limit) || 100, 1), 200)
    const snapshot = await db.collection('auditLogs').where('actorId', '==', decoded.uid).limit(limit).get()
    const events = snapshot.docs
      .map((item) => ({ id: item.id, ...item.data(), occurredAt: item.data().occurredAt?.toDate?.().toISOString() || null }))
      .sort((a, b) => String(b.occurredAt).localeCompare(String(a.occurredAt)))
    return response.status(200).json({ events })
  }

  const action = cleanString(request.body?.action, 60)
  const patientId = cleanString(request.body?.patientId)
  if (!ACTIONS.has(action)) return response.status(400).json({ error: 'Ação de auditoria inválida.' })

  // Eventos de criação podem ser registrados após o documento existir. Todos os
  // demais eventos também exigem que o usuário seja proprietário do prontuário.
  if (!(await ownsPatient(db, decoded.uid, patientId))) {
    return response.status(403).json({ error: 'Acesso ao prontuário não autorizado.' })
  }

  const changedFields = Array.isArray(request.body?.changedFields)
    ? request.body.changedFields.map((field) => cleanString(field, 60)).filter(Boolean).slice(0, 40)
    : []
  const event = {
    actorId: decoded.uid,
    actorEmail: cleanString(decoded.email, 200),
    action,
    patientId,
    resourceId: cleanString(request.body?.resourceId),
    changedFields,
    occurredAt: FieldValue.serverTimestamp(),
    source: 'web',
    schemaVersion: 1,
  }
  const ref = await db.collection('auditLogs').add(event)
  return response.status(201).json({ id: ref.id })
}
