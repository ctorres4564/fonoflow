import { describe, expect, it, vi } from 'vitest'
import {
  finalizeDocumentUpload,
  getDocumentStatus,
  listDocumentMetadata,
  requestDocumentDownload,
  requestDocumentUpload,
} from './documentStorageWorkflow.js'
import { MockMalwareScanner } from './malwareScanner.js'

const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF')

function createRepository() {
  let sequence = 0
  let transactionQueue = Promise.resolve()
  const data = new Map([
    ['patients/patient-a', { userId: 'professional-a', organizationId: 'clinic-a' }],
    ['patients/patient-b', { userId: 'professional-b' }],
  ])
  const objects = new Map()
  const repository = {
    data,
    objects,
    createId() {
      sequence += 1
      return `id-${sequence}`
    },
    randomName(extension) {
      sequence += 1
      return `00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}.${extension}`
    },
    timestamp() {
      return '2026-08-01T12:00:00.000Z'
    },
    async authorizeUpload({ storagePath, declaredMimeType, expiresAt }) {
      return {
        url: `https://storage.test/upload?path=${encodeURIComponent(storagePath)}&until=${expiresAt.getTime()}`,
        requiredHeaders: {
          'Content-Type': declaredMimeType,
          'x-goog-if-generation-match': '0',
        },
      }
    },
    async inspectObject(path) {
      const buffer = objects.get(path)
      return buffer ? { buffer, metadata: {} } : null
    },
    async promote({ sourcePath, targetPath }) {
      if (objects.has(targetPath)) throw new Error('already_exists')
      const buffer = objects.get(sourcePath)
      objects.set(targetPath, buffer)
      return buffer
    },
    async remove(path) {
      objects.delete(path)
    },
    async signDownload({ storagePath, expiresAt }) {
      return `https://storage.test/download?path=${encodeURIComponent(storagePath)}&until=${expiresAt.getTime()}`
    },
    async read(path) {
      return data.get(path) || null
    },
    async listDocuments(patientId) {
      const prefix = `patients/${patientId}/documents/`
      return [...data.entries()]
        .filter(([path]) => path.startsWith(prefix) && !path.slice(prefix.length).includes('/'))
        .map(([path, value]) => ({ id: path.slice(prefix.length), value }))
    },
    runTransaction(callback) {
      const execute = async () => {
        const writes = []
        const transaction = {
          async readMany(paths) {
            return paths.map((path) => data.get(path) || null)
          },
          create(path, value) {
            writes.push({ type: 'create', path, value })
          },
          update(path, value) {
            writes.push({ type: 'update', path, value })
          },
        }
        const result = await callback(transaction)
        for (const write of writes) {
          if (write.type === 'create') {
            if (data.has(write.path)) throw new Error(`already_exists:${write.path}`)
            data.set(write.path, structuredClone(write.value))
          } else {
            if (!data.has(write.path)) throw new Error(`not_found:${write.path}`)
            data.set(write.path, { ...data.get(write.path), ...structuredClone(write.value) })
          }
        }
        return result
      }
      const result = transactionQueue.then(execute, execute)
      transactionQueue = result.then(
        () => undefined,
        () => undefined,
      )
      return result
    },
  }
  return repository
}

function uploadPayload(overrides = {}) {
  return {
    patientId: 'patient-a',
    requestId: 'request-upload-1',
    category: 'clinical_report',
    title: 'Laudo fictício',
    description: null,
    documentDate: '2026-08-01',
    sensitivityLevel: 'sensitive',
    accessLevel: 'owner_only',
    originalFileName: 'laudo.pdf',
    declaredMimeType: 'application/pdf',
    size: pdf.length,
    ...overrides,
  }
}

async function prepareUpload(repository, overrides = {}) {
  const upload = await requestDocumentUpload({
    uid: 'professional-a',
    payload: uploadPayload(overrides),
    repository,
  })
  const path = `patients/patient-a/documents/${upload.documentId}`
  const document = repository.data.get(path)
  repository.objects.set(document.file.storagePath, pdf)
  return { upload, path, document }
}

function finalizePayload(upload, requestId = 'request-finalize-1') {
  return {
    patientId: 'patient-a',
    documentId: upload.documentId,
    uploadId: upload.uploadId,
    requestId,
  }
}

function auditActions(repository) {
  return [...repository.data.entries()]
    .filter(([path]) => path.startsWith('auditLogs/'))
    .map(([, value]) => value.action)
}

