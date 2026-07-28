import { describe, expect, it } from 'vitest'
import { FINALIZE_LIMITS } from './evolutionFinalizeContract.js'
import { EvolutionFinalizeError, asSafeFinalizeError } from './evolutionFinalizeErrors.js'
import {
  parseJsonBody,
  validateFinalizePayload,
  validateIdempotencyKey,
  validateRequestMethod,
} from './evolutionFinalizeValidation.js'

export function validPayload() {
  return {
    operation: 'create',
    patientId: 'patient-1',
    scheduleId: null,
    expectedEvolutionRevision: null,
    incrementSession: false,
    evolution: {
      schemaVersion: 2,
      sessionType: 'Terapia',
      date: '2026-07-20',
      duration: 50,
      clinicalActivity: 'Treino articulatório.',
      observedResponse: 'Produziu 7 de 10 palavras.',
      nextStep: 'Reduzir pistas visuais.',
      notes: '',
      applicability: {},
      objectiveProgress: [],
    },
    reviewSession: {
      initialAlerts: [],
      finalAlerts: [],
      ignoredAlerts: [],
      reviewPasses: 1,
      startedAt: '2026-07-20T15:00:00.000Z',
      completedAt: '2026-07-20T15:01:00.000Z',
    },
  }
}

function expectCode(callback, code) {
  expect(callback).toThrowError(EvolutionFinalizeError)
  try { callback() } catch (error) { expect(error.code).toBe(code) }
}

describe('método, JSON e idempotência', () => {
  it('aceita POST e rejeita outro método', () => {
    expect(validateRequestMethod('POST')).toBe('POST')
    expectCode(() => validateRequestMethod('GET'), 'METHOD_NOT_ALLOWED')
  })

  it('analisa JSON objeto e rejeita JSON inválido', () => {
    expect(parseJsonBody('{"operation":"create"}')).toEqual({ operation: 'create' })
    expectCode(() => parseJsonBody('{'), 'INVALID_JSON')
    expectCode(() => parseJsonBody('[]'), 'INVALID_JSON')
  })

  it('exige Idempotency-Key', () => {
    expectCode(() => validateIdempotencyKey(undefined), 'IDEMPOTENCY_KEY_REQUIRED')
  })

  it('normaliza UUID válido e rejeita formato inválido', () => {
    expect(validateIdempotencyKey('550E8400-E29B-41D4-A716-446655440000')).toEqual({ key: '550e8400-e29b-41d4-a716-446655440000', operationScope: 'create' })
    expectCode(() => validateIdempotencyKey('not-a-uuid'), 'INVALID_IDEMPOTENCY_KEY')
  })
})

