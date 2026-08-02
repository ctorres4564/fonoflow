import { describe, expect, it } from 'vitest'
import {
  clinicalDocumentSchema,
  documentSecurityScanSchema,
  parseDocumentUploadRequest,
} from './documentStorage.schema'
import { assertDeclaredFile } from '../config/documentStorage'

const request = {
  patientId: 'patient-a',
  requestId: 'request-a',
  category: 'exam',
  title: 'Exame fictício',
  description: null,
  documentDate: null,
  sensitivityLevel: 'sensitive',
  accessLevel: 'owner_only',
  originalFileName: 'exame.pdf',
  declaredMimeType: 'application/pdf',
  size: 100,
}

describe('document storage schemas', () => {
  it('aceita uma solicitação válida e rejeita campos inesperados', () => {
    expect(parseDocumentUploadRequest(request).category).toBe('exam')
    expect(() => parseDocumentUploadRequest({ ...request, storagePath: '/arbitrario' })).toThrow()
  })

  it('rejeita status e hash inválidos', () => {
    expect(clinicalDocumentSchema.safeParse({ status: 'public' }).success).toBe(false)
    expect(documentSecurityScanSchema.safeParse({ sha256: 'invalido' }).success).toBe(false)
  })

  it('rejeita MIME, tamanho, path traversal e dupla extensão', () => {
    expect(() => assertDeclaredFile({
      fileName: request.originalFileName,
      declaredMimeType: 'text/html',
      size: request.size,
    })).toThrow()
    expect(() => assertDeclaredFile({
      fileName: request.originalFileName,
      declaredMimeType: request.declaredMimeType,
      size: -1,
    })).toThrow()
    expect(() => assertDeclaredFile({
      fileName: 'laudo.exe.pdf',
      declaredMimeType: request.declaredMimeType,
      size: request.size,
    })).toThrow()
    expect(() => assertDeclaredFile({
      fileName: '../laudo.pdf',
      declaredMimeType: request.declaredMimeType,
      size: request.size,
    })).toThrow()
  })
})
