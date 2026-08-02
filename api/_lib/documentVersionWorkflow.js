import { createHash } from 'node:crypto'
import {
  assertCategoryFile,
  assertDeclaredFile,
  DOCUMENT_CATEGORY_CONFIG,
  UPLOAD_TTL_MS,
} from '../../src/config/documentStorage.js'
import {
  documentVersionSchema,
  parseApplyLegalHold,
  parseCreateDocumentVersion,
  parseDocumentVersionQuery,
  parseEvaluateRetention,
  parseFinalizeDocumentVersion,
  parseRemoveLegalHold,
  parseRequestDocumentVersionUpload,
  parseRestoreDocumentVersion,
  parseVerifyDocumentIntegrity,
  retentionPolicySchema,
} from '../../src/schemas/documentVersion.schema.js'
import { inspectFile, sha256 } from './fileInspection.js'
import { validateClinicalLinks, validateRequiredConsent } from './clinicalAttachmentWorkflow.js'

const versionError = (code, message) => Object.assign(new Error(message), { code })
const fingerprint = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const documentPath = (input) => `patients/${input.patientId}/documents/${input.documentId}`
const versionPath = (input) => `${documentPath(input)}/versions/${input.versionId}`
const operationPath = (input) => `documentVersionOperations/${input.requestId}`

function assertOwner(patient, uid) {
  if (!patient) throw versionError('NOT_FOUND', 'Paciente não encontrado.')
  if (patient.userId !== uid) throw versionError('FORBIDDEN', 'Acesso não autorizado.')
}

function replay(operation, kind, input) {
  if (!operation) return null
  if (operation.kind !== kind || operation.fingerprint !== fingerprint(input)) {
    throw versionError('CONFLICT', 'requestId reutilizado com outro payload.')
  }
  return operation.result
}

function audit(transaction, repository, { uid, input, versionId = null, action, status, details = {} }) {
  transaction.create(`auditLogs/${repository.createId('auditLogs')}`, {
    schemaVersion: 1, actorId: uid, patientId: input.patientId,
    documentId: input.documentId, versionId, requestId: input.requestId,
    action, status, details, occurredAt: repository.timestamp(), source: 'backend',
  })
}

async function assertDocumentContext({ uid, input, repository, allowArchived = false }) {
  const [patient, document] = await Promise.all([
    repository.read(`patients/${input.patientId}`), repository.read(documentPath(input)),
  ])
  assertOwner(patient, uid)
  if (!document || document.ownerId !== uid) throw versionError('NOT_FOUND', 'Documento não encontrado.')
  if (!allowArchived && document.status === 'archived') {
    throw versionError('CONFLICT', 'Documento arquivado não aceita novas versões.')
  }
  if (document.schemaVersion === 2) {
    await validateClinicalLinks({
      uid, patientId: input.patientId, clinicalContext: document.clinicalContext, repository,
    })
    const consent = await validateRequiredConsent({
      patientId: input.patientId, category: document.category, repository,
    })
    if (consent.validationResult === 'denied') {
      throw versionError('CONSENT_REQUIRED', 'Consentimento obrigatório inválido ou revogado.')
    }
  }
  return { patient, document }
}

function normalizeVersion(document, id, value, fallbackNumber) {
  if (value.versionNumber) return { id, ...value, legacy: false }
  return {
    id, schemaVersion: value.schemaVersion || 1, documentId: document.id,
    patientId: document.patientId || null, ownerId: document.ownerId || null,
    versionId: id, versionNumber: fallbackNumber, previousVersionId: null,
    supersedesVersionId: null, changeReason: 'Versão técnica anterior à Etapa 6C',
    duplicateJustification: null,
    status: id === document.currentVersionId ? 'current' : 'superseded',
    fileMetadata: value.fileMetadata || (value.storagePath ? {
      uploadId: null,
      originalFileName: document.file?.originalFileName || document.title || 'documento',
      randomFileName: document.file?.randomFileName || 'legacy-file.bin',
      storagePath: value.storagePath,
      declaredMimeType: document.file?.declaredMimeType || value.detectedMimeType || 'application/octet-stream',
      detectedMimeType: value.detectedMimeType || document.file?.detectedMimeType || 'application/octet-stream',
      extension: document.file?.extension || 'bin', size: value.size || document.file?.size || 0,
      sha256: value.sha256 || document.file?.sha256 || null,
    } : null),
    securityScan: null, integrity: null, integrityStatus: 'unavailable',
    duplicate: { detected: false, scope: null, matchingDocumentId: null, matchingVersionId: null },
    createdBy: value.createdBy || document.createdBy || document.ownerId || null,
    createdAt: value.createdAt || document.createdAt || null,
    activatedAt: null, supersededAt: null, legacy: true,
  }
}

