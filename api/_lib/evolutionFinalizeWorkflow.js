import { createHash } from 'node:crypto'
import { calculateEvolutionSha256, prepareEvolutionFinalizeOperation } from './evolutionFinalizeService.js'
import { validateFinalizePayload, validateIdempotencyKey } from './evolutionFinalizeValidation.js'
import { FINALIZE_ERROR_CODES, finalizeError } from './evolutionFinalizeErrors.js'

const REVIEW_ID = 'revision-1'
const COMPLETABLE_SCHEDULE_STATUSES = new Set(['Agendado', 'Confirmado'])
const OBJECTIVE_STATUSES = new Set(['Não iniciado', 'Em desenvolvimento', 'Parcialmente atingido', 'Atingido', 'Reavaliar', 'Suspenso'])
const AUDIT_CHANGED_FIELDS = Object.freeze([
  'schemaVersion', 'evolutionRevision', 'sessionType', 'date', 'duration', 'clinicalActivity',
  'observedResponse', 'nextStep', 'notes', 'applicability', 'objectiveProgress', 'scheduleId',
  'reviewedContentHash', 'createdBy',
])

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

export function operationDocumentId(uid, idempotencyKey) {
  return sha256(`${uid}:create:${idempotencyKey}`)
}

export function rateLimitDocumentId(uid, windowKey) {
  return sha256(`${uid}:${windowKey}`)
}

export function authorizeProfile(profile) {
  if (!profile || profile.features?.evolutionQualityReview !== true) {
    throw finalizeError(FINALIZE_ERROR_CODES.FORBIDDEN, 'individual_feature_disabled')
  }
}

function authoritativeEvolution(evolution, plan) {
  const objectives = Array.isArray(plan?.objectives) ? plan.objectives : []
  const byId = new Map(objectives.map((objective) => [objective?.id, objective]))
  const objectiveProgress = evolution.objectiveProgress.map((progress) => {
    const objective = byId.get(progress.objectiveId)
    if (!objective) throw finalizeError(FINALIZE_ERROR_CODES.OBJECTIVE_CONFLICT, 'objective_not_in_current_plan')
    for (const field of ['description', 'area']) {
      if (progress[field] && progress[field] !== String(objective[field] || '')) {
        throw finalizeError(FINALIZE_ERROR_CODES.OBJECTIVE_CONFLICT, 'objective_metadata_conflict')
      }
    }
    const requestedStatus = progress.status || objective.status || ''
    if (!OBJECTIVE_STATUSES.has(requestedStatus)) {
      throw finalizeError(FINALIZE_ERROR_CODES.OBJECTIVE_CONFLICT, 'invalid_objective_status')
    }
    return {
      objectiveId: progress.objectiveId,
      description: String(objective.description || ''),
      area: String(objective.area || ''),
      status: requestedStatus,
      performance: progress.performance,
    }
  })
  return { ...evolution, objectiveProgress }
}

function applyObjectiveProgress(objectives = [], progress = [], now = new Date()) {
  const byId = new Map(progress.map((item) => [item.objectiveId, item]))
  return objectives.map((objective) => {
    const update = byId.get(objective.id)
    if (!update) return objective
    return {
      ...objective,
      status: update.status || objective.status,
      lastPerformance: update.performance || '',
      lastProgressAt: now.toISOString(),
    }
  })
}

function success(evolutionId, replayed) {
  return { evolutionId, reviewId: REVIEW_ID, evolutionRevision: 1, status: 'created', replayed }
}

