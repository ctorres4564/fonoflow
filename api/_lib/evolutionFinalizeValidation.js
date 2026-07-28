import {
  EvolutionQualityError,
} from '../../src/domain/evolutionQuality.js'
import {
  canonicalizeEvolutionForReview,
  getAlertKey,
  normalizeAlerts,
  validateApplicability,
} from '../../src/utils/evolutionQuality.js'
import {
  ALERT_DEFINITIONS,
  ALERT_IDENTITY_FIELDS,
  APPLICABILITY_ENTRY_FIELDS,
  APPLICABILITY_FIELDS,
  DOCUMENT_ID_PATTERN,
  EVOLUTION_FIELDS,
  FINALIZE_LIMITS,
  IDEMPOTENCY_UUID_PATTERN,
  ISO_DATE_PATTERN,
  OBJECTIVE_FIELDS,
  REVIEW_SESSION_FIELDS,
  ROOT_FIELDS,
} from './evolutionFinalizeContract.js'
import { FINALIZE_ERROR_CODES, finalizeError } from './evolutionFinalizeErrors.js'

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function assertExactFields(value, allowed, required = allowed, errorCode = FINALIZE_ERROR_CODES.INVALID_PAYLOAD) {
  if (!isPlainObject(value)) throw finalizeError(errorCode, 'object_expected')
  const keys = Object.keys(value)
  if (keys.some((key) => !allowed.includes(key)) || required.some((key) => !Object.hasOwn(value, key))) {
    throw finalizeError(errorCode, 'unexpected_or_missing_field')
  }
}

function assertString(value, maxLength, { allowEmpty = true, reason = 'invalid_string' } = {}) {
  if (typeof value !== 'string' || (!allowEmpty && !value.trim())) throw finalizeError(FINALIZE_ERROR_CODES.INVALID_PAYLOAD, reason)
  if (value.length > maxLength) throw finalizeError(FINALIZE_ERROR_CODES.LIMIT_EXCEEDED, reason)
}

function assertDocumentId(value, nullable = false) {
  if (nullable && value === null) return
  assertString(value, FINALIZE_LIMITS.idLength, { allowEmpty: false, reason: 'invalid_document_id' })
  if (value !== value.trim() || !DOCUMENT_ID_PATTERN.test(value) || value === '..') throw finalizeError(FINALIZE_ERROR_CODES.INVALID_PAYLOAD, 'invalid_document_id')
}

function assertCalendarDate(value) {
  assertString(value, 10, { allowEmpty: false, reason: 'invalid_date' })
  if (!ISO_DATE_PATTERN.test(value)) throw finalizeError(FINALIZE_ERROR_CODES.INVALID_PAYLOAD, 'invalid_date')
  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    throw finalizeError(FINALIZE_ERROR_CODES.INVALID_PAYLOAD, 'invalid_date')
  }
}

function assertIsoTimestamp(value, field) {
  assertString(value, FINALIZE_LIMITS.reviewTimestampLength, { allowEmpty: false, reason: `invalid_${field}` })
  if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) {
    throw finalizeError(FINALIZE_ERROR_CODES.INVALID_PAYLOAD, `invalid_${field}`)
  }
}

export function validateRequestMethod(method) {
  if (method !== 'POST') throw finalizeError(FINALIZE_ERROR_CODES.METHOD_NOT_ALLOWED)
  return 'POST'
}

export function parseJsonBody(rawBody) {
  if (isPlainObject(rawBody)) return rawBody
  if (typeof rawBody !== 'string') throw finalizeError(FINALIZE_ERROR_CODES.INVALID_JSON)
  try {
    const parsed = JSON.parse(rawBody)
    if (!isPlainObject(parsed)) throw new Error('not_object')
    return parsed
  } catch {
    throw finalizeError(FINALIZE_ERROR_CODES.INVALID_JSON)
  }
}

export function validateIdempotencyKey(value) {
  if (value == null || value === '') throw finalizeError(FINALIZE_ERROR_CODES.IDEMPOTENCY_KEY_REQUIRED)
  if (typeof value !== 'string' || value.length > FINALIZE_LIMITS.idempotencyKeyLength) {
    throw finalizeError(FINALIZE_ERROR_CODES.INVALID_IDEMPOTENCY_KEY)
  }
  const normalized = value.trim().toLowerCase()
  if (normalized.length !== FINALIZE_LIMITS.idempotencyKeyLength || !IDEMPOTENCY_UUID_PATTERN.test(normalized)) {
    throw finalizeError(FINALIZE_ERROR_CODES.INVALID_IDEMPOTENCY_KEY)
  }
  return { key: normalized, operationScope: 'create' }
}