function sanitizeVersion(version) {
  return {
    id: version.id, schemaVersion: version.schemaVersion, legacy: version.legacy === true,
    versionNumber: version.versionNumber, previousVersionId: version.previousVersionId || null,
    supersedesVersionId: version.supersedesVersionId || null,
    changeReason: version.changeReason, status: version.status,
    integrityStatus: version.integrityStatus,
    duplicate: version.duplicate,
    fileMetadata: version.fileMetadata ? {
      originalFileName: version.fileMetadata.originalFileName,
      declaredMimeType: version.fileMetadata.declaredMimeType,
      detectedMimeType: version.fileMetadata.detectedMimeType,
      size: version.fileMetadata.size,
      sha256: version.fileMetadata.sha256,
    } : null,
    securityScan: version.securityScan ? {
      status: version.securityScan.status, scannedAt: version.securityScan.scannedAt,
    } : null,
    createdBy: version.createdBy, createdAt: version.createdAt,
    activatedAt: version.activatedAt, supersededAt: version.supersededAt,
  }
}

export async function createDocumentVersion({ uid, payload, repository }) {
  const input = parseCreateDocumentVersion(payload)
  await assertDocumentContext({ uid, input, repository })
  const opPath = operationPath(input)
  const existing = await repository.read(opPath)
  const prior = replay(existing, 'create_version', input)
  if (prior) return { ...prior, replayed: true }
  const versionId = repository.createId(`${documentPath(input)}/versions`)
  const result = await repository.runTransaction(async (transaction) => {
    const [latest, operation] = await transaction.readMany([documentPath(input), opPath])
    const previous = replay(operation, 'create_version', input)
    if (previous) return { ...previous, replayed: true }
    if (!latest || latest.ownerId !== uid || latest.status === 'archived') {
      throw versionError('CONFLICT', 'Documento indisponível para nova versão.')
    }
    const baseTotal = Number.isInteger(latest.totalVersions)
      ? latest.totalVersions : latest.currentVersionId ? 1 : 0
    const versionNumber = baseTotal + 1
    const timestamp = repository.timestamp()
    const version = documentVersionSchema.parse({
      schemaVersion: 2, documentId: input.documentId, patientId: input.patientId,
      ownerId: uid, versionId, versionNumber,
      previousVersionId: latest.currentVersionId || null, supersedesVersionId: null,
      changeReason: input.changeReason, duplicateJustification: input.duplicateJustification,
      status: 'draft', uploadRequest: null, fileMetadata: null, securityScan: null,
      integrity: null, integrityStatus: 'pending',
      duplicate: { detected: false, scope: null, matchingDocumentId: null, matchingVersionId: null },
      createdBy: uid, createdAt: timestamp, activatedAt: null, supersededAt: null,
    })
    transaction.create(`${documentPath(input)}/versions/${versionId}`, version)
    transaction.update(documentPath(input), {
      totalVersions: versionNumber, lastVersionCreatedAt: timestamp,
      currentVersionNumber: latest.currentVersionNumber || (latest.currentVersionId ? 1 : null),
      retentionPolicyId: latest.retentionPolicyId || null,
      retentionStatus: latest.retentionStatus || 'not_applicable', updatedAt: timestamp,
    })
    const operationResult = { documentId: input.documentId, versionId, versionNumber, status: 'draft' }
    audit(transaction, repository, {
      uid, input, versionId, action: 'document_version_created', status: 'draft',
      details: { versionNumber, previousVersionId: latest.currentVersionId || null },
    })
    transaction.create(opPath, {
      kind: 'create_version', fingerprint: fingerprint(input), result: operationResult,
      createdAt: timestamp,
    })
    return { ...operationResult, replayed: false }
  })
  return result
}

