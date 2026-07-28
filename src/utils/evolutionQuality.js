import {
  EVOLUTION_FORMATS,
  EVOLUTION_SCHEMA_VERSION,
  EvolutionQualityError,
  FIELD_APPLICABILITY_REASONS,
  MAX_EVOLUTION_DURATION_MINUTES,
  NOT_APPLICABLE_REASONS,
  QUALITY_ALERT_CODES,
  QUALITY_RULE_SET_VERSION,
  REVIEW_SCHEMA_VERSION,
  getEvolutionFormat,
  isSessionType,
} from '../domain/evolutionQuality.js'

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

export function compareCodeUnits(left, right) {
  if (left === right) return 0
  return left < right ? -1 : 1
}

export function normalizeQualityText(value, field = 'text') {
  if (value == null) return ''
  if (typeof value !== 'string') throw new EvolutionQualityError('INVALID_TEXT_TYPE', { field })
  return value.normalize('NFC').replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').trim()
}

function validateDuration(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > MAX_EVOLUTION_DURATION_MINUTES) {
    throw new EvolutionQualityError('INVALID_DURATION')
  }
  return value
}

function canonicalApplicabilityEntry(value, field) {
  if (value == null) return { applicable: true, reasonCode: '', note: '' }
  if (!isPlainObject(value)) throw new EvolutionQualityError('INVALID_APPLICABILITY_ENTRY', { field })
  if (value.applicable != null && typeof value.applicable !== 'boolean') {
    throw new EvolutionQualityError('INVALID_APPLICABILITY_FLAG', { field })
  }
  return {
    applicable: value.applicable !== false,
    reasonCode: normalizeQualityText(value.reasonCode, `${field}.reasonCode`),
    note: normalizeQualityText(value.note, `${field}.note`),
  }
}

function canonicalApplicability(value) {
  if (value == null) value = {}
  if (!isPlainObject(value)) throw new EvolutionQualityError('INVALID_APPLICABILITY')
  return {
    clinicalActivity: canonicalApplicabilityEntry(value.clinicalActivity, 'clinicalActivity'),
    observedResponse: canonicalApplicabilityEntry(value.observedResponse, 'observedResponse'),
  }
}

function canonicalObjectiveItem(item, index) {
  if (!isPlainObject(item)) throw new EvolutionQualityError('INVALID_OBJECTIVE_ITEM', { index })
  const canonical = {
    objectiveId: normalizeQualityText(item.objectiveId, `objectiveProgress.${index}.objectiveId`),
    description: normalizeQualityText(item.description, `objectiveProgress.${index}.description`),
    area: normalizeQualityText(item.area, `objectiveProgress.${index}.area`),
    status: normalizeQualityText(item.status, `objectiveProgress.${index}.status`),
    performance: normalizeQualityText(item.performance, `objectiveProgress.${index}.performance`),
  }
  if (!canonical.objectiveId) throw new EvolutionQualityError('INVALID_OBJECTIVE_ID', { index })
  return canonical
}

/**
 * Normaliza objetivos sem modificar o array original. A igualdade considera
 * objectiveId, description, area, status e performance após normalização.
 * Duplicatas idênticas são colapsadas; o mesmo ID com qualquer desses campos
 * diferente gera DUPLICATE_OBJECTIVE_CONFLICT.
 */
export function normalizeObjectiveProgress(progress) {
  if (!Array.isArray(progress)) throw new EvolutionQualityError('INVALID_OBJECTIVE_PROGRESS')
  const byId = new Map()
  progress.forEach((item, index) => {
    const canonical = canonicalObjectiveItem(item, index)
    const serialized = JSON.stringify(canonical)
    const previous = byId.get(canonical.objectiveId)
    if (previous && previous.serialized !== serialized) {
      throw new EvolutionQualityError('DUPLICATE_OBJECTIVE_CONFLICT', { objectiveId: canonical.objectiveId })
    }
    if (!previous) byId.set(canonical.objectiveId, { canonical, serialized })
  })
  return [...byId.values()].map(({ canonical }) => canonical)
    .sort((left, right) => compareCodeUnits(left.objectiveId, right.objectiveId))
}

