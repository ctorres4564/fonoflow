import { MAX_EVOLUTION_DURATION_MINUTES, QUALITY_ALERT_CODES } from '../../src/domain/evolutionQuality.js'

export const FINALIZE_LIMITS = Object.freeze({
  payloadBytes: 64 * 1024,
  idempotencyKeyLength: 36,
  idLength: 128,
  clinicalActivityLength: 4000,
  observedResponseLength: 4000,
  nextStepLength: 4000,
  notesLength: 8000,
  applicabilityNoteLength: 500,
  objectives: 50,
  objectiveDescriptionLength: 1000,
  objectiveAreaLength: 120,
  objectiveStatusLength: 120,
  objectivePerformanceLength: 2000,
  alertsPerList: 100,
  reviewPasses: 50,
  reviewTimestampLength: 35,
  durationMinutes: MAX_EVOLUTION_DURATION_MINUTES,
})

export const ROOT_FIELDS = Object.freeze(['operation', 'patientId', 'scheduleId', 'expectedEvolutionRevision', 'incrementSession', 'evolution', 'reviewSession'])
export const EVOLUTION_FIELDS = Object.freeze(['schemaVersion', 'sessionType', 'date', 'duration', 'clinicalActivity', 'observedResponse', 'nextStep', 'notes', 'applicability', 'objectiveProgress'])
export const APPLICABILITY_FIELDS = Object.freeze(['clinicalActivity', 'observedResponse'])
export const APPLICABILITY_ENTRY_FIELDS = Object.freeze(['applicable', 'reasonCode', 'note'])
export const OBJECTIVE_FIELDS = Object.freeze(['objectiveId', 'description', 'area', 'status', 'performance'])
export const REVIEW_SESSION_FIELDS = Object.freeze(['initialAlerts', 'finalAlerts', 'ignoredAlerts', 'reviewPasses', 'startedAt', 'completedAt'])
export const ALERT_IDENTITY_FIELDS = Object.freeze(['code', 'category', 'field', 'objectiveId'])

export const ALERT_DEFINITIONS = Object.freeze({
  [QUALITY_ALERT_CODES.MISSING_ACTIVITY]: Object.freeze({ category: 'absent', field: 'clinicalActivity', objective: false }),
  [QUALITY_ALERT_CODES.MISSING_RESPONSE]: Object.freeze({ category: 'absent', field: 'observedResponse', objective: false }),
  [QUALITY_ALERT_CODES.MISSING_NEXT_STEP]: Object.freeze({ category: 'absent', field: 'nextStep', objective: false }),
  [QUALITY_ALERT_CODES.MISSING_OBJECTIVE_PERFORMANCE]: Object.freeze({ category: 'absent', field: 'objectiveProgress', objective: true }),
  [QUALITY_ALERT_CODES.UNLINKED_OBJECTIVE]: Object.freeze({ category: 'suggestion', field: 'objectiveProgress', objective: false }),
})

export const IDEMPOTENCY_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export const DOCUMENT_ID_PATTERN = /^[^/.][^/]{0,127}$/
export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
