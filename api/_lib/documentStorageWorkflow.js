import { createHash } from 'node:crypto'
import {
  assertDeclaredFile,
  DOCUMENT_CATEGORY_CONFIG,
  DOWNLOAD_TTL_MS,
  UPLOAD_TTL_MS,
} from '../../src/config/documentStorage.js'
import {
  clinicalDocumentSchema,
  documentDownloadResultSchema,
  documentSecurityScanSchema,
  documentUploadResultSchema,
  parseDocumentDownloadRequest,
  parseDocumentFinalizeRequest,
  parseDocumentListRequest,
  parseDocumentUploadRequest,
} from '../../src/schemas/documentStorage.schema.js'
import { inspectFile, sha256 } from './fileInspection.js'

const workflowError = (code, message) => Object.assign(new Error(message), { code })
const fingerprint = (value) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex')

function assertOwner(patient, uid) {
  if (!patient) throw workflowError('NOT_FOUND', 'Paciente não encontrado.')
  if (patient.userId !== uid) throw workflowError('FORBIDDEN', 'Acesso não autorizado.')
}

function replay(operation, input, kind) {
  if (!operation) return null
  if (operation.kind !== kind || operation.fingerprint !== fingerprint(input)) {
    throw workflowError('CONFLICT', 'requestId reutilizado com outro payload.')
  }
  return operation.result
}

function auditEvent(
  repository,
  { uid, input, documentId, uploadId = null, action, status, metadata = {} },
) {
  return {
    path: `auditLogs/${repository.createId('auditLogs')}`,
    value: {
      schemaVersion: 1,
      actorId: uid,
      patientId: input.patientId,
      documentId,
      uploadId,
      requestId: input.requestId,
      action,
      status,
      detectedMimeType: metadata.detectedMimeType || null,
      size: metadata.size ?? null,
      sha256Prefix: metadata.sha256?.slice(0, 12) || null,
      occurredAt: repository.timestamp(),
      source: 'backend',
    },
  }
}

function createAudit(transaction, repository, details) {
  const event = auditEvent(repository, details)
  transaction.create(event.path, event.value)
}

