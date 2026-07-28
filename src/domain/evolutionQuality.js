export const EVOLUTION_SCHEMA_VERSION = 2
export const REVIEW_SCHEMA_VERSION = 1
export const QUALITY_RULE_SET_VERSION = 1
export const MAX_EVOLUTION_DURATION_MINUTES = 1440

export const EVOLUTION_FORMATS = Object.freeze({
  LEGACY: 'legacy',
  STRUCTURED: 'structured',
  UNKNOWN: 'unknown',
})

export class EvolutionQualityError extends Error {
  constructor(code, details = {}) {
    super(`Evolution quality validation failed: ${code}`)
    this.name = 'EvolutionQualityError'
    this.code = code
    this.details = details
  }
}

export const SESSION_TYPES = Object.freeze(['Terapia', 'Avaliação', 'Retorno'])

export const QUALITY_ALERT_CODES = Object.freeze({
  MISSING_ACTIVITY: 'missing_activity',
  MISSING_RESPONSE: 'missing_response',
  MISSING_NEXT_STEP: 'missing_next_step',
  MISSING_OBJECTIVE_PERFORMANCE: 'missing_objective_performance',
  UNLINKED_OBJECTIVE: 'unlinked_objective',
})

export const NOT_APPLICABLE_REASONS = Object.freeze({
  SESSION_INTERRUPTED: 'session_interrupted',
  CLINICAL_CONDITION: 'clinical_condition',
  TECHNICAL_FAILURE: 'technical_failure',
  NO_DIRECT_PARTICIPATION: 'no_direct_participation',
  OTHER: 'other',
})

export const NOT_APPLICABLE_REASON_VALUES = Object.freeze(Object.values(NOT_APPLICABLE_REASONS))

export const QUALITY_RULES_BY_SESSION_TYPE = Object.freeze({
  Terapia: Object.freeze({ activityLabel: 'Atividade ou procedimento realizado', responseLabel: 'Resposta ou desempenho observado', nextStepLabel: 'Conduta para o próximo atendimento', suggestObjectiveLink: true }),
  Avaliação: Object.freeze({ activityLabel: 'Procedimento ou instrumento utilizado', responseLabel: 'Achados e comportamento observado', nextStepLabel: 'Conduta, continuidade ou encaminhamento', suggestObjectiveLink: false }),
  Retorno: Object.freeze({ activityLabel: 'Aspecto reavaliado', responseLabel: 'Mudanças e situação observada', nextStepLabel: 'Orientação ou acompanhamento', suggestObjectiveLink: false }),
})

export const FIELD_APPLICABILITY_REASONS = Object.freeze({
  clinicalActivity: Object.freeze([
    NOT_APPLICABLE_REASONS.SESSION_INTERRUPTED,
    NOT_APPLICABLE_REASONS.CLINICAL_CONDITION,
    NOT_APPLICABLE_REASONS.TECHNICAL_FAILURE,
    NOT_APPLICABLE_REASONS.OTHER,
  ]),
  observedResponse: Object.freeze(NOT_APPLICABLE_REASON_VALUES),
  nextStep: Object.freeze([]),
})

export function getEvolutionFormat(schemaVersion) {
  if (schemaVersion == null || schemaVersion === 1) return EVOLUTION_FORMATS.LEGACY
  if (schemaVersion === EVOLUTION_SCHEMA_VERSION) return EVOLUTION_FORMATS.STRUCTURED
  return EVOLUTION_FORMATS.UNKNOWN
}

export function isSessionType(value) {
  return SESSION_TYPES.includes(value)
}