export async function requestDocumentVersionUpload({ uid, payload, repository, now = new Date() }) {
  const input = parseRequestDocumentVersionUpload(payload)
  const { document } = await assertDocumentContext({ uid, input, repository })
  const existing = await repository.read(operationPath(input))
  const prior = replay(existing, 'request_version_upload', input)
  if (prior) return { ...prior, replayed: true }
  const { extension } = assertDeclaredFile({
    fileName: input.originalFileName, declaredMimeType: input.declaredMimeType, size: input.size,
  })
  if (DOCUMENT_CATEGORY_CONFIG[document.category]) {
    assertCategoryFile({ category: document.category, declaredMimeType: input.declaredMimeType, size: input.size })
  }
  const uploadId = repository.createId('documentVersionUploads')
  const randomFileName = repository.randomName(extension)
  const storagePath = `users/${uid}/patients/${input.patientId}/documents/${input.documentId}` +
    `/versions/${input.versionId}/quarantine/${uploadId}/${randomFileName}`
  const expiresAt = new Date(now.getTime() + UPLOAD_TTL_MS)
  const authorization = await repository.authorizeUpload({
    storagePath, declaredMimeType: input.declaredMimeType, expiresAt,
  })
  const result = {
    documentId: input.documentId, versionId: input.versionId, uploadId,
    uploadUrl: authorization.url, expiresAt: expiresAt.toISOString(),
    requiredHeaders: authorization.requiredHeaders,
  }
  return repository.runTransaction(async (transaction) => {
    const [version, operation] = await transaction.readMany([versionPath(input), operationPath(input)])
    const previous = replay(operation, 'request_version_upload', input)
    if (previous) return { ...previous, replayed: true }
    if (!version || version.ownerId !== uid || version.status !== 'draft') {
      throw versionError('CONFLICT', 'Versão não está em rascunho.')
    }
    transaction.update(versionPath(input), {
      status: 'pending_upload',
      uploadRequest: {
        uploadId, originalFileName: input.originalFileName, randomFileName, storagePath,
        declaredMimeType: input.declaredMimeType, extension, size: input.size,
        requestId: input.requestId,
      },
    })
    audit(transaction, repository, {
      uid, input, versionId: input.versionId,
      action: 'document_version_upload_requested', status: 'pending_upload',
    })
    transaction.create(operationPath(input), {
      kind: 'request_version_upload', fingerprint: fingerprint(input), result,
      createdAt: repository.timestamp(),
    })
    return { ...result, replayed: false }
  })
}

function normalizedScan(scan, fileSha) {
  if (!['clean', 'infected', 'failed'].includes(scan?.status)) {
    return { status: 'failed', provider: 'scanner', engineVersion: null,
      threatName: null, resultCode: 'INVALID_RESULT', scannedAt: new Date().toISOString(), sha256: fileSha }
  }
  return {
    status: scan.status, provider: scan.provider || 'scanner', engineVersion: scan.engineVersion || null,
    threatName: scan.threatName || null, resultCode: scan.resultCode || null,
    scannedAt: scan.scannedAt || new Date().toISOString(), sha256: scan.sha256 || fileSha,
  }
}

