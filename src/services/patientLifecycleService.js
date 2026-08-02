import { auth } from '../firebase/config'

// Matriz de transições — espelha o backend (api/patients/[patientId]/status.js)
export const PATIENT_TRANSITIONS = Object.freeze({
  active: ['inactive', 'discharged', 'archived', 'restricted'],
  inactive: ['active', 'archived', 'restricted'],
  discharged: ['archived'],
  archived: [],
  restricted: ['active', 'inactive'],
})

const VALID_STATUSES = Object.keys(PATIENT_TRANSITIONS)

/**
 * Valida se a transição de status é permitida.
 * @param {string} currentStatus - Status atual (normalized)
 * @param {string} targetStatus - Status desejado
 * @returns {boolean}
 */
export function validatePatientStatusTransition(currentStatus, targetStatus) {
  const allowed = PATIENT_TRANSITIONS[currentStatus] || []
  return allowed.includes(targetStatus)
}

/**
 * Lista de transições válidas para um status atual.
 * @param {string} currentStatus
 * @returns {readonly string[]}
 */
export function getValidTransitions(currentStatus) {
  return PATIENT_TRANSITIONS[currentStatus] || []
}

/**
 * Lê o status atual do paciente, com compatibilidade V1/V2.
 * Usa patientStatusV2 como fallback apenas em memória — nunca grava.
 * @param {object} patient
 * @returns {string}
 */
export function getPatientCurrentStatus(patient) {
  return patient.status || patient.patientStatusV2 || 'active'
}

/**
 * Mapeia status interno para label em português.
 */
const STATUS_LABELS = Object.freeze({
  active: 'Ativo',
  inactive: 'Inativo',
  discharged: 'Finalizado',
  archived: 'Arquivado',
  restricted: 'Restrito',
})

export function getPatientStatusLabel(status) {
  return STATUS_LABELS[status] || status
}

/**
 * Envia requisição de mudança de status ao backend.
 *
 * Fluxo completo:
 * 1. Valida targetStatus contra matriz
 * 2. Exige motivo (mín. 10 caracteres)
 * 3. Obtém token de autenticação
 * 4. Gera requestId único
 * 5. POST /api/patients/{patientId}/status
 * 6. Retorna resultado ou lança erro com code
 *
 * @param {string} patientId
 * @param {string} targetStatus - active|inactive|discharged|archived|restricted
 * @param {string} reason - justificativa (mín. 10 caracteres)
 * @returns {Promise<{replayed:boolean, previousStatus:string, newStatus:string}>}
 */
export async function changePatientStatus(patientId, targetStatus, reason) {
  if (!targetStatus || !VALID_STATUSES.includes(targetStatus)) {
    const error = new Error('Status de destino inválido.')
    error.code = 'INVALID_STATUS'
    throw error
  }

  const trimmedReason = String(reason || '').trim()
  if (trimmedReason.length < 10) {
    const error = new Error('Justificativa obrigatória (mínimo 10 caracteres).')
    error.code = 'MISSING_REASON'
    throw error
  }

  const idToken = await auth.currentUser?.getIdToken()
  if (!idToken) {
    const error = new Error('Usuário não autenticado.')
    error.code = 'UNAUTHENTICATED'
    throw error
  }

  const requestId = crypto.randomUUID()

  const res = await fetch(`/api/patients/${patientId}/status`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      targetStatus,
      reason: trimmedReason,
      requestId,
    }),
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const error = new Error(data.error?.message || 'Não foi possível alterar o status do paciente.')
    error.code = data.error?.code || 'INTERNAL_ERROR'
    throw error
  }

  return data
}
