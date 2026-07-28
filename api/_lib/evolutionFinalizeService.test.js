import { describe, expect, it } from 'vitest'
import { EvolutionFinalizeError } from './evolutionFinalizeErrors.js'
import {
  calculateEvolutionSha256,
  prepareEvolutionFinalizeOperation,
  recalculateServerChecklist,
} from './evolutionFinalizeService.js'

const IDEMPOTENCY_KEY = '550e8400-e29b-41d4-a716-446655440000'

function validPayload() {
  return {
    operation: 'create', patientId: 'patient-1', scheduleId: null, expectedEvolutionRevision: null, incrementSession: false,
    evolution: {
      schemaVersion: 2, sessionType: 'Terapia', date: '2026-07-20', duration: 50,
      clinicalActivity: 'Treino articulatório.', observedResponse: 'Produziu 7 de 10 palavras.',
      nextStep: 'Reduzir pistas visuais.', notes: '', applicability: {}, objectiveProgress: [],
    },
    reviewSession: {
      initialAlerts: [], finalAlerts: [], ignoredAlerts: [], reviewPasses: 1,
      startedAt: '2026-07-20T15:00:00.000Z', completedAt: '2026-07-20T15:01:00.000Z',
    },
  }
}

function alert(code, category, field, objectiveId = null) {
  return { code, category, field, objectiveId }
}

function prepare(payload, therapeuticPlan = null) {
  return prepareEvolutionFinalizeOperation({ method: 'POST', idempotencyKey: IDEMPOTENCY_KEY, payload, therapeuticPlan })
}

function expectCode(callback, code) {
  expect(callback).toThrowError(EvolutionFinalizeError)
  try { callback() } catch (error) { expect(error.code).toBe(code) }
}

describe('preparação segura', () => {
  it('gera operação normalizada sem persistir ou confiar em identidade', () => {
    const result = prepare(validPayload())
    expect(result).toMatchObject({
      operation: 'create',
      operationIdentity: { key: IDEMPOTENCY_KEY, operationScope: 'create' },
      patientId: 'patient-1',
      scheduleId: null,
      expectedEvolutionRevision: null,
      incrementSession: false,
      evolution: { schemaVersion: 2, evolutionRevision: 1 },
      reviewedContentHash: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      review: { counts: { initial: 0, final: 0, resolved: 0, ignored: 0 } },
    })
    expect(result).not.toHaveProperty('reviewedBy')
  })

  it('não modifica o payload nem o contexto terapêutico', () => {
    const payload = validPayload()
    const plan = { status: 'Ativo', objectives: [] }
    const beforePayload = structuredClone(payload)
    const beforePlan = structuredClone(plan)
    prepare(payload, plan)
    expect(payload).toEqual(beforePayload)
    expect(plan).toEqual(beforePlan)
  })

  it.each([true, false])('preserva incrementSession=%s na operação normalizada', (incrementSession) => {
    const payload = validPayload()
    payload.incrementSession = incrementSession
    expect(prepare(payload).incrementSession).toBe(incrementSession)
  })
})

