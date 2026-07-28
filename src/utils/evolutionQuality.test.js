import { describe, expect, it } from 'vitest'
import { EvolutionQualityError } from '../domain/evolutionQuality.js'
import {
  buildLocalReviewResult,
  canonicalizeEvolutionForReview,
  getAlertKey,
  normalizeObjectiveProgress,
  normalizeQualityText,
  reviewEvolutionQuality,
  stableStringifyEvolutionForReview,
  validateApplicability,
} from './evolutionQuality.js'

const completeEvolution = {
  schemaVersion: 2,
  evolutionRevision: 1,
  sessionType: 'Terapia',
  date: '2026-07-20',
  duration: 50,
  clinicalActivity: 'Treino articulatório.',
  observedResponse: 'Produziu 7 de 10 palavras.',
  nextStep: 'Reduzir pistas visuais.',
  notes: '',
  applicability: {},
  objectiveProgress: [],
}

function expectDomainError(callback, code) {
  expect(callback).toThrowError(EvolutionQualityError)
  try { callback() } catch (error) { expect(error.code).toBe(code) }
}

describe('motor de qualidade', () => {
  it.each(['Terapia', 'Avaliação', 'Retorno'])('aceita o tipo %s', (sessionType) => {
    expect(reviewEvolutionQuality({ evolution: { ...completeEvolution, sessionType } }).validSessionType).toBe(true)
  })

  it.each([
    ['clinicalActivity', 'missing_activity'],
    ['observedResponse', 'missing_response'],
    ['nextStep', 'missing_next_step'],
  ])('gera alerta quando %s está vazio', (field, code) => {
    const result = reviewEvolutionQuality({ evolution: { ...completeEvolution, [field]: '' } })
    expect(result.alerts.map((alert) => alert.code)).toContain(code)
  })

  it('aceita atividade não aplicável com motivo permitido', () => {
    const evolution = { ...completeEvolution, clinicalActivity: '', applicability: { clinicalActivity: { applicable: false, reasonCode: 'session_interrupted' } } }
    expect(reviewEvolutionQuality({ evolution }).alerts.map((alert) => alert.code)).not.toContain('missing_activity')
  })

  it('exige nota quando o motivo é outro', () => {
    expect(validateApplicability('clinicalActivity', { applicable: false, reasonCode: 'other' })).toMatchObject({ valid: false, error: 'missing_other_note' })
  })

  it('mantém alerta para motivo de inaplicabilidade inválido', () => {
    const evolution = { ...completeEvolution, observedResponse: '', applicability: { observedResponse: { applicable: false, reasonCode: 'invalid' } } }
    expect(reviewEvolutionQuality({ evolution }).alerts).toContainEqual(expect.objectContaining({ code: 'missing_response', reason: 'invalid_not_applicable' }))
  })

  it('não permite marcar conduta como não aplicável', () => {
    expect(validateApplicability('nextStep', { applicable: false, reasonCode: 'other', note: 'Teste' }).valid).toBe(false)
  })

  it('preserva IDs de dois objetivos diferentes sem desempenho', () => {
    const evolution = { ...completeEvolution, objectiveProgress: [{ objectiveId: 'b' }, { objectiveId: 'a' }] }
    const alerts = reviewEvolutionQuality({ evolution }).alerts.filter((alert) => alert.code === 'missing_objective_performance')
    expect(alerts.map((alert) => alert.objectiveId)).toEqual(['a', 'b'])
    expect(new Set(alerts.map(getAlertKey)).size).toBe(2)
  })

  it('ordena alertas deterministicamente pela chave composta', () => {
    const first = { ...completeEvolution, clinicalActivity: '', objectiveProgress: [{ objectiveId: 'b' }, { objectiveId: 'a' }] }
    const second = { ...first, objectiveProgress: [...first.objectiveProgress].reverse() }
    expect(reviewEvolutionQuality({ evolution: first }).alerts).toEqual(reviewEvolutionQuality({ evolution: second }).alerts)
  })

  it('não duplica alerta para objetivo perfeitamente duplicado', () => {
    const item = { objectiveId: 'a', performance: '' }
    const alerts = reviewEvolutionQuality({ evolution: { ...completeEvolution, objectiveProgress: [item, { ...item }] } }).alerts
    expect(alerts.filter((alert) => alert.code === 'missing_objective_performance')).toHaveLength(1)
  })

  it('sugere vínculo somente em terapia com plano ativo e objetivo elegível', () => {
    const plan = { status: 'Ativo', objectives: [{ id: 'a', status: 'Em desenvolvimento' }] }
    expect(reviewEvolutionQuality({ evolution: completeEvolution, therapeuticPlan: plan }).alerts.map((alert) => alert.code)).toContain('unlinked_objective')
    expect(reviewEvolutionQuality({ evolution: { ...completeEvolution, sessionType: 'Avaliação' }, therapeuticPlan: plan }).alerts.map((alert) => alert.code)).not.toContain('unlinked_objective')
  })

  it.each([
    null,
    { status: 'Inativo', objectives: [{ id: 'a', status: 'Em desenvolvimento' }] },
    { status: 'Ativo', objectives: [{ id: 'a', status: 'Suspenso' }] },
  ])('não sugere vínculo sem plano ativo elegível', (therapeuticPlan) => {
    expect(reviewEvolutionQuality({ evolution: completeEvolution, therapeuticPlan }).alerts.map((alert) => alert.code)).not.toContain('unlinked_objective')
  })

  it('considera objetivos ativos quando há mistura com suspensos', () => {
    const plan = { status: 'Ativo', objectives: [{ id: 'a', status: 'Suspenso' }, { id: 'b', status: 'Em desenvolvimento' }] }
    expect(reviewEvolutionQuality({ evolution: completeEvolution, therapeuticPlan: plan }).alerts.map((alert) => alert.code)).toContain('unlinked_objective')
  })
})

