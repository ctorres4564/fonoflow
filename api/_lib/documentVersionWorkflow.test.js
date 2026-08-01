import { describe, expect, it } from 'vitest'
import { createDocumentIntegrityService } from './documentIntegrityService.js'
import {
  applyDocumentLegalHold,
  createDocumentVersion,
  finalizeDocumentVersion,
  listDocumentVersions,
  requestDocumentVersionUpload,
  restoreDocumentVersion,
  verifyDocumentIntegrity,
} from './documentVersionWorkflow.js'
import { MockMalwareScanner } from './malwareScanner.js'

const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF')
const uid = 'professional-a'
const patientId = 'patient-a'
const documentId = 'document-a'
const basePath = `patients/${patientId}/documents/${documentId}`
const integrityService = createDocumentIntegrityService({
  DOCUMENT_INTEGRITY_HMAC_KEY: '0123456789abcdef0123456789abcdef',
})

function repositoryFixture() {
  const data = new Map([
    [`patients/${patientId}`, { userId: uid, organizationId: uid }],
    [basePath, {
      schemaVersion: 2, patientId, ownerId: uid, organizationId: uid, category: 'exam',
      title: 'Exame fictício', status: 'available', currentVersionId: 'technical-v1',
      file: { originalFileName: 'old.pdf', scanStatus: 'clean' },
      clinicalContext: {}, createdBy: uid, createdAt: '2026-01-01T00:00:00Z',
    }],
    [`${basePath}/versions/technical-v1`, {
      schemaVersion: 2, documentId, versionId: 'technical-v1', storagePath: 'users/old.pdf',
      sha256: 'f'.repeat(64), size: 10, detectedMimeType: 'application/pdf',
      createdBy: uid, createdAt: '2026-01-01T00:00:00Z',
    }],
  ])
  let id = 0
  let uploaded = null
  const repository = {
    data,
    createId() { id += 1; return `generated-${id}` },
    randomName(extension) { return `12345678-1234-1234-1234-123456789012.${extension}` },
    timestamp() { return '2026-08-01T12:00:00.000Z' },
    async read(path) { return data.get(path) || null },
    async listConsents() { return [] },
    async authorizeUpload({ storagePath }) { uploaded = storagePath; return { url: 'https://upload.example/version', requiredHeaders: {} } },
    async inspectObject(path) { return path === uploaded || data.get(`object:${path}`) ? { buffer: data.get(`object:${path}`) || pdf, metadata: {} } : null },
    async promote({ sourcePath, targetPath }) { data.set(`object:${targetPath}`, data.get(`object:${sourcePath}`) || pdf); return data.get(`object:${targetPath}`) },
    async remove(path) { data.delete(`object:${path}`) },
    async listVersions() {
      const prefix = `${basePath}/versions/`
      return [...data.entries()].filter(([path]) => path.startsWith(prefix) && !path.slice(prefix.length).includes('/'))
        .map(([path, value]) => ({ id: path.slice(prefix.length), value }))
    },
    async listPatientVersions() {
      return (await this.listVersions()).map((item) => ({ documentId, ...item }))
    },
    async readRetentionPolicy() { return null },
    async runTransaction(callback) {
      const writes = []
      const result = await callback({
        async readMany(paths) { return paths.map((path) => data.get(path) || null) },
        create(path, value) { if (data.has(path)) throw new Error(`already exists: ${path}`); writes.push(['set', path, value]) },
        set(path, value) { writes.push(['set', path, value]) },
        update(path, value) { if (!data.has(path)) throw new Error(`missing: ${path}`); writes.push(['update', path, value]) },
      })
      for (const [kind, path, value] of writes) data.set(path, kind === 'update' ? { ...data.get(path), ...value } : value)
      return result
    },
  }
  return repository
}