export async function finalizeDocumentVersion({ uid, payload, repository, scanner, integrityService }) {
  const input = parseFinalizeDocumentVersion(payload)
  await assertDocumentContext({ uid, input, repository })
  const [version, existingOperation] = await Promise.all([
    repository.read(versionPath(input)), repository.read(operationPath(input)),
  ])
  const previous = replay(existingOperation, 'finalize_version', input)
  if (previous) return { ...previous, replayed: true }
  if (!version || version.ownerId !== uid ||
      !['pending_upload', 'uploaded_to_quarantine', 'scanning'].includes(version.status) ||
      version.uploadRequest?.uploadId !== input.uploadId) {
    throw versionError('CONFLICT', 'Versão não está aguardando este upload.')
  }
  const object = await repository.inspectObject(version.uploadRequest.storagePath)
  if (!object) throw versionError('NOT_FOUND', 'Arquivo de quarentena não encontrado.')
  let inspection
  try {
    inspection = inspectFile({
      buffer: object.buffer, originalFileName: version.uploadRequest.originalFileName,
      declaredMimeType: version.uploadRequest.declaredMimeType, declaredSize: version.uploadRequest.size,
    })
  } catch {
    inspection = null
  }
  await repository.runTransaction(async (transaction) => {
    const [latest, operation] = await transaction.readMany([versionPath(input), operationPath(input)])
    const replayed = replay(operation, 'finalize_version', input)
    if (replayed) return replayed
    if (!latest || !['pending_upload', 'uploaded_to_quarantine', 'scanning'].includes(latest.status)) {
      throw versionError('CONFLICT', 'Versão já processada.')
    }
    if (latest.status === 'pending_upload') {
      transaction.update(versionPath(input), { status: 'uploaded_to_quarantine' })
      audit(transaction, repository, { uid, input, versionId: input.versionId,
        action: 'document_version_uploaded_to_quarantine', status: 'uploaded_to_quarantine' })
    }
    return null
  })
  await repository.runTransaction(async (transaction) => {
    const [latest, operation] = await transaction.readMany([versionPath(input), operationPath(input)])
    const replayed = replay(operation, 'finalize_version', input)
    if (replayed) return replayed
    if (!latest || !['uploaded_to_quarantine', 'scanning'].includes(latest.status)) {
      throw versionError('CONFLICT', 'Versão não está na quarentena.')
    }
    if (latest.status === 'uploaded_to_quarantine') {
      transaction.update(versionPath(input), { status: 'scanning' })
      audit(transaction, repository, { uid, input, versionId: input.versionId,
        action: 'document_version_scan_started', status: 'scanning' })
    }
    return null
  })
  let scan = inspection ? null : normalizedScan({ status: 'failed', resultCode: 'FILE_VALIDATION_ERROR' }, '0'.repeat(64))
  if (inspection) {
    try {
      scan = normalizedScan(await scanner.scan({
        filePath: version.uploadRequest.storagePath,
        storagePath: version.uploadRequest.storagePath, sha256: inspection.sha256,
        size: inspection.size, detectedMimeType: inspection.detectedMimeType,
        requestId: `${input.requestId}-scan`,
      }), inspection.sha256)
    } catch {
      scan = normalizedScan({ status: 'failed', resultCode: 'SCAN_ERROR' }, inspection.sha256)
    }
  }
  let targetPath = null
  if (scan.status === 'clean') {
    targetPath = `users/${uid}/patients/${input.patientId}/documents/${input.documentId}` +
      `/versions/${input.versionId}/available/${version.uploadRequest.randomFileName}`
    try {
      const promoted = await repository.promote({ sourcePath: version.uploadRequest.storagePath, targetPath })
      if (sha256(promoted) !== inspection.sha256) throw new Error('hash_mismatch')
      await repository.remove(version.uploadRequest.storagePath)
    } catch {
      targetPath = null
      scan = normalizedScan({ status: 'failed', resultCode: 'PROMOTION_ERROR' }, inspection.sha256)
    }
  }
  if (scan.status !== 'clean') {
    const status = scan.status === 'infected' ? 'blocked' : 'scan_failed'
    const result = { documentId: input.documentId, versionId: input.versionId, status, available: false }
    return repository.runTransaction(async (transaction) => {
      const [latest, operation] = await transaction.readMany([versionPath(input), operationPath(input)])
      const replayed = replay(operation, 'finalize_version', input)
      if (replayed) return { ...replayed, replayed: true }
      if (!latest || latest.status !== 'scanning') throw versionError('CONFLICT', 'Versão já processada.')
      transaction.update(versionPath(input), {
        status, securityScan: { provider: scan.provider, engineVersion: scan.engineVersion,
          status: scan.status, scannedAt: scan.scannedAt, threatName: scan.threatName,
          resultCode: scan.resultCode }, integrityStatus: 'unavailable',
      })
      audit(transaction, repository, { uid, input, versionId: input.versionId,
        action: 'document_version_scan_failed', status })
      transaction.create(operationPath(input), { kind: 'finalize_version', fingerprint: fingerprint(input),
        result, createdAt: repository.timestamp() })
      return { ...result, replayed: false }
    })
  }
  const candidates = await repository.listPatientVersions(input.patientId)
  const duplicateMatch = candidates.find((candidate) => {
    if (candidate.id === input.versionId && candidate.documentId === input.documentId) return false
    return (candidate.value.fileMetadata?.sha256 || candidate.value.sha256) === inspection.sha256
  }) || null
  const fileMetadata = {
    uploadId: input.uploadId, originalFileName: version.uploadRequest.originalFileName,
    randomFileName: version.uploadRequest.randomFileName, storagePath: targetPath,
    declaredMimeType: version.uploadRequest.declaredMimeType,
    detectedMimeType: inspection.detectedMimeType, extension: version.uploadRequest.extension,
    size: inspection.size, sha256: inspection.sha256,
  }
  const securityScan = {
    provider: scan.provider, engineVersion: scan.engineVersion, status: 'clean',
    scannedAt: scan.scannedAt, threatName: null, resultCode: scan.resultCode,
  }
  const duplicate = {
    detected: Boolean(duplicateMatch),
    scope: duplicateMatch ? (duplicateMatch.documentId === input.documentId ? 'same_document' : 'patient_document') : null,
    matchingDocumentId: duplicateMatch?.documentId || null, matchingVersionId: duplicateMatch?.id || null,
  }
  const signable = { ...version, fileMetadata, securityScan, duplicate, status: 'current' }
  const signedAt = repository.timestamp()
  const integrity = integrityService.sign(signable, { signedAt, signedBy: uid })
  const result = {
    documentId: input.documentId, versionId: input.versionId,
    versionNumber: version.versionNumber, status: 'current', available: true, duplicate,
  }
  return repository.runTransaction(async (transaction) => {
    const paths = [documentPath(input), versionPath(input), operationPath(input)]
    const [latestDocument, latestVersion, operation] = await transaction.readMany(paths)
    const replayed = replay(operation, 'finalize_version', input)
    if (replayed) return { ...replayed, replayed: true }
    if (!latestDocument || latestDocument.ownerId !== uid || !latestVersion || latestVersion.status !== 'scanning') {
      throw versionError('CONFLICT', 'Versão já processada ou documento alterado.')
    }
    const timestamp = repository.timestamp()
    if (latestDocument.currentVersionId && latestDocument.currentVersionId !== input.versionId) {
      transaction.update(`${documentPath(input)}/versions/${latestDocument.currentVersionId}`, {
        status: 'superseded', supersededAt: timestamp,
      })
    }
    transaction.update(versionPath(input), {
      status: 'current', fileMetadata, securityScan, integrity, integrityStatus: 'valid',
      duplicate, activatedAt: timestamp,
    })
    transaction.update(documentPath(input), {
      status: 'available', currentVersionId: input.versionId,
      currentVersionNumber: latestVersion.versionNumber,
      lastVersionCreatedAt: latestVersion.createdAt || timestamp,
      integrityBlocked: false, updatedAt: timestamp,
      file: {
        schemaVersion: 2, uploadId: input.uploadId, documentId: input.documentId,
        originalFileName: fileMetadata.originalFileName, randomFileName: fileMetadata.randomFileName,
        storagePath: fileMetadata.storagePath, declaredMimeType: fileMetadata.declaredMimeType,
        detectedMimeType: fileMetadata.detectedMimeType, extension: fileMetadata.extension,
        size: fileMetadata.size, sha256: fileMetadata.sha256, uploadedBy: uid,
        uploadedAt: timestamp, status: 'available', requestId: input.requestId, scanStatus: 'clean',
      },
    })
    audit(transaction, repository, { uid, input, versionId: input.versionId,
      action: 'document_version_activated', status: 'current', details: { duplicate } })
    transaction.create(operationPath(input), { kind: 'finalize_version', fingerprint: fingerprint(input),
      result, createdAt: timestamp })
    return { ...result, replayed: false }
  })
}

