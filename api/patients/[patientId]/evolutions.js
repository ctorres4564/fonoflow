import { z } from 'zod'
import { adminDb, corsHeaders, verifyBearerToken } from '../../_lib/adminFirebase.js'
import { createClinicalEvolutionGoverned, EvolutionCreateError } from '../../_lib/evolutionCreateWorkflow.js'
import { SchemaNormalizationError } from '../../../src/mappers/patient.mapper.js'

const bodySchema = z.object({
  scheduleId: z.string().trim().min(1).optional().nullable(),
  incrementSession: z.boolean().optional().default(true),
  operationId: z.string().trim().min(1).max(128),
  payload: z.record(z.string(), z.unknown()),
})

function json(response, status, body) {
  return response.status(status).json(body)
}

function failure(response, status, code, message) {
  return json(response, status, { error: { code, message } })
}

const ERROR_STATUS = {
  UNAUTHENTICATED: 401,
  MISSING_PATIENT_ID: 400,
  MISSING_OPERATION_ID: 400,
  PATIENT_NOT_FOUND: 404,
  SCHEDULE_NOT_FOUND: 404,
  FORBIDDEN: 403,
  CONFLICT: 409,
  'schedule/already-completed': 409,
  IDEMPOTENCY_CONFLICT: 409,
  'appointment/invalid-transition': 409,
  'appointment/session-limit': 409,
}

export default async function handler(request, response) {
  corsHeaders(request, response)
  if (request.method === 'OPTIONS') return response.status(200).end()
  if (request.method !== 'POST') {
    return failure(response, 405, 'METHOD_NOT_ALLOWED', 'Método não permitido.')
  }

  const actor = await verifyBearerToken(request)
  if (!actor?.uid) {
    return failure(response, 401, 'UNAUTHENTICATED', 'Sessão inválida ou expirada.')
  }

  const patientId = request.query?.patientId
  if (!patientId) {
    return failure(response, 400, 'MISSING_PATIENT_ID', 'ID do paciente não informado na URL.')
  }

  let body
  try {
    body = bodySchema.parse(request.body)
  } catch (err) {
    return failure(response, 400, 'INVALID_PAYLOAD', err?.message || 'Payload inválido.')
  }

  try {
    const result = await createClinicalEvolutionGoverned({
      uid: actor.uid,
      patientId,
      scheduleId: body.scheduleId || null,
      incrementSession: body.incrementSession,
      payload: body.payload,
      operationId: body.operationId,
      db: adminDb(),
    })
    return json(response, result.replayed ? 200 : 201, result)
  } catch (error) {
    if (error instanceof SchemaNormalizationError) {
      return failure(response, 400, 'INVALID_EVOLUTION', error.message)
    }
    const code = error instanceof EvolutionCreateError ? error.code : (error?.code || 'INTERNAL_ERROR')
    const status = ERROR_STATUS[code] || 500
    return failure(response, status, code, error.message || 'Não foi possível registrar a evolução.')
  }
}