export async function requestDocumentUpload({
  uid, payload, repository, now = new Date(), clinicalAttachmentMode = false,
}) {
  const input = parseDocumentUploadRequest(payload)
  if (input.documentId && !clinicalAttachmentMode) {
    throw workflowError('FORBIDDEN', 'Rascunhos clínicos exigem o fluxo de anexos.')
  }
  if (DOCUMENT_CATEGORY_CONFIG[input.category]?.requiredConsentType && !clinicalAttachmentMode) {
    throw workflowError('FORBIDDEN', 'Mídia clínica exige validação de consentimento.')
  }
  const { extension } = assertDeclaredFile({
    fileName: input.originalFileName,
    declaredMimeType: input.declaredMimeType,
    size: input.size,
  })
  const operationPath = `documentStorageOperations/${input.requestId}`
  const draftPath = input.documentId
    ? `patients/${input.patientId}/documents/${input.documentId}`
    : null
  const [patient, storedOperation, storedDraft] = await Promise.all([
    repository.read(`patients/${input.patientId}`),
    repository.read(operationPath),
    draftPath ? repository.read(draftPath) : Promise.resolve(null),
  ])
  assertOwner(patient, uid)
  const storedResult = replay(storedOperation, input, 'request_upload')
  if (storedResult) return { ...storedResult, replayed: true }
  if (draftPath && (!storedDraft || storedDraft.ownerId !== uid || storedDraft.status !== 'draft')) {
    throw workflowError('CONFLICT', 'Rascunho documental inválido para upload.')
  }

  const documentId = input.documentId || repository.createId(`patients/${input.patientId}/documents`)
  const uploadId = repository.createId('documentUploads')
  const randomFileName = repository.randomName(extension)
  const quarantinePath =
    `users/${uid}/patients/${input.patientId}/documents/${documentId}` +
    `/quarantine/${uploadId}/${randomFileName}`
  const expiresAt = new Date(now.getTime() + UPLOAD_TTL_MS)
  const authorization = await repository.authorizeUpload({
    storagePath: quarantinePath,
    declaredMimeType: input.declaredMimeType,
    expiresAt,
  })
  const result = documentUploadResultSchema.parse({
    documentId,
    uploadId,
    uploadUrl: authorization.url,
    expiresAt: expiresAt.toISOString(),
    requiredHeaders: authorization.requiredHeaders,
  })

  return repository.runTransaction(async (transaction) => {
    const paths = [
      `patients/${input.patientId}`,
      operationPath,
      ...(draftPath ? [draftPath] : []),
    ]
    const [latestPatient, operation, latestDraft] = await transaction.readMany(paths)
    assertOwner(latestPatient, uid)
    const previous = replay(operation, input, 'request_upload')
    if (previous) return { ...previous, replayed: true }
    if (draftPath && (!latestDraft || latestDraft.ownerId !== uid || latestDraft.status !== 'draft')) {
      throw workflowError('CONFLICT', 'Rascunho documental inválido para upload.')
    }

    const timestamp = repository.timestamp()
    const document = clinicalDocumentSchema.parse({
      schemaVersion: 2,
      patientId: input.patientId,
      ownerId: uid,
      organizationId: latestPatient.organizationId || uid,
      category: input.category,
      title: input.title,
      description: input.description,
      documentDate: input.documentDate,
      clinicalContext: input.clinicalContext || latestDraft?.clinicalContext,
      consentContext: input.consentContext || latestDraft?.consentContext,
      status: 'pending_upload',
      sensitivityLevel: input.sensitivityLevel,
      accessLevel: input.accessLevel,
      currentVersionId: null,
      file: {
        schemaVersion: 2,
        uploadId,
        documentId,
        originalFileName: input.originalFileName,
        randomFileName,
        storagePath: quarantinePath,
        declaredMimeType: input.declaredMimeType,
        detectedMimeType: null,
        extension,
        size: input.size,
        sha256: null,
        uploadedBy: uid,
        uploadedAt: null,
        status: 'pending',
        requestId: input.requestId,
        scanStatus: 'pending',
      },
      attachmentFinalizedAt: latestDraft?.attachmentFinalizedAt || null,
      archivedBy: null,
      archivedAt: null,
      archiveReason: null,
      createdBy: latestDraft?.createdBy || uid,
      createdAt: latestDraft?.createdAt || timestamp,
      updatedAt: timestamp,
    })
    const documentPath = `patients/${input.patientId}/documents/${documentId}`
    if (draftPath) transaction.update(documentPath, document)
    else transaction.create(documentPath, document)
    createAudit(transaction, repository, {
      uid,
      input,
      documentId,
      uploadId,
      action: 'document_upload_requested',
      status: 'pending_upload',
    })
    transaction.create(operationPath, {
      kind: 'request_upload',
      uid,
      patientId: input.patientId,
      fingerprint: fingerprint(input),
      result,
      createdAt: timestamp,
    })
    return { ...result, replayed: false }
  })
}

