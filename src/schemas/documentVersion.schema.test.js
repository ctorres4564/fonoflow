import { describe, expect, it } from 'vitest'
import {
  createDocumentVersionInputSchema,
  documentVersionSchema,
  retentionPolicySchema,
} from './documentVersion.schema.js'

const version = {
  schemaVersion: 2, documentId: 'document-a', patientId: 'patient-a',
  ownerId: 'professional-a', versionId: 'version-a', versionNumber: 1,
  previousVersionId: null, supersedesVersionId: null, changeReason: 'Versão inicial',
  duplicateJustification: null, status: 'current', uploadRequest: null,
  fileMetadata: {
    uploadId: 'upload-a', originalFileName: 'exame.pdf', randomFileName: '12345678901234567890.pdf',
    storagePath: 'users/professional-a/patients/patient-a/documents/document-a/versions/version-a/available/exame.pdf',
    declaredMimeType: 'application/pdf', detectedMimeType: 'application/pdf',
    extension: 'pdf', size: 20, sha256: 'a'.repeat(64),
  },
  securityScan: { provider: 'mock', engineVersion: '1', status: 'clean',
    scannedAt: '2026-08-01T00:00:00Z', threatName: null, resultCode: null },
  integrity: { algorithm: 'HMAC-SHA256', signatureVersion: 1,
    metadataHash: 'b'.repeat(64), signature: 'c'.repeat(64),
    signedAt: '2026-08-01T00:00:00Z', signedBy: 'professional-a' },
  integrityStatus: 'valid', duplicate: { detected: false, scope: null,
    matchingDocumentId: null, matchingVersionId: null },
  createdBy: 'professional-a', createdAt: '2026-08-01T00:00:00Z',
  activatedAt: '2026-08-01T00:00:00Z', supersededAt: null,
}

describe('document version schemas', () => {
  it('aceita uma versão V2 completa e estrita', () => {
    expect(documentVersionSchema.parse(version).versionNumber).toBe(1)
    expect(() => documentVersionSchema.parse({ ...version, unknown: true })).toThrow()
  })

  it('exige motivo na criação', () => {
    expect(() => createDocumentVersionInputSchema.parse({ patientId: 'patient-a',
      documentId: 'document-a', requestId: 'request-a', changeReason: '' })).toThrow()
  })

  it('valida política de retenção sem autorizar descarte', () => {
    const policy = retentionPolicySchema.parse({ schemaVersion: 1, name: 'Clínico dez anos',
      active: true, durationDays: 3650, reviewBeforeDays: 90,
      startEvent: 'document_created', category: null,
      createdAt: '2026-08-01', updatedAt: '2026-08-01' })
    expect(policy.durationDays).toBe(3650)
  })
})