function validateApplicabilityPayload(applicability, evolution) {
  assertExactFields(applicability, APPLICABILITY_FIELDS, [])
  for (const field of APPLICABILITY_FIELDS) {
    const entry = applicability[field]
    if (entry == null) continue
    assertExactFields(entry, APPLICABILITY_ENTRY_FIELDS)
    if (typeof entry.applicable !== 'boolean') throw finalizeError(FINALIZE_ERROR_CODES.INVALID_PAYLOAD, 'invalid_applicability_flag')
    assertString(entry.reasonCode, 80, { reason: 'invalid_applicability_reason' })
    assertString(entry.note, FINALIZE_LIMITS.applicabilityNoteLength, { reason: 'invalid_applicability_note' })
    const validation = validateApplicability(field, entry)
    if (!validation.valid) throw finalizeError(FINALIZE_ERROR_CODES.INVALID_PAYLOAD, validation.error)
    if (entry.applicable && (entry.reasonCode || entry.note)) throw finalizeError(FINALIZE_ERROR_CODES.INVALID_PAYLOAD, 'applicable_with_reason')
    if (!entry.applicable && evolution[field].trim()) throw finalizeError(FINALIZE_ERROR_CODES.INVALID_PAYLOAD, 'not_applicable_with_content')
  }
}

function validateObjectivePayload(objectives) {
  if (!Array.isArray(objectives)) throw finalizeError(FINALIZE_ERROR_CODES.INVALID_PAYLOAD, 'objectives_not_array')
  if (objectives.length > FINALIZE_LIMITS.objectives) throw finalizeError(FINALIZE_ERROR_CODES.LIMIT_EXCEEDED, 'too_many_objectives')
  objectives.forEach((objective) => {
    assertExactFields(objective, OBJECTIVE_FIELDS, ['objectiveId'])
    assertString(objective.objectiveId, FINALIZE_LIMITS.idLength, { allowEmpty: false, reason: 'invalid_objective_id' })
    for (const [field, limit] of [
      ['description', FINALIZE_LIMITS.objectiveDescriptionLength],
      ['area', FINALIZE_LIMITS.objectiveAreaLength],
      ['status', FINALIZE_LIMITS.objectiveStatusLength],
      ['performance', FINALIZE_LIMITS.objectivePerformanceLength],
    ]) assertString(objective[field] ?? '', limit, { reason: `invalid_objective_${field}` })
  })
}

function validateAlertIdentity(alert, category) {
  assertExactFields(alert, ALERT_IDENTITY_FIELDS, ALERT_IDENTITY_FIELDS, category)
  const definition = ALERT_DEFINITIONS[alert.code]
  if (!definition || alert.category !== definition.category || alert.field !== definition.field) {
    throw finalizeError(category, 'unknown_or_conflicting_alert')
  }
  if (definition.objective) {
    assertString(alert.objectiveId, FINALIZE_LIMITS.idLength, { allowEmpty: false, reason: 'invalid_alert_objective' })
  } else if (alert.objectiveId !== null) {
    throw finalizeError(category, 'unexpected_alert_objective')
  }
  return { code: alert.code, category: alert.category, field: alert.field, objectiveId: alert.objectiveId }
}

function validateAlertList(alerts, category) {
  if (!Array.isArray(alerts)) throw finalizeError(category, 'alerts_not_array')
  if (alerts.length > FINALIZE_LIMITS.alertsPerList) throw finalizeError(FINALIZE_ERROR_CODES.LIMIT_EXCEEDED, 'too_many_alerts')
  const normalized = alerts.map((alert) => validateAlertIdentity(alert, category))
  const keys = normalized.map(getAlertKey)
  if (new Set(keys).size !== keys.length) throw finalizeError(category, 'duplicate_alert')
  return normalizeAlerts(normalized).map(({ code, category: alertCategory, field, objectiveId }) => ({ code, category: alertCategory, field, objectiveId }))
}

function validateReviewSession(reviewSession) {
  assertExactFields(reviewSession, REVIEW_SESSION_FIELDS)
  if (!Number.isInteger(reviewSession.reviewPasses) || reviewSession.reviewPasses < 1 || reviewSession.reviewPasses > FINALIZE_LIMITS.reviewPasses) {
    throw finalizeError(FINALIZE_ERROR_CODES.INVALID_PAYLOAD, 'invalid_review_passes')
  }
  assertIsoTimestamp(reviewSession.startedAt, 'started_at')
  assertIsoTimestamp(reviewSession.completedAt, 'completed_at')
  if (Date.parse(reviewSession.completedAt) < Date.parse(reviewSession.startedAt)) {
    throw finalizeError(FINALIZE_ERROR_CODES.INVALID_PAYLOAD, 'review_dates_inverted')
  }
  return {
    initialAlerts: validateAlertList(reviewSession.initialAlerts, FINALIZE_ERROR_CODES.INVALID_PAYLOAD),
    finalAlerts: validateAlertList(reviewSession.finalAlerts, FINALIZE_ERROR_CODES.INVALID_DECISION),
    ignoredAlerts: validateAlertList(reviewSession.ignoredAlerts, FINALIZE_ERROR_CODES.INVALID_DECISION),
    reviewPasses: reviewSession.reviewPasses,
    startedAt: new Date(reviewSession.startedAt).toISOString(),
    completedAt: new Date(reviewSession.completedAt).toISOString(),
  }
}

