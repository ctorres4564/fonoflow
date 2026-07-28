import { createHash } from 'node:crypto'
import { QUALITY_RULE_SET_VERSION, REVIEW_SCHEMA_VERSION } from '../../src/domain/evolutionQuality.js'
import {
  canonicalizeEvolutionForReview,
  getAlertKey,
  normalizeAlerts,
  reviewEvolutionQuality,
  stableStringifyEvolutionForReview,
} from '../../src/utils/evolutionQuality.js'
import { validateDecisions, validateFinalizePayload, validateIdempotencyKey, validateRequestMethod } from './evolutionFinalizeValidation.js'

function alertIdentity({ code, category, field, objectiveId }) {
  return { code, category, field, objectiveId }
}

export function calculateEvolutionSha256(evolution) {
  const canonical = stableStringifyEvolutionForReview(evolution)
  return `sha256:${createHash('sha256').update(canonical, 'utf8').digest('hex')}`
}

export function recalculateServerChecklist(evolution, therapeuticPlan = null) {
  return normalizeAlerts(reviewEvolutionQuality({ evolution, therapeuticPlan }).alerts).map(alertIdentity)
}

export function prepareEvolutionFinalizeOperation({ method, idempotencyKey, payload, therapeuticPlan = null }) {
  validateRequestMethod(method)
  const idempotency = validateIdempotencyKey(idempotencyKey)
  const validated = validateFinalizePayload(payload)
  const reviewableEvolution = {
    ...validated.evolution,
    schemaVersion: validated.evolution.evolutionSchemaVersion,
  }
  const canonicalEvolution = canonicalizeEvolutionForReview(reviewableEvolution)
  const { evolutionSchemaVersion, ...canonicalFields } = canonicalEvolution
  const evolution = { schemaVersion: evolutionSchemaVersion, ...canonicalFields }
  const serverAlerts = recalculateServerChecklist(reviewableEvolution, therapeuticPlan)
  const decisions = validateDecisions({
    clientFinalAlerts: validated.reviewSession.finalAlerts,
    clientIgnoredAlerts: validated.reviewSession.ignoredAlerts,
    serverAlerts,
    evolution: canonicalEvolution,
  })
  const initialAlerts = validated.reviewSession.initialAlerts
  const finalKeys = new Set(serverAlerts.map(getAlertKey))
  const resolvedAlerts = initialAlerts.filter((alert) => !finalKeys.has(getAlertKey(alert)))
  const durationMs = Date.parse(validated.reviewSession.completedAt) - Date.parse(validated.reviewSession.startedAt)

  return {
    operation: 'create',
    operationIdentity: idempotency,
    patientId: validated.patientId,
    scheduleId: validated.scheduleId,
    expectedEvolutionRevision: null,
    incrementSession: validated.incrementSession,
    evolution,
    reviewedContentHash: calculateEvolutionSha256(reviewableEvolution),
    review: {
      reviewSchemaVersion: REVIEW_SCHEMA_VERSION,
      qualityRuleSetVersion: QUALITY_RULE_SET_VERSION,
      evolutionSchemaVersion,
      evolutionRevision: canonicalEvolution.evolutionRevision,
      initialAlerts,
      finalAlerts: decisions.finalAlerts,
      resolvedAlerts,
      ignoredAlerts: decisions.ignoredAlerts,
      reviewPasses: validated.reviewSession.reviewPasses,
      startedAt: validated.reviewSession.startedAt,
      completedAt: validated.reviewSession.completedAt,
      durationMs,
      counts: {
        initial: initialAlerts.length,
        final: decisions.finalAlerts.length,
        resolved: resolvedAlerts.length,
        ignored: decisions.ignoredAlerts.length,
      },
    },
  }
}
