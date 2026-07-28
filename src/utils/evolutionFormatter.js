import { EVOLUTION_FORMATS, EvolutionQualityError, getEvolutionFormat } from '../domain/evolutionQuality.js'
import { canonicalizeEvolutionForReview, normalizeQualityText } from './evolutionQuality.js'

function requireKnownFormat(evolution = {}) {
  const format = getEvolutionFormat(evolution?.schemaVersion)
  if (format === EVOLUTION_FORMATS.UNKNOWN) throw new EvolutionQualityError('UNSUPPORTED_EVOLUTION_SCHEMA')
  return format
}

export function isStructuredEvolution(evolution = {}) {
  return requireKnownFormat(evolution) === EVOLUTION_FORMATS.STRUCTURED
}

export function getEvolutionTextParts(evolution = {}) {
  if (!isStructuredEvolution(evolution)) return [normalizeQualityText(evolution.notes, 'notes')].filter(Boolean)
  return [
    normalizeQualityText(evolution.clinicalActivity, 'clinicalActivity'),
    normalizeQualityText(evolution.observedResponse, 'observedResponse'),
    normalizeQualityText(evolution.nextStep, 'nextStep'),
    normalizeQualityText(evolution.notes, 'notes'),
  ].filter(Boolean)
}

export function formatEvolutionForDisplay(evolution = {}) {
  if (!isStructuredEvolution(evolution)) return normalizeQualityText(evolution.notes, 'notes')
  const rows = [
    ['Atividade/Procedimento', evolution.clinicalActivity],
    ['Resposta/Achado', evolution.observedResponse],
    ['Conduta', evolution.nextStep],
    ['Observações complementares', evolution.notes],
  ]
  return rows.map(([label, value]) => [label, normalizeQualityText(value, label)])
    .filter(([, value]) => value).map(([label, value]) => `${label}: ${value}`).join('\n')
}

export function formatEvolutionForSearch(evolution = {}) {
  return getEvolutionTextParts(evolution).join(' ').toLocaleLowerCase('pt-BR')
}

export function formatEvolutionForExport(evolution = {}) {
  const format = requireKnownFormat(evolution)
  if (format === EVOLUTION_FORMATS.LEGACY) {
    const exported = { formato: 'legado' }
    if (evolution.schemaVersion === 1) exported.schemaVersion = 1
    for (const field of ['evolutionRevision', 'date', 'duration', 'notes']) {
      if (evolution[field] !== undefined) exported[field] = evolution[field]
    }
    if (evolution.objectiveProgress !== undefined) exported.objectiveProgress = structuredClone(evolution.objectiveProgress)
    return exported
  }

  const canonical = canonicalizeEvolutionForReview(evolution)
  return {
    formato: 'estruturado',
    schemaVersion: canonical.evolutionSchemaVersion,
    evolutionRevision: canonical.evolutionRevision,
    sessionType: canonical.sessionType,
    date: canonical.date,
    duration: canonical.duration,
    clinicalActivity: canonical.clinicalActivity,
    observedResponse: canonical.observedResponse,
    nextStep: canonical.nextStep,
    notes: canonical.notes,
    applicability: structuredClone(canonical.applicability),
    objectiveProgress: structuredClone(canonical.objectiveProgress),
  }
}

export const formatEvolutionForAIContext = formatEvolutionForDisplay