describe('recálculo e decisões', () => {
  it('recalcula alertas no servidor e aceita decisão correspondente', () => {
    const payload = validPayload()
    payload.evolution.nextStep = ''
    const missing = alert('missing_next_step', 'absent', 'nextStep')
    payload.reviewSession.finalAlerts = [missing]
    payload.reviewSession.ignoredAlerts = [missing]
    const result = prepare(payload)
    expect(result.review.finalAlerts).toEqual([missing])
    expect(result.review.ignoredAlerts).toEqual([missing])
    expect(result.review.counts.final).toBe(1)
  })

  it('rejeita decisão para alerta inexistente', () => {
    const payload = validPayload()
    const missing = alert('missing_next_step', 'absent', 'nextStep')
    payload.reviewSession.finalAlerts = [missing]
    payload.reviewSession.ignoredAlerts = [missing]
    expectCode(() => prepare(payload), 'INVALID_DECISION')
  })

  it('rejeita decisão duplicada', () => {
    const payload = validPayload()
    payload.evolution.nextStep = ''
    const missing = alert('missing_next_step', 'absent', 'nextStep')
    payload.reviewSession.finalAlerts = [missing, { ...missing }]
    payload.reviewSession.ignoredAlerts = [missing]
    expectCode(() => prepare(payload), 'INVALID_DECISION')
  })

  it('rejeita alerta com chave incompleta', () => {
    const payload = validPayload()
    payload.reviewSession.finalAlerts = [{ code: 'missing_next_step', category: 'absent', field: 'nextStep' }]
    expectCode(() => prepare(payload), 'INVALID_DECISION')
  })

  it('rejeita metadados conflitantes para o código', () => {
    const payload = validPayload()
    payload.reviewSession.finalAlerts = [alert('missing_next_step', 'suggestion', 'nextStep')]
    expectCode(() => prepare(payload), 'INVALID_DECISION')
  })

  it('rejeita código de alerta desconhecido', () => {
    const payload = validPayload()
    payload.reviewSession.finalAlerts = [alert('unknown_alert', 'absent', 'notes')]
    expectCode(() => prepare(payload), 'INVALID_DECISION')
  })

  it('rejeita tentativa de neutralizar campo somente pelo painel', () => {
    const payload = validPayload()
    payload.evolution.clinicalActivity = ''
    const missing = alert('missing_activity', 'absent', 'clinicalActivity')
    payload.reviewSession.finalAlerts = []
    payload.reviewSession.ignoredAlerts = [missing]
    expectCode(() => prepare(payload), 'INVALID_DECISION')
  })

  it('aceita não se aplica somente quando refletido na evolução', () => {
    const payload = validPayload()
    payload.evolution.clinicalActivity = ''
    payload.evolution.applicability = {
      clinicalActivity: { applicable: false, reasonCode: 'session_interrupted', note: '' },
    }
    expect(prepare(payload).review.finalAlerts).toEqual([])
  })

  it('mantém alertas de dois objetivos distintos', () => {
    const payload = validPayload()
    payload.evolution.objectiveProgress = [{ objectiveId: 'b' }, { objectiveId: 'a' }]
    const a = alert('missing_objective_performance', 'absent', 'objectiveProgress', 'a')
    const b = alert('missing_objective_performance', 'absent', 'objectiveProgress', 'b')
    payload.reviewSession.finalAlerts = [a, b]
    payload.reviewSession.ignoredAlerts = [a, b]
    expect(prepare(payload).review.finalAlerts).toEqual([a, b])
  })

  it('deriva resolvedAlerts no servidor', () => {
    const payload = validPayload()
    const previous = alert('missing_response', 'absent', 'observedResponse')
    payload.reviewSession.initialAlerts = [previous]
    const result = prepare(payload)
    expect(result.review.resolvedAlerts).toEqual([previous])
    expect(result.review.counts.resolved).toBe(1)
  })

  it('rejeita ignoredAlerts que não correspondam aos alertas finais', () => {
    const payload = validPayload()
    payload.evolution.nextStep = ''
    payload.reviewSession.finalAlerts = [alert('missing_next_step', 'absent', 'nextStep')]
    payload.reviewSession.ignoredAlerts = []
    expectCode(() => prepare(payload), 'INVALID_DECISION')
  })

  it('recebe contexto terapêutico como dependência sem buscar dados', () => {
    const evolution = validPayload().evolution
    const plan = { status: 'Ativo', objectives: [{ id: 'a', status: 'Em desenvolvimento' }] }
    expect(recalculateServerChecklist(evolution, plan)).toContainEqual(alert('unlinked_objective', 'suggestion', 'objectiveProgress'))
  })
})

describe('canonicalização e SHA-256', () => {
  it('mantém o hash para a mesma representação canônica', () => {
    const first = validPayload().evolution
    const second = { ...first, notes: '  ', objectiveProgress: [...first.objectiveProgress].reverse() }
    expect(calculateEvolutionSha256(first)).toBe(calculateEvolutionSha256(second))
  })

  it('altera o hash quando conteúdo clínico muda', () => {
    const evolution = validPayload().evolution
    expect(calculateEvolutionSha256(evolution)).not.toBe(calculateEvolutionSha256({ ...evolution, nextStep: 'Outra conduta.' }))
  })

  it('não altera o hash clínico quando somente incrementSession muda', () => {
    const withoutIncrement = validPayload().evolution
    expect(calculateEvolutionSha256(withoutIncrement)).toBe(calculateEvolutionSha256({ ...withoutIncrement, incrementSession: true }))
  })

  it('não inclui incrementSession na representação clínica canonicalizada', async () => {
    const { canonicalizeEvolutionForReview } = await import('../../src/utils/evolutionQuality.js')
    expect(canonicalizeEvolutionForReview({ ...validPayload().evolution, incrementSession: true })).not.toHaveProperty('incrementSession')
  })

  it('corresponde ao vetor fixo aprovado', () => {
    expect(calculateEvolutionSha256(validPayload().evolution)).toBe('sha256:4b0b798c5e4f16e3e6064b34b319303de1f4abd852bceceecd8804ca6c04542a')
  })
})