async function uploadCleanVersion(repository, suffix = 'a') {
  const draft = await createDocumentVersion({ uid, repository, payload: {
    patientId, documentId, requestId: `create-${suffix}`, changeReason: `Alteração ${suffix}`,
  } })
  const authorization = await requestDocumentVersionUpload({ uid, repository, payload: {
    patientId, documentId, versionId: draft.versionId, requestId: `upload-${suffix}`,
    originalFileName: 'exame.pdf', declaredMimeType: 'application/pdf', size: pdf.length,
  } })
  const version = repository.data.get(`${basePath}/versions/${draft.versionId}`)
  repository.data.set(`object:${version.uploadRequest.storagePath}`, pdf)
  const result = await finalizeDocumentVersion({ uid, repository,
    scanner: new MockMalwareScanner(), integrityService, payload: {
      patientId, documentId, versionId: draft.versionId, uploadId: authorization.uploadId,
      requestId: `finalize-${suffix}`,
    } })
  return { ...result, draft }
}

describe('document version workflow', () => {
  it('cria número sequencial e é idempotente', async () => {
    const repository = repositoryFixture()
    const payload = { patientId, documentId, requestId: 'create-a', changeReason: 'Correção clínica' }
    const first = await createDocumentVersion({ uid, payload, repository })
    const replay = await createDocumentVersion({ uid, payload, repository })
    expect(first.versionNumber).toBe(2)
    expect(replay).toMatchObject({ versionId: first.versionId, replayed: true })
    expect(repository.data.get(basePath).totalVersions).toBe(2)
  })

  it('ativa uma versão limpa, assina e mantém apenas uma corrente', async () => {
    const repository = repositoryFixture()
    const result = await uploadCleanVersion(repository)
    const version = repository.data.get(`${basePath}/versions/${result.versionId}`)
    expect(result).toMatchObject({ status: 'current', available: true })
    expect(version.integrityStatus).toBe('valid')
    expect(integrityService.verify(version).valid).toBe(true)
    expect(repository.data.get(`${basePath}/versions/technical-v1`).status).toBe('superseded')
    expect(repository.data.get(basePath).currentVersionId).toBe(result.versionId)
  })

  it('detecta SHA duplicado no mesmo documento', async () => {
    const repository = repositoryFixture()
    await uploadCleanVersion(repository, 'a')
    const second = await uploadCleanVersion(repository, 'b')
    expect(second.duplicate).toMatchObject({ detected: true, scope: 'same_document' })
  })

  it('restaura sem reescrever a versão histórica', async () => {
    const repository = repositoryFixture()
    const first = await uploadCleanVersion(repository, 'a')
    await uploadCleanVersion(repository, 'b')
    const sourceBefore = structuredClone(repository.data.get(`${basePath}/versions/${first.versionId}`))
    const restored = await restoreDocumentVersion({ uid, repository, integrityService, payload: {
      patientId, documentId, versionId: first.versionId, requestId: 'restore-a', reason: 'Retorno clínico validado',
    } })
    expect(restored.versionId).not.toBe(first.versionId)
    expect(repository.data.get(`${basePath}/versions/${first.versionId}`)).toEqual(sourceBefore)
    expect(repository.data.get(basePath).currentVersionId).toBe(restored.versionId)
  })

  it('marca divergência, bloqueia download e registra legal hold', async () => {
    const repository = repositoryFixture()
    const current = await uploadCleanVersion(repository)
    const stored = repository.data.get(`${basePath}/versions/${current.versionId}`)
    repository.data.set(`object:${stored.fileMetadata.storagePath}`, Buffer.from('alterado'))
    const checked = await verifyDocumentIntegrity({ uid, repository, integrityService, payload: {
      patientId, documentId, versionId: current.versionId, requestId: 'verify-a',
    } })
    expect(checked.valid).toBe(false)
    expect(repository.data.get(basePath).integrityBlocked).toBe(true)
    const hold = await applyDocumentLegalHold({ uid, repository, payload: {
      patientId, documentId, requestId: 'hold-a', reason: 'Preservação por solicitação jurídica',
    } })
    expect(hold.legalHold).toBe(true)
    expect(repository.data.get(basePath).retentionStatus).toBe('legal_hold')
  })

  it('expõe versão técnica antiga apenas como legado em memória', async () => {
    const repository = repositoryFixture()
    const result = await listDocumentVersions({ uid, repository, payload: { patientId, documentId } })
    expect(result.versions[0]).toMatchObject({ id: 'technical-v1', legacy: true, integrityStatus: 'unavailable' })
    expect(result.versions[0].fileMetadata.sha256).toBe('f'.repeat(64))
  })
})