export async function listDocumentVersions({ uid, payload, repository }) {
  const input = parseDocumentVersionQuery(payload)
  const { document } = await assertDocumentContext({ uid, input, repository, allowArchived: true })
  const records = await repository.listVersions(input.patientId, input.documentId)
  const base = records.length ? records : document.file ? [{ id: document.currentVersionId || 'legacy', value: {} }] : []
  const versions = base.map((item, index) => normalizeVersion(
    { id: input.documentId, ...document }, item.id, item.value, index + 1,
  )).sort((a, b) => b.versionNumber - a.versionNumber).map(sanitizeVersion)
  return { documentId: input.documentId, currentVersionId: document.currentVersionId || null, versions }
}

export async function getDocumentVersion({ uid, payload, repository }) {
  const input = parseDocumentVersionQuery(payload)
  if (!input.versionId) throw versionError('INVALID_REQUEST', 'versionId obrigatório.')
  const result = await listDocumentVersions({ uid, payload: input, repository })
  const version = result.versions.find((item) => item.id === input.versionId)
  if (!version) throw versionError('NOT_FOUND', 'Versão não encontrada.')
  return { version }
}

async function verifyStoredVersion({ input, repository, integrityService }) {
  const version = await repository.read(versionPath(input))
  if (!version?.fileMetadata?.storagePath || !version.integrity) {
    return { valid: false, reason: 'legacy_or_incomplete_version', version }
  }
  const signature = integrityService.verify(version)
  const object = await repository.inspectObject(version.fileMetadata.storagePath)
  const fileValid = Boolean(object) && sha256(object.buffer) === version.fileMetadata.sha256
  return { valid: signature.valid && fileValid, reason: !signature.valid ? signature.reason : fileValid ? null : 'file_hash_mismatch', version }
}