export async function finalizeDocumentUpload({ uid, payload, repository, scanner }) {
  const input = parseDocumentFinalizeRequest(payload)
  const documentPath = `patients/${input.patientId}/documents/${input.documentId}`
  const operationPath = `documentStorageOperations/${input.requestId}`
  const [patient, document, storedOperation] = await Promise.all([
    repository.read(`patients/${input.patientId}`),
    repository.read(documentPath),
    repository.read(operationPath),
  ])
  assertOwner(patient, uid)
  const storedResult = replay(storedOperation, input, 'finalize_upload')
  if (storedResult) return { ...storedResult, replayed: true }
  if (!document) throw workflowError('NOT_FOUND', 'Documento não encontrado.')
  if (document.ownerId !== uid || document.file?.uploadId !== input.uploadId) {
    throw workflowError('FORBIDDEN', 'Upload não autorizado.')
  }

  const object = await repository.inspectObject(document.file.storagePath)
  if (!object) throw workflowError('NOT_FOUND', 'Arquivo de quarentena não encontrado.')

  let inspection
  try {
    inspection = inspectFile({
      buffer: object.buffer,
      originalFileName: document.file.originalFileName,
      declaredMimeType: document.file.declaredMimeType,
      declaredSize: document.file.size,
    })
  } catch {
    const result = { documentId: input.documentId, status: 'blocked', available: false }
    return repository.runTransaction(async (transaction) => {
      const [latest, operation] = await transaction.readMany([documentPath, operationPath])
      const previous = replay(operation, input, 'finalize_upload')
      if (previous) return { ...previous, replayed: true }
      if (!latest || latest.status !== 'pending_upload') {
        throw workflowError('CONFLICT', 'Documento não está aguardando upload.')
      }
      const timestamp = repository.timestamp()
      transaction.update(documentPath, {
        status: 'blocked',
        updatedAt: timestamp,
        file: { ...latest.file, status: 'blocked', scanStatus: 'failed' },
      })
      createAudit(transaction, repository, {
        uid,
        input,
        documentId: input.documentId,
        uploadId: input.uploadId,
        action: 'document_upload_completed',
        status: 'blocked',
      })
      transaction.create(operationPath, {
        kind: 'finalize_upload',
        fingerprint: fingerprint(input),
        result,
        createdAt: timestamp,
      })
      return { ...result, replayed: false }
    })
  }

  const claim = await repository.runTransaction(async (transaction) => {
    const [latest, operation] = await transaction.readMany([documentPath, operationPath])
    const previous = replay(operation, input, 'finalize_upload')
    if (previous) return { replayed: previous }
    if (!latest || latest.status !== 'pending_upload') {
      throw workflowError('CONFLICT', 'Documento não está aguardando upload.')
    }
    transaction.update(documentPath, {
      status: 'uploaded_to_quarantine',
      updatedAt: repository.timestamp(),
      file: {
        ...latest.file,
        detectedMimeType: inspection.detectedMimeType,
        size: inspection.size,
        sha256: inspection.sha256,
        uploadedAt: repository.timestamp(),
        status: 'quarantine',
        scanStatus: 'pending',
      },
    })
    createAudit(transaction, repository, {
      uid,
      input,
      documentId: input.documentId,
      uploadId: input.uploadId,
      action: 'document_upload_completed',
      status: 'uploaded_to_quarantine',
      metadata: inspection,
    })
    return { replayed: null }
  })
  if (claim.replayed) return { ...claim.replayed, replayed: true }

  const scanId = repository.createId(`${documentPath}/securityScans`)
  const scanRequestId = `${input.requestId}-scan`
  const startedAt = repository.timestamp()
  await repository.runTransaction(async (transaction) => {
    const [latest] = await transaction.readMany([documentPath])
    if (!latest || latest.status !== 'uploaded_to_quarantine') {
      throw workflowError('CONFLICT', 'Documento não está na quarentena.')
    }
    transaction.update(documentPath, {
      status: 'scanning',
      updatedAt: startedAt,
      file: { ...latest.file, scanStatus: 'scanning' },
    })
    transaction.create(
      `${documentPath}/securityScans/${scanId}`,
      documentSecurityScanSchema.parse({
        schemaVersion: 2,
        documentId: input.documentId,
        uploadId: input.uploadId,
        provider: 'pending',
        engineVersion: null,
        status: 'scanning',
        scannedAt: null,
        threatName: null,
        resultCode: null,
        sha256: inspection.sha256,
        requestId: scanRequestId,
        createdAt: startedAt,
        updatedAt: startedAt,
      }),
    )
    createAudit(transaction, repository, {
      uid,
      input,
      documentId: input.documentId,
      uploadId: input.uploadId,
      action: 'document_scan_started',
      status: 'scanning',
      metadata: inspection,
    })
  })

  let scan
  try {
    const timeoutMs = Number(process.env.DOCUMENT_SCAN_TIMEOUT_MS || 30_000)
    scan = await Promise.race([
      scanner.scan({
        filePath: document.file.storagePath,
        storagePath: document.file.storagePath,
        sha256: inspection.sha256,
        size: inspection.size,
        detectedMimeType: inspection.detectedMimeType,
        requestId: scanRequestId,
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('scanner_timeout')), timeoutMs),
      ),
    ])
  } catch {
    scan = {
      status: 'failed',
      provider: 'scanner',
      engineVersion: null,
      threatName: null,
      resultCode: 'SCAN_ERROR',
      scannedAt: new Date().toISOString(),
      sha256: inspection.sha256,
    }
  }
  if (!['clean', 'infected', 'failed'].includes(scan?.status)) {
    scan = {
      status: 'failed',
      provider: 'scanner',
      engineVersion: null,
      threatName: null,
      resultCode: 'INVALID_RESULT',
      scannedAt: new Date().toISOString(),
      sha256: inspection.sha256,
    }
  }

  let versionId = null
  let targetPath = null
  if (scan.status === 'clean') {
    try {
      versionId = repository.createId(`${documentPath}/versions`)
      targetPath =
        `users/${uid}/patients/${input.patientId}/documents/${input.documentId}` +
        `/available/${versionId}/${document.file.randomFileName}`
      const promoted = await repository.promote({
        sourcePath: document.file.storagePath,
        targetPath,
      })
      if (sha256(promoted) !== inspection.sha256) {
        throw new Error('promoted_hash_mismatch')
      }
      await repository.remove(document.file.storagePath)
    } catch {
      scan = {
        ...scan,
        status: 'failed',
        resultCode: 'PROMOTION_ERROR',
      }
      versionId = null
      targetPath = null
    }
  }

  const finalStatus =
    scan.status === 'clean' ? 'available' : scan.status === 'infected' ? 'blocked' : 'scan_failed'
  const result = {
    documentId: input.documentId,
    status: finalStatus,
    available: finalStatus === 'available',
  }

  return repository.runTransaction(async (transaction) => {
    const [latest, operation] = await transaction.readMany([documentPath, operationPath])
    const previous = replay(operation, input, 'finalize_upload')
    if (previous) return { ...previous, replayed: true }
    if (!latest || latest.status !== 'scanning') {
      throw workflowError('CONFLICT', 'Documento não está em verificação.')
    }
    const timestamp = repository.timestamp()
    transaction.update(documentPath, {
      status: finalStatus,
      currentVersionId: versionId,
      updatedAt: timestamp,
      file: {
        ...latest.file,
        storagePath: targetPath || latest.file.storagePath,
        status:
          finalStatus === 'available'
            ? 'available'
            : finalStatus === 'blocked'
              ? 'blocked'
              : 'failed',
        scanStatus: scan.status,
      },
    })
    transaction.update(`${documentPath}/securityScans/${scanId}`, {
      provider: scan.provider,
      engineVersion: scan.engineVersion || null,
      status: scan.status,
      scannedAt: scan.scannedAt,
      threatName: scan.threatName || null,
      resultCode: scan.resultCode || null,
      updatedAt: timestamp,
    })
    if (versionId) {
      transaction.create(`${documentPath}/versions/${versionId}`, {
        schemaVersion: 2,
        documentId: input.documentId,
        versionId,
        storagePath: targetPath,
        sha256: inspection.sha256,
        size: inspection.size,
        detectedMimeType: inspection.detectedMimeType,
        createdBy: uid,
        createdAt: timestamp,
      })
    }
    const action =
      scan.status === 'clean'
        ? 'document_scan_clean'
        : scan.status === 'infected'
          ? 'document_scan_infected'
          : 'document_scan_failed'
    createAudit(transaction, repository, {
      uid,
      input,
      documentId: input.documentId,
      uploadId: input.uploadId,
      action,
      status: finalStatus,
      metadata: inspection,
    })
    transaction.create(operationPath, {
      kind: 'finalize_upload',
      fingerprint: fingerprint(input),
      result,
      createdAt: timestamp,
    })
    return { ...result, replayed: false }
  })
}