describe('contrato estrutural e versões', () => {
  it.each([
    [{ ...completeEvolution, schemaVersion: undefined }, 'LEGACY_EVOLUTION_NOT_REVIEWABLE'],
    [{ ...completeEvolution, schemaVersion: 1 }, 'LEGACY_EVOLUTION_NOT_REVIEWABLE'],
    [{ ...completeEvolution, schemaVersion: 3 }, 'UNSUPPORTED_EVOLUTION_SCHEMA'],
  ])('rejeita versão não revisável', (evolution, code) => {
    expectDomainError(() => canonicalizeEvolutionForReview(evolution), code)
  })

  it('aceita exatamente schemaVersion 2', () => {
    expect(canonicalizeEvolutionForReview(completeEvolution).evolutionSchemaVersion).toBe(2)
  })

  it.each([{}, [], 42, true])('rejeita %j em campo textual', (invalid) => {
    expectDomainError(() => canonicalizeEvolutionForReview({ ...completeEvolution, notes: invalid }), 'INVALID_TEXT_TYPE')
  })

  it.each([null, undefined])('normaliza texto %s como vazio', (value) => {
    expect(normalizeQualityText(value)).toBe('')
  })

  it('rejeita objectiveProgress que não seja array', () => {
    expectDomainError(() => canonicalizeEvolutionForReview({ ...completeEvolution, objectiveProgress: {} }), 'INVALID_OBJECTIVE_PROGRESS')
  })

  it('rejeita applicability que não seja objeto', () => {
    expectDomainError(() => canonicalizeEvolutionForReview({ ...completeEvolution, applicability: [] }), 'INVALID_APPLICABILITY')
  })

  it.each([-1, Infinity, NaN, '50', 1441])('rejeita duração inválida %s', (duration) => {
    expectDomainError(() => canonicalizeEvolutionForReview({ ...completeEvolution, duration }), 'INVALID_DURATION')
  })
})