export function assertStructuredEvolution(evolution) {
  if (!isPlainObject(evolution)) throw new EvolutionQualityError('INVALID_EVOLUTION')
  const format = getEvolutionFormat(evolution.schemaVersion)
  if (format === EVOLUTION_FORMATS.LEGACY) throw new EvolutionQualityError('LEGACY_EVOLUTION_NOT_REVIEWABLE')
  if (format === EVOLUTION_FORMATS.UNKNOWN) throw new EvolutionQualityError('UNSUPPORTED_EVOLUTION_SCHEMA')
  if (!isSessionType(evolution.sessionType)) throw new EvolutionQualityError('INVALID_SESSION_TYPE')
  validateDuration(evolution.duration)
  normalizeQualityText(evolution.date, 'date')
  normalizeQualityText(evolution.clinicalActivity, 'clinicalActivity')
  normalizeQualityText(evolution.observedResponse, 'observedResponse')
  normalizeQualityText(evolution.nextStep, 'nextStep')
  normalizeQualityText(evolution.notes, 'notes')
  canonicalApplicability(evolution.applicability)
  normalizeObjectiveProgress(evolution.objectiveProgress)
  if (evolution.evolutionRevision != null && (!Number.isInteger(evolution.evolutionRevision) || evolution.evolutionRevision < 1)) {
    throw new EvolutionQualityError('INVALID_EVOLUTION_REVISION')
  }
  return true
}

export function validateApplicability(field, value = {}) {
  const canonical = canonicalApplicabilityEntry(value, field)
  if (canonical.applicable) return { valid: true, applicable: true }
  const allowedReasons = FIELD_APPLICABILITY_REASONS[field] || []
  if (!allowedReasons.includes(canonical.reasonCode)) return { valid: false, applicable: false, error: 'invalid_reason' }
  if (canonical.reasonCode === NOT_APPLICABLE_REASONS.OTHER && !canonical.note) {
    return { valid: false, applicable: false, error: 'missing_other_note' }
  }
  return { valid: true, applicable: false }
}

export function getAlertKey(alert = {}) {
  const code = typeof alert.code === 'string' ? alert.code : ''
  const field = typeof alert.field === 'string' ? alert.field : ''
  const objectiveId = typeof alert.objectiveId === 'string' ? alert.objectiveId : null
  return JSON.stringify([code, field, objectiveId])
}

function normalizeAlert(alert) {
  return {
    code: alert.code,
    category: alert.category,
    field: alert.field,
    objectiveId: alert.objectiveId ?? null,
    severity: alert.severity,
    reason: alert.reason,
  }
}

export function normalizeAlerts(alerts) {
  if (!Array.isArray(alerts)) throw new EvolutionQualityError('INVALID_ALERTS')
  const unique = new Map()
  alerts.forEach((alert) => {
    if (!isPlainObject(alert) || typeof alert.code !== 'string' || typeof alert.category !== 'string' || typeof alert.field !== 'string') {
      throw new EvolutionQualityError('INVALID_ALERT')
    }
    const normalized = normalizeAlert(alert)
    const key = getAlertKey(normalized)
    if (!unique.has(key)) unique.set(key, normalized)
  })
  return [...unique.values()].sort((left, right) => compareCodeUnits(getAlertKey(left), getAlertKey(right)))
}

function missingFieldAlert(code, field, applicability) {
  return { code, category: 'absent', field, objectiveId: null, severity: 'attention', reason: applicability?.applicable === false ? 'invalid_not_applicable' : 'empty' }
}