function mapQualityError(error) {
  if (!(error instanceof EvolutionQualityError)) return error
  if (error.code === 'UNSUPPORTED_EVOLUTION_SCHEMA' || error.code === 'LEGACY_EVOLUTION_NOT_REVIEWABLE') {
    return finalizeError(FINALIZE_ERROR_CODES.UNSUPPORTED_VERSION)
  }
  if (error.code === 'DUPLICATE_OBJECTIVE_CONFLICT') return finalizeError(FINALIZE_ERROR_CODES.OBJECTIVE_CONFLICT)
  if (error.code === 'INVALID_DURATION') return finalizeError(FINALIZE_ERROR_CODES.INVALID_PAYLOAD, 'invalid_duration')
  return finalizeError(FINALIZE_ERROR_CODES.INVALID_PAYLOAD, error.code)
}

export function validateFinalizePayload(payload) {
  let serialized
  try { serialized = JSON.stringify(payload) } catch { throw finalizeError(FINALIZE_ERROR_CODES.INVALID_PAYLOAD, 'not_serializable') }
  if (Buffer.byteLength(serialized || '', 'utf8') > FINALIZE_LIMITS.payloadBytes) throw finalizeError(FINALIZE_ERROR_CODES.LIMIT_EXCEEDED, 'payload_too_large')

  assertExactFields(payload, ROOT_FIELDS)
  if (payload.operation !== 'create' || payload.expectedEvolutionRevision !== null) throw finalizeError(FINALIZE_ERROR_CODES.INVALID_PAYLOAD, 'invalid_operation')
  assertDocumentId(payload.patientId)
  assertDocumentId(payload.scheduleId, true)
  if (typeof payload.incrementSession !== 'boolean') throw finalizeError(FINALIZE_ERROR_CODES.INVALID_PAYLOAD, 'invalid_increment_session')
  if (payload.scheduleId !== null && payload.incrementSession !== true) {
    throw finalizeError(FINALIZE_ERROR_CODES.INVALID_PAYLOAD, 'scheduled_session_must_increment')
  }
  assertExactFields(payload.evolution, EVOLUTION_FIELDS)
  assertCalendarDate(payload.evolution.date)
  assertString(payload.evolution.clinicalActivity, FINALIZE_LIMITS.clinicalActivityLength, { reason: 'invalid_clinical_activity' })
  assertString(payload.evolution.observedResponse, FINALIZE_LIMITS.observedResponseLength, { reason: 'invalid_observed_response' })
  assertString(payload.evolution.nextStep, FINALIZE_LIMITS.nextStepLength, { reason: 'invalid_next_step' })
  assertString(payload.evolution.notes, FINALIZE_LIMITS.notesLength, { reason: 'invalid_notes' })
  validateObjectivePayload(payload.evolution.objectiveProgress)
  validateApplicabilityPayload(payload.evolution.applicability, payload.evolution)

  let canonicalEvolution
  try { canonicalEvolution = canonicalizeEvolutionForReview({ ...payload.evolution, evolutionRevision: 1 }) } catch (error) { throw mapQualityError(error) }
  const reviewSession = validateReviewSession(payload.reviewSession)
  return {
    operation: 'create',
    patientId: payload.patientId,
    scheduleId: payload.scheduleId,
    expectedEvolutionRevision: null,
    incrementSession: payload.incrementSession,
    evolution: canonicalEvolution,
    reviewSession,
  }
}

export function validateDecisions({ clientFinalAlerts, clientIgnoredAlerts, serverAlerts, evolution }) {
  const normalizedServer = normalizeAlerts(serverAlerts).map(({ code, category, field, objectiveId }) => ({ code, category, field, objectiveId }))
  const serverKeys = normalizedServer.map(getAlertKey)
  const finalKeys = clientFinalAlerts.map(getAlertKey)
  const ignoredKeys = clientIgnoredAlerts.map(getAlertKey)
  if (JSON.stringify(finalKeys) !== JSON.stringify(serverKeys)) throw finalizeError(FINALIZE_ERROR_CODES.INVALID_DECISION, 'final_alerts_do_not_match_server')
  if (JSON.stringify(ignoredKeys) !== JSON.stringify(serverKeys)) throw finalizeError(FINALIZE_ERROR_CODES.INVALID_DECISION, 'ignored_alerts_do_not_match_final')

  for (const field of APPLICABILITY_FIELDS) {
    const entry = evolution.applicability[field]
    if (entry.applicable === false) {
      const validation = validateApplicability(field, entry)
      if (!validation.valid || evolution[field]) throw finalizeError(FINALIZE_ERROR_CODES.INVALID_DECISION, 'panel_only_neutralization')
    }
  }
  return { finalAlerts: normalizedServer, ignoredAlerts: normalizedServer }
}
