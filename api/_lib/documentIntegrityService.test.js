import { describe, expect, it } from 'vitest'
import { createDocumentIntegrityService } from './documentIntegrityService.js'

const key = '0123456789abcdef0123456789abcdef'
const version = {
  documentId: 'document-a', patientId: 'patient-a', ownerId: 'professional-a',
  versionId: 'version-a', versionNumber: 1, previousVersionId: null,
  supersedesVersionId: null, changeReason: 'Versão inicial',
  fileMetadata: { storagePath: 'users/a/file.pdf', sha256: 'a'.repeat(64), size: 10 },
  securityScan: { status: 'clean' }, createdBy: 'professional-a',
}

describe('document integrity service', () => {
  it('assina e valida metadados canônicos', () => {
    const service = createDocumentIntegrityService({ DOCUMENT_INTEGRITY_HMAC_KEY: key })
    const signed = { ...version, integrity: service.sign(version, {
      signedAt: '2026-08-01T00:00:00.000Z', signedBy: 'professional-a',
    }) }
    expect(service.verify(signed)).toMatchObject({ valid: true, reason: null })
  })

  it('detecta adulteração de metadados', () => {
    const service = createDocumentIntegrityService({ DOCUMENT_INTEGRITY_HMAC_KEY: key })
    const signed = { ...version, integrity: service.sign(version, {
      signedAt: '2026-08-01T00:00:00.000Z', signedBy: 'professional-a',
    }) }
    expect(service.verify({ ...signed, versionNumber: 2 }).valid).toBe(false)
  })

  it('falha fechada em produção sem chave válida', () => {
    expect(() => createDocumentIntegrityService({ NODE_ENV: 'production' }))
      .toThrow(/inicialização de produção bloqueada/)
    expect(() => createDocumentIntegrityService({
      VERCEL_ENV: 'production', DOCUMENT_INTEGRITY_HMAC_KEY: 'curta',
    })).toThrow()
  })
})