export function reviewEvolutionQuality({ evolution = {}, therapeuticPlan = null } = {}) {
  assertStructuredEvolution(evolution)
  const objectiveProgress = normalizeObjectiveProgress(evolution.objectiveProgress)
  const applicability = canonicalApplicability(evolution.applicability)
  const activityApplicability = validateApplicability('clinicalActivity', applicability.clinicalActivity)
  const responseApplicability = validateApplicability('observedResponse', applicability.observedResponse)
  const alerts = []

  if (!normalizeQualityText(evolution.clinicalActivity, 'clinicalActivity') && (activityApplicability.applicable || !activityApplicability.valid)) {
    alerts.push(missingFieldAlert(QUALITY_ALERT_CODES.MISSING_ACTIVITY, 'clinicalActivity', activityApplicability))
  }
  if (!normalizeQualityText(evolution.observedResponse, 'observedResponse') && (responseApplicability.applicable || !responseApplicability.valid)) {
    alerts.push(missingFieldAlert(QUALITY_ALERT_CODES.MISSING_RESPONSE, 'observedResponse', responseApplicability))
  }
  if (!normalizeQualityText(evolution.nextStep, 'nextStep')) {
    alerts.push(missingFieldAlert(QUALITY_ALERT_CODES.MISSING_NEXT_STEP, 'nextStep', { applicable: true }))
  }
  objectiveProgress.forEach((progress) => {
    if (!progress.performance) alerts.push({ code: QUALITY_ALERT_CODES.MISSING_OBJECTIVE_PERFORMANCE, category: 'absent', field: 'objectiveProgress', objectiveId: progress.objectiveId, severity: 'attention', reason: 'empty' })
  })

  const activeObjectives = Array.isArray(therapeuticPlan?.objectives)
    ? therapeuticPlan.objectives.filter((objective) => objective?.status !== 'Suspenso')
    : []
  const hasActivePlan = therapeuticPlan?.status === 'Ativo' && activeObjectives.length > 0
  if (evolution.sessionType === 'Terapia' && hasActivePlan && objectiveProgress.length === 0) {
    alerts.push({ code: QUALITY_ALERT_CODES.UNLINKED_OBJECTIVE, category: 'suggestion', field: 'objectiveProgress', objectiveId: null, severity: 'info', reason: 'active_plan_without_link' })
  }

  const normalizedAlerts = normalizeAlerts(alerts)
  return {
    validSessionType: true,
    alerts: normalizedAlerts,
    summary: {
      totalAlerts: normalizedAlerts.length,
      absentCount: normalizedAlerts.filter((alert) => alert.category === 'absent').length,
      suggestionCount: normalizedAlerts.filter((alert) => alert.category === 'suggestion').length,
    },
  }
}

export function canonicalizeEvolutionForReview(evolution = {}) {
  assertStructuredEvolution(evolution)
  return {
    evolutionSchemaVersion: EVOLUTION_SCHEMA_VERSION,
    evolutionRevision: evolution.evolutionRevision ?? 1,
    sessionType: normalizeQualityText(evolution.sessionType, 'sessionType'),
    date: normalizeQualityText(evolution.date, 'date'),
    duration: validateDuration(evolution.duration),
    clinicalActivity: normalizeQualityText(evolution.clinicalActivity, 'clinicalActivity'),
    observedResponse: normalizeQualityText(evolution.observedResponse, 'observedResponse'),
    nextStep: normalizeQualityText(evolution.nextStep, 'nextStep'),
    notes: normalizeQualityText(evolution.notes, 'notes'),
    applicability: canonicalApplicability(evolution.applicability),
    objectiveProgress: normalizeObjectiveProgress(evolution.objectiveProgress),
  }
}

export function stableStringifyEvolutionForReview(evolution) {
  return JSON.stringify(canonicalizeEvolutionForReview(evolution))
}

function alertIdentity(alert) {
  const normalized = normalizeAlert(alert)
  return { code: normalized.code, category: normalized.category, field: normalized.field, objectiveId: normalized.objectiveId }
}

export function buildLocalReviewResult({ initialAlerts = [], finalAlerts = [], ignoredAlerts = [], reviewPasses = 1 } = {}) {
  const initial = normalizeAlerts(initialAlerts).map(alertIdentity)
  const final = normalizeAlerts(finalAlerts).map(alertIdentity)
  const ignored = normalizeAlerts(ignoredAlerts).map(alertIdentity)
  const finalKeys = new Set(final.map(getAlertKey))
  return {
    reviewSchemaVersion: REVIEW_SCHEMA_VERSION,
    qualityRuleSetVersion: QUALITY_RULE_SET_VERSION,
    initialAlerts: initial,
    finalAlerts: final,
    resolvedAlerts: initial.filter((alert) => !finalKeys.has(getAlertKey(alert))),
    ignoredAlerts: ignored,
    reviewPasses: Math.max(1, Number(reviewPasses) || 1),
  }
}

// O resultado local é informativo. O backend da Fase 2 deverá validar a
// estrutura, canonicalizar e executar novamente o motor antes de persistir.
