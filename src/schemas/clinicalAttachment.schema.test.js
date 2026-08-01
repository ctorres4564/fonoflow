import { describe, expect, it } from 'vitest'
import {
  clinicalAttachmentCategorySchema,
  parseCreateClinicalAttachment,
} from './clinicalAttachment.schema.js'

const valid = {
  patientId: 'patient-a',
  requestId: 'request-a',
  category: 'audiometry',
  title: 'Audiometria tonal',
  description: null,
  documentDate: '2026-08-01',
  clinicalContext: {
    evolutionId: null,
    appointmentId: null,
    homeCareVisitId: null,
    relatedProfessionalId: null,
  },
}

describe('clinical attachment schemas', () => {
  it('aceita todas as categorias clínicas e rejeita categoria desconhecida', () => {
    expect(clinicalAttachmentCategorySchema.parse('clinical_image')).toBe('clinical_image')
    expect(() => clinicalAttachmentCategorySchema.parse('public_file')).toThrow()
  })

  it('valida metadados e rejeita campos extras', () => {
    expect(parseCreateClinicalAttachment(valid).category).toBe('audiometry')
    expect(() => parseCreateClinicalAttachment({ ...valid, storagePath: '/arbitrario' })).toThrow()
  })

  it('exige data conforme categoria', () => {
    expect(() => parseCreateClinicalAttachment({ ...valid, documentDate: null })).toThrow('Data')
  })

  it('rejeita Home Care sem agendamento e vínculo proibido por categoria', () => {
    expect(() => parseCreateClinicalAttachment({
      ...valid,
      clinicalContext: { ...valid.clinicalContext, homeCareVisitId: 'current' },
    })).toThrow('agendamento')
    expect(() => parseCreateClinicalAttachment({
      ...valid,
      category: 'consent_document',
      documentDate: null,
      clinicalContext: { ...valid.clinicalContext, evolutionId: 'evolution-a' },
    })).toThrow('não permitido')
  })
})
