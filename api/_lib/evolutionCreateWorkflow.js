import { createHash } from 'node:crypto'
import { FieldValue } from 'firebase-admin/firestore'
import { convertAppointmentV1ToV2, normalizeAppointmentDocument } from '../../src/mappers/appointment.mapper.js'
import { convertPatientV1ToV2 } from '../../src/mappers/patient.mapper.js'
import {
  parseAppointmentForUpdate, parseEvolutionFinalize, parsePatientForUpdate,
} from '../../src/schemas/persistence.parsers.js'
import { appointmentStatusToV2, assertAppointmentTransition } from '../../src/domain/appointments/appointmentTransitions.js'
import { buildPatientAccountingPatch } from './patientAccountingWorkflow.js'

export class EvolutionCreateError extends Error {
  constructor(code, message) {
    super(message || code)
    this.name = 'EvolutionCreateError'
    this.code = code
  }
}

function fail(code, message) {
  throw new EvolutionCreateError(code, message)
}

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function consolidatedEvolution(patientId, payload) {
  const author = payload.createdBy || payload.authorId || payload.professionalId
  return {
    ...payload, schemaVersion: 2, patientId, professionalId: author,
    appointmentId: payload.appointmentId ?? payload.scheduleId ?? null,
    serviceDate: payload.serviceDate || payload.date,
    durationMinutes: Number(payload.durationMinutes ?? payload.duration ?? 0),
    structuredContent: payload.structuredContent || { sessionObjectives: [], procedures: [], clinicalFindings: payload.clinicalActivity || null, patientResponse: payload.observedResponse || null, performanceSummary: null, incidents: null, familyGuidance: null, nextSessionPlan: payload.nextStep || null },
    richText: payload.richText || { html: null, json: payload.richContent || null, plainText: payload.notes || '' },
    status: payload.voided ? 'voided' : (payload.status || 'finalized'), createdBy: author,
  }
}

function applyObjectiveProgress(objectives = [], progress = [], now = new Date()) {
  const byId = new Map(progress.map((item) => [item.objectiveId, item]))
  return objectives.map((objective) => {
    const update = byId.get(objective.id)
    if (!update) return objective
    return { ...objective, status: update.status || objective.status, lastPerformance: update.performance || '', lastProgressAt: now.toISOString() }
  })
}

function fingerprint({ patientId, scheduleId, authorId, payload }) {
  const raw = `${patientId}|${scheduleId || ''}|${authorId}|${payload.serviceDate || payload.date || ''}|${payload.durationMinutes ?? payload.duration ?? ''}|${payload.notes || ''}`
  return sha256(raw)
}

/**
 * Criação governada de evolução clínica (fluxo padrão/gratuito — sem revisão
 * de qualidade). Cobre os dois casos anteriormente resolvidos client-side em
 * patientService.js:
 *   - completeScheduledEvolution: scheduleId presente, sempre debita sessão;
 *   - createClinicalEvolution: scheduleId ausente, debita apenas se
 *     incrementSession for true (default).
 * Contador de sessão, status do paciente, vínculo com agenda, histórico
 * terapêutico e auditoria são gravados na mesma transação — nunca em uma
 * chamada HTTP separada.
 */