describe('document storage workflow', () => {
  it('autoriza upload curto em quarentena sem expor o caminho na resposta', async () => {
    const repository = createRepository()
    const result = await requestDocumentUpload({
      uid: 'professional-a',
      payload: uploadPayload(),
      repository,
      now: new Date('2026-08-01T12:00:00.000Z'),
    })
    const document = repository.data.get(`patients/patient-a/documents/${result.documentId}`)

    expect(result.uploadUrl).toContain('https://storage.test/upload')
    expect(result.requiredHeaders['x-goog-if-generation-match']).toBe('0')
    expect(result).not.toHaveProperty('storagePath')
    expect(result.expiresAt).toBe('2026-08-01T12:10:00.000Z')
    expect(document.file.storagePath).toContain('/quarantine/')
    expect(document.file.randomFileName).not.toContain('laudo')
    expect(auditActions(repository)).toEqual(['document_upload_requested'])
  })

  it('reexecuta o mesmo requestId sem duplicar documento ou auditoria', async () => {
    const repository = createRepository()
    const first = await requestDocumentUpload({
      uid: 'professional-a',
      payload: uploadPayload(),
      repository,
    })
    const second = await requestDocumentUpload({
      uid: 'professional-a',
      payload: uploadPayload(),
      repository,
    })

    expect(second).toMatchObject({ documentId: first.documentId, replayed: true })
    expect(auditActions(repository)).toEqual(['document_upload_requested'])
    expect([...repository.data.keys()].filter((path) => path.includes('/documents/'))).toHaveLength(1)
  })

  it('rejeita requestId reutilizado com payload diferente e paciente alheio', async () => {
    const repository = createRepository()
    await requestDocumentUpload({ uid: 'professional-a', payload: uploadPayload(), repository })
    await expect(
      requestDocumentUpload({
        uid: 'professional-a',
        payload: uploadPayload({ title: 'Outro laudo' }),
        repository,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    await expect(
      requestDocumentUpload({
        uid: 'professional-a',
        payload: uploadPayload({ patientId: 'patient-b', requestId: 'request-other' }),
        repository,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('rejeita paciente inexistente e arquivo acima do limite do tipo', async () => {
    const repository = createRepository()
    await expect(
      requestDocumentUpload({
        uid: 'professional-a',
        payload: uploadPayload({ patientId: 'missing', requestId: 'missing-patient' }),
        repository,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(
      requestDocumentUpload({
        uid: 'professional-a',
        payload: uploadPayload({ size: 20 * 1024 * 1024 + 1, requestId: 'too-large' }),
        repository,
      }),
    ).rejects.toThrow('Tamanho')
  })

  it('promove arquivo limpo, registra versão e remove a quarentena', async () => {
    const repository = createRepository()
    const { upload, path, document } = await prepareUpload(repository)
    const result = await finalizeDocumentUpload({
      uid: 'professional-a',
      payload: finalizePayload(upload),
      repository,
      scanner: new MockMalwareScanner({ status: 'clean' }),
    })
    const available = repository.data.get(path)

    expect(result).toMatchObject({ status: 'available', available: true, replayed: false })
    expect(available.file.scanStatus).toBe('clean')
    expect(available.file.storagePath).toContain('/available/')
    expect(repository.objects.has(document.file.storagePath)).toBe(false)
    expect(repository.data.has(`${path}/versions/${available.currentVersionId}`)).toBe(true)
    expect(auditActions(repository)).toEqual([
      'document_upload_requested',
      'document_upload_completed',
      'document_scan_started',
      'document_scan_clean',
    ])
  })

  it('torna a finalização idempotente sem duplicar scan, versão ou auditoria', async () => {
    const repository = createRepository()
    const { upload } = await prepareUpload(repository)
    const scanner = new MockMalwareScanner({ status: 'clean' })
    const first = await finalizeDocumentUpload({
      uid: 'professional-a',
      payload: finalizePayload(upload),
      repository,
      scanner,
    })
    const before = repository.data.size
    const second = await finalizeDocumentUpload({
      uid: 'professional-a',
      payload: finalizePayload(upload),
      repository,
      scanner,
    })

    expect(second).toMatchObject({ documentId: first.documentId, replayed: true })
    expect(repository.data.size).toBe(before)
    expect(auditActions(repository).filter((action) => action === 'document_scan_clean')).toHaveLength(1)
  })

  it.each([
    ['infected', 'blocked', 'document_scan_infected'],
    ['failed', 'scan_failed', 'document_scan_failed'],
  ])('mantém resultado %s indisponível', async (scanStatus, documentStatus, action) => {
    const repository = createRepository()
    const { upload, path } = await prepareUpload(repository)
    const result = await finalizeDocumentUpload({
      uid: 'professional-a',
      payload: finalizePayload(upload),
      repository,
      scanner: new MockMalwareScanner({ status: scanStatus, threatName: 'fictitious' }),
    })

    expect(result).toMatchObject({ status: documentStatus, available: false })
    expect(repository.data.get(path).file.storagePath).toContain('/quarantine/')
    expect(auditActions(repository)).toContain(action)
  })

  it('falha de forma segura quando o scanner excede o timeout', async () => {
    vi.stubEnv('DOCUMENT_SCAN_TIMEOUT_MS', '1')
    const repository = createRepository()
    const { upload } = await prepareUpload(repository)
    const result = await finalizeDocumentUpload({
      uid: 'professional-a',
      payload: finalizePayload(upload),
      repository,
      scanner: { scan: () => new Promise(() => {}) },
    })
    vi.unstubAllEnvs()

    expect(result).toMatchObject({ status: 'scan_failed', available: false })
    expect(auditActions(repository)).toContain('document_scan_failed')
  })

  it('bloqueia magic bytes incompatíveis sem chamar o scanner', async () => {
    const repository = createRepository()
    const { upload, path, document } = await prepareUpload(repository)
    repository.objects.set(document.file.storagePath, Buffer.alloc(pdf.length, 0))
    const scanner = { scan: vi.fn() }
    const result = await finalizeDocumentUpload({
      uid: 'professional-a',
      payload: finalizePayload(upload),
      repository,
      scanner,
    })

    expect(result).toMatchObject({ status: 'blocked', available: false })
    expect(repository.data.get(path).file.scanStatus).toBe('failed')
    expect(scanner.scan).not.toHaveBeenCalled()
  })

  it('bloqueia duas finalizações concorrentes com requestIds diferentes', async () => {
    const repository = createRepository()
    const { upload } = await prepareUpload(repository)
    const scanner = new MockMalwareScanner({ status: 'clean' })
    const settled = await Promise.allSettled([
      finalizeDocumentUpload({
        uid: 'professional-a',
        payload: finalizePayload(upload, 'finalize-a'),
        repository,
        scanner,
      }),
      finalizeDocumentUpload({
        uid: 'professional-a',
        payload: finalizePayload(upload, 'finalize-b'),
        repository,
        scanner,
      }),
    ])

    expect(settled.filter((item) => item.status === 'fulfilled')).toHaveLength(1)
    expect(settled.filter((item) => item.status === 'rejected')).toHaveLength(1)
  })

  it('emite download temporário somente para documento limpo e audita a decisão', async () => {
    const repository = createRepository()
    const { upload } = await prepareUpload(repository)
    await finalizeDocumentUpload({
      uid: 'professional-a',
      payload: finalizePayload(upload),
      repository,
      scanner: new MockMalwareScanner({ status: 'clean' }),
    })
    const payload = {
      patientId: 'patient-a',
      documentId: upload.documentId,
      requestId: 'download-1',
    }
    const first = await requestDocumentDownload({
      uid: 'professional-a',
      payload,
      repository,
      now: new Date('2026-08-01T12:00:00.000Z'),
    })
    const second = await requestDocumentDownload({ uid: 'professional-a', payload, repository })

    expect(first.downloadUrl).toContain('https://storage.test/download')
    expect(first).not.toHaveProperty('storagePath')
    expect(first.expiresAt).toBe('2026-08-01T12:05:00.000Z')
    expect(second.replayed).toBe(true)
    expect(auditActions(repository)).toContain('document_download_requested')
    expect(auditActions(repository)).toContain('document_download_granted')
  })

  it('nega download de quarentena, registra auditoria e protege o status por proprietário', async () => {
    const repository = createRepository()
    const { upload } = await prepareUpload(repository)
    await expect(
      requestDocumentDownload({
        uid: 'professional-a',
        payload: {
          patientId: 'patient-a',
          documentId: upload.documentId,
          requestId: 'download-denied',
        },
        repository,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    expect(auditActions(repository)).toContain('document_download_denied')
    await expect(
      getDocumentStatus({
        uid: 'professional-b',
        patientId: 'patient-a',
        documentId: upload.documentId,
        repository,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('lista apenas metadados sanitizados pelo backend', async () => {
    const repository = createRepository()
    const { upload } = await prepareUpload(repository)
    const result = await listDocumentMetadata({
      uid: 'professional-a',
      payload: { patientId: 'patient-a' },
      repository,
    })

    expect(result.documents).toHaveLength(1)
    expect(result.documents[0]).toMatchObject({
      id: upload.documentId,
      name: 'laudo.pdf',
      status: 'pending_upload',
      available: false,
    })
    expect(JSON.stringify(result)).not.toContain('storagePath')
    expect(JSON.stringify(result)).not.toContain('/quarantine/')
  })
})
