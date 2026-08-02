import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { z } from 'zod'
import crypto from 'node:crypto'

// ---------------------------------------------------------------------------
// Firebase Admin (lazy init)
// ---------------------------------------------------------------------------
function getAdminApp() {
  if (getApps().length) return getApps()[0]
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n')
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Firebase Admin credentials not configured')
  }
  return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) })
}

// ---------------------------------------------------------------------------
// Schema de entrada — patientId vem do URL, não do body
// ---------------------------------------------------------------------------
const changePatientStatusSchema = z.object({
  targetStatus: z.enum(['active', 'inactive', 'discharged', 'archived', 'restricted']),
  reason: z.string().trim().min(10).max(2000),
  requestId: z.string().trim().min(1).max(128),
})

// ---------------------------------------------------------------------------
// Matriz de transições de status do paciente
// ---------------------------------------------------------------------------
const PATIENT_TRANSITIONS = Object.freeze({
  active: ['inactive', 'discharged', 'archived', 'restricted'],
  inactive: ['active', 'archived', 'restricted'],
  discharged: ['archived'],
  archived: [],
  restricted: ['active', 'inactive'],
})

// ---------------------------------------------------------------------------
// Ações de auditoria mapeadas por status destino
// ---------------------------------------------------------------------------
const AUDIT_ACTION_MAP = Object.freeze({
  inactive: 'patient.deactivated',
  active: 'patient.reactivated',
  restricted: 'patient.restricted',
  discharged: 'patient.discharged',
  archived: 'patient.archived',
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function json(response, status, body) {
  return response.status(status).json(body)
}

function failure(response, status, code, message) {
  return json(response, status, { error: { code, message } })
}

async function verifyActor(request) {
  const match = request.headers.authorization?.match(/^Bearer\s+(\S+)$/)
  if (!match) return null
  try {
    return await getAuth(getAdminApp()).verifyIdToken(match[1])
  } catch {
    return null
  }
}

function corsHeaders(request, response) {
  const origin = request.headers.origin
  const allowed =
    origin === 'https://fonoflow.vercel.app' ||
    /^http:\/\/localhost(:\d+)?$/.test(origin || '')
  response.setHeader('Access-Control-Allow-Origin', allowed ? origin : 'https://fonoflow.vercel.app')
  response.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS')
  response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
}

/**
 * Calcula fingerprint determinístico da operação para idempotência.
 * Inclui: patientId, targetStatus, reason normalizado, actorId.
 */
function computeFingerprint(patientId, targetStatus, reason, actorId) {
  const raw = `${patientId}|${targetStatus}|${reason.trim().toLowerCase()}|${actorId}`
  return crypto.createHash('sha256').update(raw).digest('hex')
}

/**
 * Normaliza o status atual do paciente, aceitando campos legados.
 * Não grava patientStatusV2 — apenas lê para compatibilidade.
 */
function normalizeCurrentStatus(data) {
  return data.status || data.patientStatusV2 || 'active'
}

/**
 * Verifica legal hold scoped ao paciente alvo.
 *
 * Consulta apenas documentos na subcoleção do paciente específico:
 *   patients/{patientId}/documents
 * com where('patientId', '==', patientId) + where('legalHold', '==', true).
 *
 * Documentos legados sem patientId não serão retornados, mas isso é
 * seguro — legal hold só existe quando explicitamente aplicado pelo backend.
 */
async function checkPatientLegalHold(db, patientId) {
  const snap = await db
    .collection('patients')
    .doc(patientId)
    .collection('documents')
    .where('patientId', '==', patientId)
    .where('legalHold', '==', true)
    .limit(1)
    .get()
  return !snap.empty
}

// ---------------------------------------------------------------------------
// Handler principal
// ---------------------------------------------------------------------------
export default async function handler(request, response) {
  corsHeaders(request, response)
  if (request.method === 'OPTIONS') return response.status(200).end()
  if (request.method !== 'POST') {
    return failure(response, 405, 'METHOD_NOT_ALLOWED', 'Método não permitido.')
  }

  // --- Autenticação ---
  const actor = await verifyActor(request)
  if (!actor?.uid) {
    return failure(response, 401, 'UNAUTHENTICATED', 'Sessão inválida ou expirada.')
  }

  // --- Extrair patientId do URL ---
  // URL: /api/patients/{patientId}/status
  // Vercel dynamic route: api/patients/[patientId]/status.js
  const patientId = request.query?.patientId
  if (!patientId) {
    return failure(response, 400, 'MISSING_PATIENT_ID', 'ID do paciente não informado na URL.')
  }

  // --- Validação do payload ---
  let payload
  try {
    payload = changePatientStatusSchema.parse(request.body)
  } catch (err) {
    return failure(response, 400, 'INVALID_PAYLOAD', err?.message || 'Payload inválido.')
  }

  const db = getFirestore(getAdminApp())
  const patientRef = db.collection('patients').doc(patientId)
  const opRef = db.collection('patientStatusOperations').doc(payload.requestId)

  // --- Transação atômica ---
  const result = await db.runTransaction(async (tx) => {
    // 1. Ler operação de idempotência PRIMEIRO
    const opSnap = await tx.get(opRef)
    if (opSnap.exists) {
      const op = opSnap.data()
      // Comparar fingerprint
      const storedFp = op.fingerprint || ''
      const currentFp = computeFingerprint(patientId, payload.targetStatus, payload.reason, actor.uid)
      if (storedFp !== currentFp) {
        throw {
          code: 'IDEMPOTENCY_CONFLICT',
          message: 'Identificador de operação reutilizado com dados diferentes.',
        }
      }
      // Mesma operação — replay sem duplicar auditoria
      return {
        replayed: true,
        previousStatus: op.previousStatus,
        newStatus: op.targetStatus,
      }
    }

    // 2. Ler paciente e normalizar status
    const patientSnap = await tx.get(patientRef)
    if (!patientSnap.exists) {
      throw { code: 'PATIENT_NOT_FOUND', message: 'Paciente não encontrado.' }
    }

    const patientData = patientSnap.data()

    // 3. Verificar propriedade
    if (patientData.userId !== actor.uid) {
      throw { code: 'FORBIDDEN', message: 'Acesso ao prontuário não autorizado.' }
    }

    const currentStatus = normalizeCurrentStatus(patientData)

    // 4. Se já está no status alvo — registrar operação idempotente SEM auditoria de mudança
    if (currentStatus === payload.targetStatus) {
      tx.set(opRef, {
        patientId,
        actorId: actor.uid,
        previousStatus: currentStatus,
        targetStatus: payload.targetStatus,
        reason: payload.reason,
        fingerprint: computeFingerprint(patientId, payload.targetStatus, payload.reason, actor.uid),
        createdAt: FieldValue.serverTimestamp(),
      })
      return {
        replayed: true,
        previousStatus: currentStatus,
        newStatus: currentStatus,
      }
    }

    // 5. Validar transição pela matriz
    const allowed = PATIENT_TRANSITIONS[currentStatus] || []
    if (!allowed.includes(payload.targetStatus)) {
      throw {
        code: 'INVALID_TRANSITION',
        message: `Transição de "${currentStatus}" para "${payload.targetStatus}" não permitida.`,
      }
    }

    // 6. Legal hold (apenas do paciente alvo)
    if (payload.targetStatus === 'restricted') {
      const hasHold = await checkPatientLegalHold(db, patientId)
      if (hasHold) {
        throw {
          code: 'LEGAL_HOLD_ACTIVE',
          message: 'Paciente possui documentos sob legal hold. Restrição não permitida.',
        }
      }
    }

    // 7. Atualizar paciente — campo canônico "status" apenas (NÃO patientStatusV2)
    tx.update(patientRef, {
      status: payload.targetStatus,
      statusReason: payload.reason,
      statusChangedAt: FieldValue.serverTimestamp(),
      statusChangedBy: actor.uid,
      updatedAt: FieldValue.serverTimestamp(),
    })

    // 8. Registrar operação de idempotência
    tx.set(opRef, {
      patientId,
      actorId: actor.uid,
      previousStatus: currentStatus,
      targetStatus: payload.targetStatus,
      reason: payload.reason,
      fingerprint: computeFingerprint(patientId, payload.targetStatus, payload.reason, actor.uid),
      createdAt: FieldValue.serverTimestamp(),
    })

    // 9. Registrar auditoria NA MESMA TRANSAÇÃO (atomicidade)
    const auditAction = AUDIT_ACTION_MAP[payload.targetStatus] || 'patient.status_changed'
    tx.set(db.collection('auditLogs').doc(), {
      actorId: actor.uid,
      actorEmail: typeof actor.email === 'string' ? actor.email.slice(0, 200) : '',
      action: auditAction,
      patientId,
      resourceId: patientId,
      changedFields: ['status', 'statusReason', 'statusChangedAt', 'statusChangedBy'],
      metadata: {
        previousStatus: currentStatus,
        newStatus: payload.targetStatus,
        reason: payload.reason,
        requestId: payload.requestId,
      },
      occurredAt: FieldValue.serverTimestamp(),
      source: 'api',
      schemaVersion: 1,
    })

    return {
      replayed: false,
      previousStatus: currentStatus,
      newStatus: payload.targetStatus,
    }
  })

  return json(response, 200, result)
}