export async function verifyDocumentIntegrity({ uid, payload, repository, integrityService }) {
  const input = parseVerifyDocumentIntegrity(payload)
  await assertDocumentContext({ uid, input, repository, allowArchived: true })
  const stored = await repository.read(operationPath(input))
  const prior = replay(stored, 'verify_integrity', input)
  if (prior) return { ...prior, replayed: true }
  const verification = await verifyStoredVersion({ input, repository, integrityService })
  const result = { documentId: input.documentId, versionId: input.versionId,
    valid: verification.valid, reason: verification.reason }
  return repository.runTransaction(async (transaction) => {
    const [document, operation] = await transaction.readMany([documentPath(input), operationPath(input)])
    const previous = replay(operation, 'verify_integrity', input)
    if (previous) return { ...previous, replayed: true }
    const timestamp = repository.timestamp()
    transaction.create(`${versionPath(input)}/integrityChecks/${repository.createId('integrityChecks')}`, {
      schemaVersion: 1, valid: verification.valid, reason: verification.reason,
      checkedBy: uid, checkedAt: timestamp, requestId: input.requestId,
    })
    if (!verification.valid) {
      transaction.update(versionPath(input), { status: 'compromised', integrityStatus: 'invalid' })
      if (document.currentVersionId === input.versionId) {
        transaction.update(documentPath(input), { integrityBlocked: true, updatedAt: timestamp })
      }
    }
    audit(transaction, repository, { uid, input, versionId: input.versionId,
      action: 'document_integrity_verified', status: verification.valid ? 'valid' : 'invalid',
      details: { reason: verification.reason } })
    transaction.create(operationPath(input), { kind: 'verify_integrity', fingerprint: fingerprint(input),
      result, createdAt: timestamp })
    return { ...result, replayed: false }
  })
}

