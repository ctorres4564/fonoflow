import { describe, expect, it } from 'vitest'
import { MockMalwareScanner } from './malwareScanner.js'
import {
  archiveAttachment,
  createAttachmentDraft,
  finalizeAttachment,
  linkAttachment,
  listPatientAttachments,
  requestAttachmentDownload,
  requestAttachmentUpload,
} from './clinicalAttachmentWorkflow.js'

const pdf = Buffer.from('%PDF-1.4\nclinical attachment\n%%EOF')

function repositoryFixture({ consentType = null } = {}) {
  let sequence = 0
  let queue = Promise.resolve()
  const data = new Map([
    ['patients/patient-a', { userId: 'professional-a', organizationId: 'clinic-a' }],
    ['patients/patient-b', { userId: 'professional-b' }],
    ['patients/patient-a/evolutions/evolution-a', { patientId: 'patient-a', status: 'finalized', richText: { plainText: 'imutável' } }],
    ['schedules/appointment-a', { patientId: 'patient-a', userId: 'professional-a', serviceType: 'home_care', status: 'completed' }],
    ['schedules/appointment-a/homeCareVisit/current', { patientId: 'patient-a', appointmentId: 'appointment-a', userId: 'professional-a', status: 'completed', travel: { actualDistanceKm: 8 } }],
    ['schedules/appointment-b', { patientId: 'patient-a', userId: 'professional-b', status: 'scheduled' }],
  ])
  if (consentType) data.set(`patients/patient-a/consents/consent-${consentType}`, {
    schemaVersion: 2,
    patientId: 'patient-a',
    consentType,
    active: true,
    revoked: false,
    version: { number: 3 },
  })
  const objects = new Map()
  const repository = {
    data,
    objects,
    createId() { sequence += 1; return `id-${sequence}` },
    randomName(extension) {
      sequence += 1
      return `00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}.${extension}`
    },
    timestamp() { return '2026-08-01T12:00:00.000Z' },
    async read(path) { return data.get(path) || null },
    async listConsents(patientId) {
      const prefix = `patients/${patientId}/consents/`
      return [...data.entries()]
        .filter(([path]) => path.startsWith(prefix))
        .map(([path, value]) => ({ id: path.slice(prefix.length), ...value }))
    },
    async listDocuments(patientId) {
      const prefix = `patients/${patientId}/documents/`
      return [...data.entries()]
        .filter(([path]) => path.startsWith(prefix) && !path.slice(prefix.length).includes('/'))
        .map(([path, value]) => ({ id: path.slice(prefix.length), value }))
    },
    async listLinkOptions() { return { evolutions: [], appointments: [] } },
    async recordAudit(event) {
      sequence += 1
      data.set(`auditLogs/external-${sequence}`, event)
    },
    async authorizeUpload({ storagePath, declaredMimeType, expiresAt }) {
      return {
        url: `https://storage.test/upload?path=${encodeURIComponent(storagePath)}&until=${expiresAt.getTime()}`,
        requiredHeaders: { 'Content-Type': declaredMimeType, 'x-goog-if-generation-match': '0' },
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
    async remove(path) { objects.delete(path) },
    async signDownload({ storagePath, expiresAt }) {
      return `https://storage.test/download?path=${encodeURIComponent(storagePath)}&until=${expiresAt.getTime()}`
    },
    runTransaction(callback) {
      const execute = async () => {
        const writes = []
        const transaction = {
          async readMany(paths) { return paths.map((path) => data.get(path) || null) },
          create(path, value) { writes.push({ type: 'create', path, value }) },
          update(path, value) { writes.push({ type: 'update', path, value }) },
          set(path, value) { writes.push({ type: 'set', path, value }) },
        }
        const result = await callback(transaction)
        for (const write of writes) {
          if (write.type === 'create') {
            if (data.has(write.path)) throw new Error(`already_exists:${write.path}`)
            data.set(write.path, structuredClone(write.value))
          } else if (write.type === 'update') {
            if (!data.has(write.path)) throw new Error(`not_found:${write.path}`)
            data.set(write.path, { ...data.get(write.path), ...structuredClone(write.value) })
          } else data.set(write.path, structuredClone(write.value))
        }
        return result
      }
      const result = queue.then(execute, execute)
      queue = result.then(() => undefined, () => undefined)
      return result
    },
  }
  return repository
}

const draftPayload = (overrides = {}) => ({
  patientId: 'patient-a',
  requestId: 'draft-request',
  category: 'exam',
  title: 'Exame clínico fictício',
  description: null,
  documentDate: '2026-08-01',
  clinicalContext: {
    evolutionId: 'evolution-a',
    appointmentId: 'appointment-a',
    homeCareVisitId: 'current',
    relatedProfessionalId: 'professional-a',
  },
  ...overrides,
})

async function prepareUpload(repository, overrides = {}) {
  const image = overrides.category === 'clinical_image'
  const fileBuffer = image ? Buffer.from([0xff, 0xd8, 0xff, 0x00]) : pdf
  const draft = await createAttachmentDraft({
    uid: 'professional-a', payload: draftPayload(overrides), repository,
  })
  const upload = await requestAttachmentUpload({
    uid: 'professional-a',
    repository,
    payload: {
      patientId: 'patient-a',
      documentId: draft.documentId,
      requestId: 'upload-request',
      originalFileName: image ? 'imagem.jpg' : 'exame.pdf',
      declaredMimeType: image ? 'image/jpeg' : 'application/pdf',
      size: fileBuffer.length,
    },
  })
  const path = `patients/patient-a/documents/${draft.documentId}`
  repository.objects.set(repository.data.get(path).file.storagePath, fileBuffer)
  return { draft, upload, path }
}

const actions = (repository) => [...repository.data.entries()]
  .filter(([path]) => path.startsWith('auditLogs/'))
  .map(([, value]) => value.action)

describe('clinical attachment workflow', () => {
  it('cria rascunho idempotente e valida os vínculos sem alterar os pais', async () => {
    const repository = repositoryFixture()
    const evolutionBefore = structuredClone(repository.data.get('patients/patient-a/evolutions/evolution-a'))
    const first = await createAttachmentDraft({ uid: 'professional-a', payload: draftPayload(), repository })
    const second = await createAttachmentDraft({ uid: 'professional-a', payload: draftPayload(), repository })

    expect(second).toMatchObject({ documentId: first.documentId, replayed: true })
    expect(repository.data.get('patients/patient-a/evolutions/evolution-a')).toEqual(evolutionBefore)
    expect(actions(repository).filter((action) => action === 'clinical_attachment_draft_created')).toHaveLength(1)
  })

  it('rejeita evolução inexistente, agendamento alheio e paciente alheio', async () => {
    const repository = repositoryFixture()
    await expect(createAttachmentDraft({
      uid: 'professional-a',
      payload: draftPayload({
        requestId: 'bad-evolution',
        clinicalContext: { ...draftPayload().clinicalContext, evolutionId: 'missing' },
      }),
      repository,
    })).rejects.toMatchObject({ code: 'INVALID_LINK' })
    await expect(createAttachmentDraft({
      uid: 'professional-a',
      payload: draftPayload({
        requestId: 'bad-appointment',
        clinicalContext: { ...draftPayload().clinicalContext, appointmentId: 'appointment-b', homeCareVisitId: null },
      }),
      repository,
    })).rejects.toMatchObject({ code: 'INVALID_LINK' })
    await expect(createAttachmentDraft({
      uid: 'professional-a',
      payload: draftPayload({ patientId: 'patient-b', requestId: 'bad-patient', clinicalContext: {} }),
      repository,
    })).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('impede iniciar imagem sem consentimento e aceita a versão válida', async () => {
    const deniedRepository = repositoryFixture()
    await expect(createAttachmentDraft({
      uid: 'professional-a',
      payload: draftPayload({ category: 'clinical_image', documentDate: null, requestId: 'image-denied' }),
      repository: deniedRepository,
    })).rejects.toMatchObject({ code: 'CONSENT_REQUIRED' })
    expect(actions(deniedRepository)).toContain('clinical_attachment_consent_denied')

    const repository = repositoryFixture({ consentType: 'image' })
    const draft = await createAttachmentDraft({
      uid: 'professional-a',
      payload: draftPayload({ category: 'clinical_image', documentDate: null, requestId: 'image-valid' }),
      repository,
    })
    expect(draft.consentContext).toMatchObject({ consentVersion: 3, validationResult: 'valid' })
  })

  it('rejeita MIME incompatível com a categoria antes da URL de upload', async () => {
    const repository = repositoryFixture({ consentType: 'image' })
    const draft = await createAttachmentDraft({
      uid: 'professional-a',
      payload: draftPayload({ category: 'clinical_image', documentDate: null }),
      repository,
    })
    await expect(requestAttachmentUpload({
      uid: 'professional-a', repository,
      payload: { patientId: 'patient-a', documentId: draft.documentId, requestId: 'bad-mime', originalFileName: 'audio.mp3', declaredMimeType: 'audio/mpeg', size: 10 },
    })).rejects.toThrow('categoria')
  })

  it('finaliza arquivo limpo e cria referências sem reescrever evolução, agenda ou visita', async () => {
    const repository = repositoryFixture()
    const parentSnapshots = {
      evolution: structuredClone(repository.data.get('patients/patient-a/evolutions/evolution-a')),
      appointment: structuredClone(repository.data.get('schedules/appointment-a')),
      visit: structuredClone(repository.data.get('schedules/appointment-a/homeCareVisit/current')),
    }
    const { draft, upload, path } = await prepareUpload(repository)
    const result = await finalizeAttachment({
      uid: 'professional-a', repository,
      scanner: new MockMalwareScanner({ status: 'clean' }),
      payload: { patientId: 'patient-a', documentId: draft.documentId, uploadId: upload.uploadId, requestId: 'finalize-request' },
    })

    expect(result).toMatchObject({ available: true, finalized: true })
    expect(repository.data.get(path).attachmentFinalizedAt).toBeTruthy()
    expect(repository.data.has(`patients/patient-a/evolutions/evolution-a/attachments/${draft.documentId}`)).toBe(true)
    expect(repository.data.has(`schedules/appointment-a/attachments/${draft.documentId}`)).toBe(true)
    expect(repository.data.has(`schedules/appointment-a/homeCareVisit/current/attachments/${draft.documentId}`)).toBe(true)
    expect(repository.data.get('patients/patient-a/evolutions/evolution-a')).toEqual(parentSnapshots.evolution)
    expect(repository.data.get('schedules/appointment-a')).toEqual(parentSnapshots.appointment)
    expect(repository.data.get('schedules/appointment-a/homeCareVisit/current')).toEqual(parentSnapshots.visit)
  })

  it('não duplica finalização ou vínculos no replay', async () => {
    const repository = repositoryFixture()
    const { draft, upload } = await prepareUpload(repository)
    const payload = { patientId: 'patient-a', documentId: draft.documentId, uploadId: upload.uploadId, requestId: 'finalize-request' }
    await finalizeAttachment({ uid: 'professional-a', repository, scanner: new MockMalwareScanner(), payload })
    const before = repository.data.size
    const replayed = await finalizeAttachment({ uid: 'professional-a', repository, scanner: new MockMalwareScanner(), payload })
    expect(replayed.replayed).toBe(true)
    expect(repository.data.size).toBe(before)
  })

  it.each([
    ['infected', 'blocked'],
    ['failed', 'scan_failed'],
  ])('não finaliza scan %s', async (scan, status) => {
    const repository = repositoryFixture()
    const { draft, upload } = await prepareUpload(repository)
    const result = await finalizeAttachment({
      uid: 'professional-a', repository,
      scanner: new MockMalwareScanner({ status: scan }),
      payload: { patientId: 'patient-a', documentId: draft.documentId, uploadId: upload.uploadId, requestId: `finalize-${scan}` },
    })
    expect(result).toMatchObject({ status, available: false, finalized: false })
    expect(repository.data.has(`patients/patient-a/evolutions/evolution-a/attachments/${draft.documentId}`)).toBe(false)
  })

  it('bloqueia quando consentimento é revogado entre upload e finalização', async () => {
    const repository = repositoryFixture({ consentType: 'image' })
    const { draft, upload, path } = await prepareUpload(repository, {
      category: 'clinical_image', documentDate: null, requestId: 'image-draft',
    })
    repository.data.set('patients/patient-a/consents/consent-image', {
      ...repository.data.get('patients/patient-a/consents/consent-image'),
      active: false, revoked: true,
    })
    await expect(finalizeAttachment({
      uid: 'professional-a', repository, scanner: new MockMalwareScanner(),
      payload: { patientId: 'patient-a', documentId: draft.documentId, uploadId: upload.uploadId, requestId: 'image-finalize' },
    })).rejects.toMatchObject({ code: 'CONSENT_REQUIRED' })
    expect(repository.data.get(path).status).toBe('blocked')
  })

  it('arquiva logicamente, omite por padrão e nega download', async () => {
    const repository = repositoryFixture()
    const { draft, upload } = await prepareUpload(repository)
    await finalizeAttachment({
      uid: 'professional-a', repository, scanner: new MockMalwareScanner(),
      payload: { patientId: 'patient-a', documentId: draft.documentId, uploadId: upload.uploadId, requestId: 'finalize-request' },
    })
    const payload = { patientId: 'patient-a', documentId: draft.documentId, requestId: 'archive-request', reason: 'Documento substituído administrativamente.' }
    const first = await archiveAttachment({ uid: 'professional-a', payload, repository })
    const second = await archiveAttachment({ uid: 'professional-a', payload, repository })
    expect(first.status).toBe('archived')
    expect(second.replayed).toBe(true)
    expect((await listPatientAttachments({ uid: 'professional-a', payload: { patientId: 'patient-a', includeArchived: false }, repository })).attachments).toHaveLength(0)
    expect((await listPatientAttachments({ uid: 'professional-a', payload: { patientId: 'patient-a', includeArchived: true }, repository })).attachments).toHaveLength(1)
    await expect(requestAttachmentDownload({
      uid: 'professional-a', repository,
      payload: { patientId: 'patient-a', documentId: draft.documentId, requestId: 'archived-download' },
    })).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('gera download temporário auditado apenas quando disponível', async () => {
    const repository = repositoryFixture()
    const { draft, upload } = await prepareUpload(repository)
    await finalizeAttachment({
      uid: 'professional-a', repository, scanner: new MockMalwareScanner(),
      payload: { patientId: 'patient-a', documentId: draft.documentId, uploadId: upload.uploadId, requestId: 'finalize-request' },
    })
    const result = await requestAttachmentDownload({
      uid: 'professional-a', repository, now: new Date('2026-08-01T12:00:00.000Z'),
      payload: { patientId: 'patient-a', documentId: draft.documentId, requestId: 'download-request' },
    })
    expect(result.downloadUrl).toContain('https://storage.test/download')
    expect(result.expiresAt).toBe('2026-08-01T12:05:00.000Z')
    expect(JSON.stringify(result)).not.toContain('storagePath')
    expect(actions(repository)).toContain('clinical_attachment_download_granted')
  })

  it('cria vínculo manual idempotente para anexo disponível', async () => {
    const repository = repositoryFixture()
    const { draft, upload } = await prepareUpload(repository, { clinicalContext: {} })
    await finalizeAttachment({
      uid: 'professional-a', repository, scanner: new MockMalwareScanner(),
      payload: { patientId: 'patient-a', documentId: draft.documentId, uploadId: upload.uploadId, requestId: 'finalize-request' },
    })
    const payload = { patientId: 'patient-a', documentId: draft.documentId, requestId: 'link-request', linkType: 'evolution', targetId: 'evolution-a' }
    await linkAttachment({ uid: 'professional-a', payload, repository })
    const replayed = await linkAttachment({ uid: 'professional-a', payload, repository })
    const duplicate = await linkAttachment({
      uid: 'professional-a', repository,
      payload: { ...payload, requestId: 'link-request-2' },
    })
    expect(replayed.replayed).toBe(true)
    expect(duplicate.alreadyLinked).toBe(true)
    expect(repository.data.has(`patients/patient-a/evolutions/evolution-a/attachments/${draft.documentId}`)).toBe(true)
  })

  it('normaliza documento V1 apenas em memória e rejeita versão futura', async () => {
    const repository = repositoryFixture()
    repository.data.set('patients/patient-a/documents/legacy', { name: 'legado.pdf', type: 'application/pdf', url: 'https://legacy' })
    const before = structuredClone(repository.data.get('patients/patient-a/documents/legacy'))
    const list = await listPatientAttachments({ uid: 'professional-a', payload: { patientId: 'patient-a', includeArchived: true }, repository })
    expect(list.attachments[0]).toMatchObject({ legacy: true, available: false })
    expect(repository.data.get('patients/patient-a/documents/legacy')).toEqual(before)
    repository.data.set('patients/patient-a/documents/future', { schemaVersion: 99 })
    await expect(listPatientAttachments({ uid: 'professional-a', payload: { patientId: 'patient-a', includeArchived: true }, repository })).rejects.toMatchObject({ code: 'UNSUPPORTED_SCHEMA' })
  })
})