describe('objetivos duplicados', () => {
  it('colapsa duplicatas perfeitamente idênticas', () => {
    const item = { objectiveId: 'a', description: 'Objetivo', performance: 'Resultado' }
    expect(normalizeObjectiveProgress([item, { ...item }])).toHaveLength(1)
  })

  it('rejeita duplicatas conflitantes', () => {
    expectDomainError(() => normalizeObjectiveProgress([
      { objectiveId: 'a', performance: 'Resultado A' },
      { objectiveId: 'a', performance: 'Resultado B' },
    ]), 'DUPLICATE_OBJECTIVE_CONFLICT')
  })

  it('rejeita objetivo sem ID', () => {
    expectDomainError(() => normalizeObjectiveProgress([{ performance: 'Resultado' }]), 'INVALID_OBJECTIVE_ID')
  })

  it('não modifica o array nem os objetos originais', () => {
    const progress = [{ objectiveId: 'b' }, { objectiveId: 'a' }]
    const before = structuredClone(progress)
    normalizeObjectiveProgress(progress)
    expect(progress).toEqual(before)
  })
})

describe('canonicalização', () => {
  it('normaliza Unicode, quebras de linha e espaços conservadoramente', () => {
    const decomposed = 'Cafe\u0301\r\ncom   pista'
    expect(normalizeQualityText(decomposed)).toBe('Café\ncom pista')
  })

  it('gera a mesma saída após a normalização definida', () => {
    const first = { ...completeEvolution, notes: '  Café\r\ncom   pista ', objectiveProgress: [{ objectiveId: 'b' }, { objectiveId: 'a' }] }
    const second = { ...completeEvolution, notes: 'Cafe\u0301\ncom pista', objectiveProgress: [{ objectiveId: 'a' }, { objectiveId: 'b' }] }
    expect(stableStringifyEvolutionForReview(first)).toBe(stableStringifyEvolutionForReview(second))
  })

  it('não modifica a evolução recebida', () => {
    const evolution = { ...completeEvolution, applicability: { clinicalActivity: { applicable: false, reasonCode: 'other', note: 'Motivo' } }, objectiveProgress: [{ objectiveId: 'a' }] }
    const before = structuredClone(evolution)
    canonicalizeEvolutionForReview(evolution)
    expect(evolution).toEqual(before)
  })

  it.each([
    ['evolutionRevision', 2], ['sessionType', 'Retorno'], ['date', '2026-07-21'], ['duration', 60],
    ['clinicalActivity', 'Outra atividade'], ['observedResponse', 'Outra resposta'],
    ['nextStep', 'Outra conduta'], ['notes', 'Outra observação'],
  ])('muda a saída quando %s muda', (field, value) => {
    expect(stableStringifyEvolutionForReview(completeEvolution)).not.toBe(stableStringifyEvolutionForReview({ ...completeEvolution, [field]: value }))
  })

  it('muda com applicability, reasonCode e justificativa', () => {
    const base = stableStringifyEvolutionForReview(completeEvolution)
    const values = [
      { clinicalActivity: { applicable: false, reasonCode: 'session_interrupted' } },
      { clinicalActivity: { applicable: false, reasonCode: 'other', note: 'A' } },
      { clinicalActivity: { applicable: false, reasonCode: 'other', note: 'B' } },
    ].map((applicability) => stableStringifyEvolutionForReview({ ...completeEvolution, applicability }))
    expect(new Set([base, ...values]).size).toBe(4)
  })
})

describe('identidade e resumo dos alertas', () => {
  const alertA = { code: 'missing_objective_performance', category: 'absent', field: 'objectiveProgress', objectiveId: 'a', severity: 'attention', reason: 'empty' }
  const alertB = { ...alertA, objectiveId: 'b' }

  it('produz chave composta sem ambiguidade e preserva objectiveId', () => {
    expect(getAlertKey(alertA)).toBe('["missing_objective_performance","objectiveProgress","a"]')
    expect(getAlertKey({ code: 'missing_next_step', field: 'nextStep', objectiveId: null })).toBe('["missing_next_step","nextStep",null]')
  })

  it('preserva identidades diferentes com o mesmo código', () => {
    const result = buildLocalReviewResult({ initialAlerts: [alertB, alertA], finalAlerts: [alertB] })
    expect(result.initialAlerts.map((alert) => alert.objectiveId)).toEqual(['a', 'b'])
    expect(result.resolvedAlerts).toEqual([expect.objectContaining({ objectiveId: 'a' })])
  })

  it('elimina alertas perfeitamente duplicados', () => {
    expect(buildLocalReviewResult({ initialAlerts: [alertA, { ...alertA }] }).initialAlerts).toHaveLength(1)
  })
})