export async function restoreDocumentVersion({ uid, payload, repository, integrityService }) {
  const input = parseRestoreDocumentVersion(payload)
  const { document } = await assertDocumentContext({ uid, input, repository })
  if (document.legalHold) throw versionError('LEGAL_HOLD', 'Documento sob legal hold não pode ser restaurado.')
  const stored = await repository.read(operationPath(input))
  const prior = replay(stored, 'restore_version', input)
  if (prior) return { ...prior, replayed: true }
  if (document.currentVersionId === input.versionId) throw versionError('CONFLICT', 'A versão já é a atual.')
  const verification = await verifyStoredVersion({ input, repository, integrityService })
  if (!verification.valid) throw versionError('INTEGRITY_FAILED', 'Versão sem integridade válida não pode ser restaurada.')
  const source = verification.version
  if (source.securityScan?.status !== 'clean') throw versionError('FILE_BLOCKED', 'Versão não está limpa.')
  const restoredVersionId = repository.createId(`${documentPath(input)}/versions`)
  const result = await repository.runTransaction(async (transaction) => {
    const [latestDocument, target, operation] = await transaction.readMany([
      documentPath(input), versionPath(input), operationPath(input),
    ])
    const previous = replay(operation, 'restore_version', input)
    if (previous) return { ...previous, replayed: true }
    if (!latestDocument || latestDocument.currentVersionId === input.versionId || !target) {
      throw versionError('CONFLICT', 'Estado do documento mudou durante a restauração.')
    }
    const timestamp = repository.timestamp()
    const versionNumber = (latestDocument.totalVersions || latestDocument.currentVersionNumber || 1) + 1
    const restored = {
      ...target, versionId: restoredVersionId, versionNumber,
      previousVersionId: latestDocument.currentVersionId || null,
      supersedesVersionId: input.versionId, changeReason: input.reason,
      duplicateJustification: 'Restauração explícita de versão íntegra',
      status: 'restored', uploadRequest: null, integrity: null, integrityStatus: 'pending',
      duplicate: { detected: true, scope: 'same_document', matchingDocumentId: input.documentId,
        matchingVersionId: input.versionId }, createdBy: uid, createdAt: timestamp,
      activatedAt: timestamp, supersededAt: null,
    }
    restored.integrity = integrityService.sign(restored, { signedAt: timestamp, signedBy: uid })
    restored.integrityStatus = 'valid'
    restored.status = 'current'
    transaction.update(`${documentPath(input)}/versions/${latestDocument.currentVersionId}`, {
      status: 'superseded', supersededAt: timestamp,
    })
    transaction.create(`${documentPath(input)}/versions/${restoredVersionId}`, restored)
    transaction.update(documentPath(input), {
      currentVersionId: restoredVersionId, currentVersionNumber: versionNumber,
      totalVersions: versionNumber, lastVersionCreatedAt: timestamp, integrityBlocked: false,
      file: {
        schemaVersion: 2, uploadId: target.fileMetadata.uploadId || `restore-${restoredVersionId}`,
        documentId: input.documentId, originalFileName: target.fileMetadata.originalFileName,
        randomFileName: target.fileMetadata.randomFileName, storagePath: target.fileMetadata.storagePath,
        declaredMimeType: target.fileMetadata.declaredMimeType,
        detectedMimeType: target.fileMetadata.detectedMimeType,
        extension: target.fileMetadata.extension, size: target.fileMetadata.size,
        sha256: target.fileMetadata.sha256, uploadedBy: uid, uploadedAt: timestamp,
        status: 'available', requestId: input.requestId, scanStatus: 'clean',
      }, updatedAt: timestamp,
    })
    const operationResult = { documentId: input.documentId, restoredFromVersionId: input.versionId,
      versionId: restoredVersionId, versionNumber, status: 'current' }
    audit(transaction, repository, { uid, input, versionId: restoredVersionId,
      action: 'document_version_restored', status: 'current',
      details: { restoredFromVersionId: input.versionId } })
    transaction.create(operationPath(input), { kind: 'restore_version', fingerprint: fingerprint(input),
      result: operationResult, createdAt: timestamp })
    return { ...operationResult, replayed: false }
  })
  return result
}

