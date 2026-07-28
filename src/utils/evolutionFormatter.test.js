import { describe, expect, it } from 'vitest'
import { EvolutionQualityError } from '../domain/evolutionQuality.js'
import {
  formatEvolutionForAIContext,
  formatEvolutionForDisplay,
  formatEvolutionForExport,
  formatEvolutionForSearch,
  isStructuredEvolution,
} from './evolutionFormatter.js'
import { canonicalizeEvolutionForReview } from './evolutionQuality.js'

const structured = {
  schemaVersion: 2,
  evolutionRevision: 3,
  sessionType: 'Terapia',
  date: '2026-07-20',
  duration: 50,
  clinicalActivity: 'Treino articulatório.',
  observedResponse: 'Produziu 7 de 10 palavras.',
  nextStep: 'Reduzir pistas.',
  notes: '',
  applicability: { clinicalActivity: { applicable: true }, observedResponse: { applicable: false, reasonCode: 'clinical_condition' } },
  objectiveProgress: [{ objectiveId: 'a', description: 'Fonema', performance: '70%' }],
}

describe('versões e legado', () => {
  it.each([{ notes: 'Legado.' }, { schemaVersion: 1, notes: 'Legado.' }])('reconhece legado', (evolution) => {
    expect(isStructuredEvolution(evolution)).toBe(false)
    expect(formatEvolutionForDisplay(evolution)).toBe('Legado.')
  })

  it('reconhece exatamente schemaVersion 2', () => {
    expect(isStructuredEvolution(structured)).toBe(true)
  })

  it('rejeita versão desconhecida de forma controlada', () => {
    expect(() => isStructuredEvolution({ schemaVersion: 3 })).toThrowError(EvolutionQualityError)
  })

  it('mantém interpretação consistente com o canonicalizador', () => {
    expect(() => canonicalizeEvolutionForReview({ notes: 'Legado.' })).toThrowError(EvolutionQualityError)
    expect(isStructuredEvolution({ notes: 'Legado.' })).toBe(false)
    expect(canonicalizeEvolutionForReview(structured).evolutionSchemaVersion).toBe(2)
  })
})

describe('formatação', () => {
  it('omite observações complementares vazias da apresentação', () => {
    const result = formatEvolutionForDisplay(structured)
    expect(result).toContain('Atividade/Procedimento: Treino articulatório.')
    expect(result).toContain('Conduta: Reduzir pistas.')
    expect(result).not.toContain('Observações complementares')
  })

  it('usa todos os textos na pesquisa e no contexto para IA', () => {
    const value = { ...structured, notes: 'Orientação familiar.' }
    const search = formatEvolutionForSearch(value)
    expect(search).toContain('treino articulatório')
    expect(search).toContain('produziu 7 de 10')
    expect(search).toContain('reduzir pistas')
    expect(search).toContain('orientação familiar')
    expect(formatEvolutionForAIContext(value)).toBe(formatEvolutionForDisplay(value))
  })

  it('não modifica o objeto original', () => {
    const value = structuredClone(structured)
    const before = structuredClone(value)
    formatEvolutionForDisplay(value)
    formatEvolutionForSearch(value)
    formatEvolutionForExport(value)
    expect(value).toEqual(before)
  })

  it('rejeita objeto em campo textual', () => {
    expect(() => formatEvolutionForDisplay({ ...structured, notes: {} })).toThrowError(EvolutionQualityError)
  })
})

describe('exportação', () => {
  it('exporta integralmente a versão estruturada', () => {
    expect(formatEvolutionForExport(structured)).toEqual({
      formato: 'estruturado',
      schemaVersion: 2,
      evolutionRevision: 3,
      sessionType: 'Terapia',
      date: '2026-07-20',
      duration: 50,
      clinicalActivity: 'Treino articulatório.',
      observedResponse: 'Produziu 7 de 10 palavras.',
      nextStep: 'Reduzir pistas.',
      notes: '',
      applicability: {
        clinicalActivity: { applicable: true, reasonCode: '', note: '' },
        observedResponse: { applicable: false, reasonCode: 'clinical_condition', note: '' },
      },
      objectiveProgress: [{ objectiveId: 'a', description: 'Fonema', area: '', status: '', performance: '70%' }],
    })
  })

  it('preserva campos clínicos presentes no legado sem inventar valores', () => {
    const legacy = { schemaVersion: 1, date: '2026-07-19', duration: 40, notes: 'Registro anterior.', objectiveProgress: [{ objectiveId: 'a' }] }
    expect(formatEvolutionForExport(legacy)).toEqual({ formato: 'legado', schemaVersion: 1, date: '2026-07-19', duration: 40, notes: 'Registro anterior.', objectiveProgress: [{ objectiveId: 'a' }] })
  })

  it('exporta legado incompleto sem quebrar', () => {
    expect(formatEvolutionForExport({})).toEqual({ formato: 'legado' })
  })
})
