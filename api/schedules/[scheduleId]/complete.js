import { z } from 'zod'
import { adminDb, corsHeaders, verifyBearerToken } from '../../_lib/adminFirebase.js'
import { AppointmentCompletionError, completeAppointment } from '../../_lib/appointmentCompletionWorkflow.js'
import { HOME_CARE_VISIT_STATUSES } from '../../../src/domain/homeCare/homeCareVisitTransitions.js'

const bodySchema = z.object({
  patientId: z.string().trim().min(1),
  operationId: z.string().trim().min(1).max(128),
  reason: z.string().trim().max(2000).optional().default(''),
  homeCareVisit: z.object({
    targetStatus: z.enum(HOME_CARE_VISIT_STATUSES),
    details: z.record(z.string(), z.unknown()).optional().default({}),
  }).optional().nullable(),
})

function json(response, status, body) {
  return response.status(status).json(body)
}

function failure(response, status, code, message) {
  return json(response, status, { error: { code, message } })
}

const ERROR_STATUS = {
  UNAUTHENTICATED: 401,
  MISSING_SCHEDULE_ID: 400,
  MISSING_PATIENT_ID: 400,
  MISSING_OPERATION_ID: 400,
  SCHEDULE_NOT_FOUND: 404,
  PATIENT_NOT_FOUND: 404,
  VISIT_NOT_FOUND: 404,
  FORBIDDEN: 403,
  IDEMPOTENCY_CONFLICT: 409,
  'appointment/invalid-transition': 409,
  'appointment/session-limit': 409,
  'home-care/invalid-transition': 409,
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

  const scheduleId = request.query?.scheduleId
  if (!scheduleId) {
    return failure(response, 400, 'MISSING_SCHEDULE_ID', 'ID do agendamento não informado na URL.')
  }

  let payload
  try {
    payload = bodySchema.parse(request.body)
  } catch (err) {
    return failure(response, 400, 'INVALID_PAYLOAD', err?.message || 'Payload inválido.')
  }

  try {
    const result = await completeAppointment({
      uid: actor.uid,
      scheduleId,
      patientId: payload.patientId,
      operationId: payload.operationId,
      reason: payload.reason,
      homeCareVisit: payload.homeCareVisit || null,
      db: adminDb(),
    })
    return json(response, 200, result)
  } catch (error) {
    const code = error instanceof AppointmentCompletionError ? error.code : (error?.code || 'INTERNAL_ERROR')
    const status = ERROR_STATUS[code] || 500
    return failure(response, status, code, error.message || 'Não foi possível concluir o atendimento.')
  }
}