async function changeLegalHold({ uid, input, repository, active }) {
  const kind = active ? 'apply_legal_hold' : 'remove_legal_hold'
  await assertDocumentContext({ uid, input, repository, allowArchived: true })
  const result = { documentId: input.documentId, legalHold: active }
  return repository.runTransaction(async (transaction) => {
    const [document, operation] = await transaction.readMany([documentPath(input), operationPath(input)])
    const previous = replay(operation, kind, input)
    if (previous) return { ...previous, replayed: true }
    if (!document || document.ownerId !== uid) throw versionError('NOT_FOUND', 'Documento não encontrado.')
    if (Boolean(document.legalHold) === active) throw versionError('CONFLICT', active ? 'Legal hold já aplicado.' : 'Documento não possui legal hold.')
    const timestamp = repository.timestamp()
    transaction.update(documentPath(input), {
      legalHold: active, legalHoldReason: active ? input.reason : null,
      legalHoldAt: active ? timestamp : null, legalHoldBy: active ? uid : null,
      retentionStatus: active ? 'legal_hold' : (document.retentionPolicyId ? 'active' : 'not_applicable'),
      updatedAt: timestamp,
    })
    audit(transaction, repository, { uid, input, action: active ? 'document_legal_hold_applied' : 'document_legal_hold_removed',
      status: active ? 'legal_hold' : 'released', details: { reason: input.reason } })
    transaction.create(operationPath(input), { kind, fingerprint: fingerprint(input), result,
      createdAt: timestamp })
    return { ...result, replayed: false }
  })
}

export const applyDocumentLegalHold = ({ uid, payload, repository }) =>
  changeLegalHold({ uid, input: parseApplyLegalHold(payload), repository, active: true })
export const removeDocumentLegalHold = ({ uid, payload, repository }) =>
  changeLegalHold({ uid, input: parseRemoveLegalHold(payload), repository, active: false })

function asDate(value) {
  if (!value) return null
  if (typeof value.toDate === 'function') return value.toDate()
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export async function evaluateDocumentRetention({ uid, payload, repository }) {
  const input = parseEvaluateRetention(payload)
  const { document } = await assertDocumentContext({ uid, input, repository, allowArchived: true })
  if (document.legalHold) return { documentId: input.documentId, status: 'legal_hold', automaticDisposal: false }
  if (!document.retentionPolicyId) return { documentId: input.documentId, status: 'not_applicable', automaticDisposal: false }
  const policyValue = await repository.readRetentionPolicy(document.retentionPolicyId)
  if (!policyValue) throw versionError('NOT_FOUND', 'Política de retenção não encontrada.')
  const policy = retentionPolicySchema.parse({ id: document.retentionPolicyId, ...policyValue })
  if (!policy.active) return { documentId: input.documentId, status: 'not_applicable', automaticDisposal: false }
  const start = asDate(document.createdAt)
  if (!start) throw versionError('CONFLICT', 'Data inicial de retenção indisponível.')
  const retentionUntil = new Date(start.getTime() + policy.durationDays * 86400000)
  const reviewAt = new Date(retentionUntil.getTime() - policy.reviewBeforeDays * 86400000)
  const asOf = input.asOf ? new Date(input.asOf) : new Date()
  const status = asOf >= retentionUntil ? 'expired' : asOf >= reviewAt ? 'review_due' : 'active'
  const result = { documentId: input.documentId, policyId: document.retentionPolicyId,
    status, retentionUntil: retentionUntil.toISOString(), reviewAt: reviewAt.toISOString(),
    automaticDisposal: false }
  return repository.runTransaction(async (transaction) => {
    const [operation] = await transaction.readMany([operationPath(input)])
    const previous = replay(operation, 'evaluate_retention', input)
    if (previous) return { ...previous, replayed: true }
    transaction.update(documentPath(input), { retentionStatus: status,
      retentionUntil: result.retentionUntil, retentionReviewAt: result.reviewAt,
      updatedAt: repository.timestamp() })
    audit(transaction, repository, { uid, input, action: 'document_retention_evaluated', status,
      details: { policyId: document.retentionPolicyId, automaticDisposal: false } })
    transaction.create(operationPath(input), { kind: 'evaluate_retention', fingerprint: fingerprint(input),
      result, createdAt: repository.timestamp() })
    return { ...result, replayed: false }
  })
}