export async function finalizeEvolutionCreate({ uid, method = 'POST', idempotencyKey, payload, repository, now = new Date() }) {
  const validated = validateFinalizePayload(payload)
  const { key } = validateIdempotencyKey(idempotencyKey)
  const inputHash = calculateEvolutionSha256({ ...validated.evolution, schemaVersion: 2 })
  const windowKey = now.toISOString().slice(0, 16)
  await repository.consumeRateLimit({ uid, documentId: rateLimitDocumentId(uid, windowKey), windowKey, now })

  const evolutionId = repository.createId(`patients/${validated.patientId}/evolutions`)
  const auditId = repository.createId('auditLogs')
  const operationId = operationDocumentId(uid, key)

  return repository.runTransaction(async (transaction) => {
    const paths = {
      profile: `users/${uid}`,
      patient: `patients/${validated.patientId}`,
      plan: `patients/${validated.patientId}/therapeuticPlan/current`,
      schedule: validated.scheduleId ? `schedules/${validated.scheduleId}` : null,
      operation: `evolutionFinalizeOperations/${operationId}`,
      evolution: `patients/${validated.patientId}/evolutions/${evolutionId}`,
      review: `patients/${validated.patientId}/evolutions/${evolutionId}/qualityReviews/${REVIEW_ID}`,
      audit: `auditLogs/${auditId}`,
    }
    const [profile, patient, plan, schedule, previous] = await transaction.readMany([
      paths.profile, paths.patient, paths.plan, paths.schedule, paths.operation,
    ])

    authorizeProfile(profile)
    if (!patient) throw finalizeError(FINALIZE_ERROR_CODES.NOT_FOUND, 'patient_not_found')
    if (patient.userId !== uid) throw finalizeError(FINALIZE_ERROR_CODES.FORBIDDEN, 'patient_not_owned')

    if (previous) {
      if (previous.uid !== uid || previous.operation !== 'create' || previous.patientId !== validated.patientId || previous.clinicalContentHash !== inputHash) {
        throw finalizeError(FINALIZE_ERROR_CODES.CONFLICT, 'idempotency_conflict')
      }
      return success(previous.evolutionId, true)
    }

    if (patient.status !== 'Ativo') throw finalizeError(FINALIZE_ERROR_CODES.CONFLICT, 'patient_not_active')

    if (validated.scheduleId) {
      if (!schedule) throw finalizeError(FINALIZE_ERROR_CODES.NOT_FOUND, 'schedule_not_found')
      if (schedule.patientId !== validated.patientId || schedule.userId !== uid) throw finalizeError(FINALIZE_ERROR_CODES.FORBIDDEN, 'schedule_not_owned')
      if (!COMPLETABLE_SCHEDULE_STATUSES.has(schedule.status) || schedule.evolutionId) throw finalizeError(FINALIZE_ERROR_CODES.CONFLICT, 'schedule_not_completable')
      if (schedule.sessionType !== validated.evolution.sessionType) throw finalizeError(FINALIZE_ERROR_CODES.CONFLICT, 'schedule_session_type_conflict')
    }

    const evolutionWithContext = authoritativeEvolution(payload.evolution, plan)
    const normalizedPayload = { ...payload, evolution: evolutionWithContext }
    const operation = prepareEvolutionFinalizeOperation({ method, idempotencyKey: key, payload: normalizedPayload, therapeuticPlan: plan })
    const timestamp = repository.serverTimestamp()
    const evolution = {
      ...operation.evolution,
      evolutionRevision: 1,
      scheduleId: validated.scheduleId,
      reviewedContentHash: operation.reviewedContentHash,
      createdAt: timestamp,
      createdBy: uid,
    }
    const review = {
      reviewSchemaVersion: operation.review.reviewSchemaVersion,
      qualityRuleSetVersion: operation.review.qualityRuleSetVersion,
      evolutionSchemaVersion: operation.review.evolutionSchemaVersion,
      evolutionRevision: 1,
      reviewedContentHash: operation.reviewedContentHash,
      sessionType: operation.evolution.sessionType,
      clientReportedInitialAlerts: operation.review.initialAlerts,
      finalAlerts: operation.review.finalAlerts,
      resolvedAlerts: operation.review.resolvedAlerts,
      resolvedAlertsBasis: 'clientReportedInitialAlerts',
      ignoredAlerts: operation.review.ignoredAlerts,
      counts: {
        clientReportedInitial: operation.review.counts.initial,
        final: operation.review.counts.final,
        clientDerivedResolved: operation.review.counts.resolved,
        ignored: operation.review.counts.ignored,
      },
      reviewPasses: operation.review.reviewPasses,
      startedAt: operation.review.startedAt,
      completedAt: operation.review.completedAt,
      durationMs: operation.review.durationMs,
      reviewedBy: uid,
      createdAt: timestamp,
    }

    transaction.create(paths.evolution, evolution)
    transaction.create(paths.review, review)
    transaction.create(paths.operation, {
      uid, operation: 'create', keyHash: operationId, clinicalContentHash: inputHash,
      patientId: validated.patientId, evolutionId, status: 'created', createdAt: timestamp,
      response: { evolutionId, reviewId: REVIEW_ID, evolutionRevision: 1, status: 'created' },
    })
    transaction.create(paths.audit, {
      actorId: uid, action: 'evolution.created', patientId: validated.patientId, resourceId: evolutionId,
      changedFields: [...AUDIT_CHANGED_FIELDS], occurredAt: timestamp,
      source: 'api.evolutions.finalize', schemaVersion: 1,
    })

    const patientUpdates = { updatedAt: timestamp }
    if (validated.incrementSession) {
      const completedSessions = (Number(patient.completedSessions) || 0) + 1
      const remainingSessions = Math.max((Number(patient.totalSessions) || 0) - completedSessions, 0)
      Object.assign(patientUpdates, { completedSessions, remainingSessions, status: remainingSessions > 0 ? 'Ativo' : 'Finalizado' })
    }
    if (plan && operation.evolution.objectiveProgress.length > 0) {
      const objectives = applyObjectiveProgress(plan.objectives, operation.evolution.objectiveProgress, now)
      transaction.update(paths.plan, { objectives, updatedAt: timestamp })
      patientUpdates.therapeuticAchievedCount = objectives.filter((objective) => objective.status === 'Atingido').length
    }
    transaction.update(paths.patient, patientUpdates)
    if (paths.schedule) transaction.update(paths.schedule, {
      status: 'Realizado', evolutionId, sessionDeducted: true, completedAt: timestamp, updatedAt: timestamp,
    })
    return success(evolutionId, false)
  })
}