describe('payload fechado', () => {
  it('aceita uma solicitação válida e não preserva campos desconhecidos', () => {
    const result = validateFinalizePayload(validPayload())
    expect(result.operation).toBe('create')
    expect(result.evolution.evolutionSchemaVersion).toBe(2)
  })

  it.each([
    ['propriedade extra', (payload) => { payload.reviewedBy = 'attacker' }, 'INVALID_PAYLOAD'],
    ['schemaVersion inválido', (payload) => { payload.evolution.schemaVersion = 1 }, 'UNSUPPORTED_VERSION'],
    ['tipo desconhecido', (payload) => { payload.evolution.sessionType = 'Outro' }, 'INVALID_PAYLOAD'],
    ['patientId inválido', (payload) => { payload.patientId = 'patients/1' }, 'INVALID_PAYLOAD'],
    ['scheduleId inválido', (payload) => { payload.scheduleId = 'schedules/1' }, 'INVALID_PAYLOAD'],
    ['data inexistente', (payload) => { payload.evolution.date = '2026-02-30' }, 'INVALID_PAYLOAD'],
    ['duração negativa', (payload) => { payload.evolution.duration = -1 }, 'INVALID_PAYLOAD'],
    ['duração infinita', (payload) => { payload.evolution.duration = Infinity }, 'INVALID_PAYLOAD'],
    ['texto acima do limite', (payload) => { payload.evolution.notes = 'x'.repeat(FINALIZE_LIMITS.notesLength + 1) }, 'LIMIT_EXCEEDED'],
    ['reviewPasses inválido', (payload) => { payload.reviewSession.reviewPasses = 0 }, 'INVALID_PAYLOAD'],
    ['datas invertidas', (payload) => { payload.reviewSession.completedAt = '2026-07-20T14:00:00.000Z' }, 'INVALID_PAYLOAD'],
  ])('rejeita %s', (_label, mutate, code) => {
    const payload = validPayload()
    mutate(payload)
    expectCode(() => validateFinalizePayload(payload), code)
  })

  it('rejeita objetivo acima do limite', () => {
    const payload = validPayload()
    payload.evolution.objectiveProgress = Array.from({ length: FINALIZE_LIMITS.objectives + 1 }, (_, index) => ({ objectiveId: `o-${index}` }))
    expectCode(() => validateFinalizePayload(payload), 'LIMIT_EXCEEDED')
  })

  it('rejeita objetivos duplicados conflitantes', () => {
    const payload = validPayload()
    payload.evolution.objectiveProgress = [{ objectiveId: 'a', performance: 'A' }, { objectiveId: 'a', performance: 'B' }]
    expectCode(() => validateFinalizePayload(payload), 'OBJECTIVE_CONFLICT')
  })

  it('rejeita aplicabilidade inconsistente', () => {
    const payload = validPayload()
    payload.evolution.applicability = { clinicalActivity: { applicable: false, reasonCode: 'session_interrupted', note: '' } }
    expectCode(() => validateFinalizePayload(payload), 'INVALID_PAYLOAD')
  })

  it('rejeita contagens fornecidas pelo cliente', () => {
    const payload = validPayload()
    payload.reviewSession.counts = { final: 0 }
    expectCode(() => validateFinalizePayload(payload), 'INVALID_PAYLOAD')
  })

  it.each([
    ['ausente', (payload) => { delete payload.incrementSession }],
    ['null', (payload) => { payload.incrementSession = null }],
    ['string', (payload) => { payload.incrementSession = 'true' }],
    ['número', (payload) => { payload.incrementSession = 1 }],
  ])('rejeita incrementSession %s', (_label, mutate) => {
    const payload = validPayload()
    mutate(payload)
    expectCode(() => validateFinalizePayload(payload), 'INVALID_PAYLOAD')
  })

  it.each([true, false])('aceita evolução avulsa com incrementSession=%s', (incrementSession) => {
    const payload = validPayload()
    payload.incrementSession = incrementSession
    expect(validateFinalizePayload(payload).incrementSession).toBe(incrementSession)
  })

  it('aceita agendamento somente com incrementSession=true', () => {
    const payload = validPayload()
    payload.scheduleId = 'schedule-1'
    payload.incrementSession = true
    expect(validateFinalizePayload(payload).incrementSession).toBe(true)
  })

  it('rejeita agendamento com incrementSession=false', () => {
    const payload = validPayload()
    payload.scheduleId = 'schedule-1'
    payload.incrementSession = false
    expectCode(() => validateFinalizePayload(payload), 'INVALID_PAYLOAD')
  })

  it('rejeita payload excessivo', () => {
    const payload = validPayload()
    payload.evolution.notes = 'x'.repeat(FINALIZE_LIMITS.payloadBytes)
    expectCode(() => validateFinalizePayload(payload), 'LIMIT_EXCEEDED')
  })
})

describe('erros seguros', () => {
  it('não expõe razão interna nem conteúdo clínico', () => {
    const error = new EvolutionFinalizeError('INVALID_PAYLOAD', 'Paciente falou conteúdo clínico secreto')
    const serialized = JSON.stringify(error.toClientResponse())
    expect(serialized).not.toContain('conteúdo clínico secreto')
    expect(serialized).toContain('INVALID_PAYLOAD')
  })

  it('converte erro desconhecido em resposta interna genérica', () => {
    expect(asSafeFinalizeError(new Error('token-secret')).toClientResponse()).toEqual({ error: { code: 'INTERNAL_ERROR', message: 'Não foi possível processar a solicitação.' } })
  })
})