export async function requestDocumentDownload({ uid, payload, repository, now = new Date() }) {
  const input = parseDocumentDownloadRequest(payload)
  const operationPath = `documentStorageOperations/${input.requestId}`
  const [patient, document, operation] = await Promise.all([
    repository.read(`patients/${input.patientId}`),
    repository.read(`patients/${input.patientId}/documents/${input.documentId}`),
    repository.read(operationPath),
  ])
  assertOwner(patient, uid)
  const previous = replay(operation, input, 'request_download')
  if (previous) return { ...previous, replayed: true }
  if (!document || document.ownerId !== uid) {
    throw workflowError('NOT_FOUND', 'Documento não encontrado.')
  }

  if (document.status !== 'available' || document.file?.scanStatus !== 'clean') {
    await repository.runTransaction(async (transaction) => {
      createAudit(transaction, repository, {
        uid,
        input,
        documentId: input.documentId,
        uploadId: document.file?.uploadId || null,
        action: 'document_download_denied',
        status: document.status,
        metadata: document.file,
      })
    })
    throw workflowError('FORBIDDEN', 'Documento indisponível para download.')
  }

  const expiresAt = new Date(now.getTime() + DOWNLOAD_TTL_MS)
  const downloadUrl = await repository.signDownload({
    storagePath: document.file.storagePath,
    expiresAt,
  })
  const result = documentDownloadResultSchema.parse({
    downloadUrl,
    expiresAt: expiresAt.toISOString(),
    documentId: input.documentId,
    fileName: document.file.originalFileName,
  })
  return repository.runTransaction(async (transaction) => {
    const [latestPatient, existing] = await transaction.readMany([
      `patients/${input.patientId}`,
      operationPath,
    ])
    assertOwner(latestPatient, uid)
    const replayed = replay(existing, input, 'request_download')
    if (replayed) return { ...replayed, replayed: true }
    createAudit(transaction, repository, {
      uid,
      input,
      documentId: input.documentId,
      uploadId: document.file.uploadId,
      action: 'document_download_requested',
      status: 'available',
      metadata: document.file,
    })
    createAudit(transaction, repository, {
      uid,
      input,
      documentId: input.documentId,
      uploadId: document.file.uploadId,
      action: 'document_download_granted',
      status: 'available',
      metadata: document.file,
    })
    transaction.create(operationPath, {
      kind: 'request_download',
      fingerprint: fingerprint(input),
      result,
      createdAt: repository.timestamp(),
    })
    return { ...result, replayed: false }
  })
}