export async function createClinicalEvolutionGoverned({
  uid, patientId, scheduleId = null, incrementSession = true, payload, operationId, db, now = new Date(),
}) {
  if (!uid) fail('UNAUTHENTICATED', 'Usuário não autenticado.')
  if (!patientId) fail('MISSING_PATIENT_ID', 'ID do paciente é obrigatório.')
  if (!operationId) fail('MISSING_OPERATION_ID', 'Identificador da operação é obrigatório.')

  const authorId = payload.createdBy || payload.authorId || payload.professionalId || uid
  const inputFingerprint = fingerprint({ patientId, scheduleId, authorId, payload })

  const patientRef = db.doc(`patients/${patientId}`)
  const scheduleRef = scheduleId ? db.doc(`schedules/${scheduleId}`) : null
  const planRef = db.doc(`patients/${patientId}/therapeuticPlan/current`)
  const operationRef = db.doc(`evolutionCreateOperations/${operationId}`)
  const evolutionRef = db.collection(`patients/${patientId}/evolutions`).doc()

  return db.runTransaction(async (transaction) => {
    const [operationSnap, patientSnap, scheduleSnap, planSnap] = await Promise.all([
      transaction.get(operationRef),
      transaction.get(patientRef),
      scheduleRef ? transaction.get(scheduleRef) : Promise.resolve(null),
      transaction.get(planRef),
    ])

    if (operationSnap.exists) {
      const previous = operationSnap.data()
      if (previous.fingerprint !== inputFingerprint || previous.uid !== uid) {
        fail('IDEMPOTENCY_CONFLICT', 'Identificador de operação reutilizado com dados diferentes.')
      }
      return { evolutionId: previous.evolutionId, replayed: true }
    }

    if (!patientSnap.exists) fail('PATIENT_NOT_FOUND', 'Paciente não encontrado.')
    const patientData = patientSnap.data()
    if (patientData.userId !== uid) fail('FORBIDDEN', 'Acesso ao prontuário não autorizado.')

    let scheduleData = null
    let normalizedSchedule = null
    if (scheduleRef) {
      if (!scheduleSnap.exists) fail('SCHEDULE_NOT_FOUND', 'Agendamento não encontrado.')
      scheduleData = scheduleSnap.data()
      if (scheduleData.patientId !== patientId) fail('CONFLICT', 'Agendamento não pertence ao paciente.')
      if (scheduleData.userId !== uid) fail('FORBIDDEN', 'Agendamento não pertence ao usuário autenticado.')
      normalizedSchedule = normalizeAppointmentDocument({ id: scheduleId, ...scheduleData })
      if (appointmentStatusToV2(normalizedSchedule.status) === 'completed' || scheduleData.evolutionId) {
        fail('schedule/already-completed', 'Este atendimento já foi registrado.')
      }
      assertAppointmentTransition(normalizedSchedule.status, 'completed')
    }

    const currentPatientV2 = convertPatientV1ToV2(patientData)
    const timestamp = FieldValue.serverTimestamp()
    const candidate = consolidatedEvolution(patientId, { ...payload, createdBy: authorId })

    transaction.set(evolutionRef, {
      ...parseEvolutionFinalize(candidate, patientId, authorId, timestamp),
      scheduleId,
      createdAt: timestamp,
    })

    const shouldIncrement = scheduleId ? true : incrementSession
    const patientUpdates = { updatedAt: timestamp }
    if (shouldIncrement) {
      const { patch } = buildPatientAccountingPatch(currentPatientV2, timestamp)
      Object.assign(patientUpdates, patch)
    }

    if (planSnap.exists && payload.objectiveProgress?.length > 0) {
      const objectives = applyObjectiveProgress(planSnap.data().objectives, payload.objectiveProgress, now)
      transaction.update(planRef, { objectives, updatedAt: timestamp })
      patientUpdates.therapeuticAchievedCount = objectives.filter((objective) => objective.status === 'Atingido').length
    }

    transaction.update(patientRef, parsePatientForUpdate(patientUpdates, currentPatientV2, authorId, timestamp))

    if (scheduleRef) {
      transaction.update(scheduleRef, parseAppointmentForUpdate({
        status: 'completed', schemaVersion: 2, evolutionId: evolutionRef.id, sessionDeducted: true,
        completedAt: timestamp,
        sessionAccounting: { ...(scheduleData.sessionAccounting || {}), deductSession: true, deductedAt: timestamp, deductionOperationId: evolutionRef.id },
        updatedAt: timestamp,
      }, convertAppointmentV1ToV2(scheduleData), timestamp))
    }

    transaction.set(operationRef, {
      uid, patientId, scheduleId, evolutionId: evolutionRef.id, fingerprint: inputFingerprint, createdAt: timestamp,
    })

    transaction.set(db.collection('auditLogs').doc(), {
      actorId: uid, action: 'evolution.created', patientId, resourceId: evolutionRef.id,
      changedFields: Object.keys(payload),
      occurredAt: timestamp, source: 'api.patients.evolutions', schemaVersion: 1,
    })

    return { evolutionId: evolutionRef.id, replayed: false }
  })
}