export async function getDocumentStatus({ uid, patientId, documentId, repository }) {
  const patient = await repository.read(`patients/${patientId}`)
  assertOwner(patient, uid)
  const document = await repository.read(`patients/${patientId}/documents/${documentId}`)
  if (!document) throw workflowError('NOT_FOUND', 'Documento não encontrado.')
  return {
    documentId,
    status: document.status,
    scanStatus: document.file?.scanStatus || 'pending',
    available: document.status === 'available' && document.file?.scanStatus === 'clean',
  }
}

export async function listDocumentMetadata({ uid, payload, repository }) {
  const input = parseDocumentListRequest(payload)
  const patient = await repository.read(`patients/${input.patientId}`)
  assertOwner(patient, uid)
  const documents = await repository.listDocuments(input.patientId)
  return {
    documents: documents.map(({ id, value }) => ({
      id,
      name: value.file?.originalFileName || value.title || 'Documento',
      type:
        value.file?.detectedMimeType ||
        value.file?.declaredMimeType ||
        'application/octet-stream',
      size: value.file?.size ?? 0,
      status: value.status,
      scanStatus: value.file?.scanStatus || 'pending',
      available: value.status === 'available' && value.file?.scanStatus === 'clean',
      createdAt:
        typeof value.createdAt?.toDate === 'function'
          ? value.createdAt.toDate().toISOString()
          : value.createdAt || null,
    })),
  }
}
