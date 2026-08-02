import { createHash } from 'node:crypto'
import {
  assertCategoryFile,
  DOCUMENT_CATEGORY_CONFIG,
} from '../../src/config/documentStorage.js'
import {
  clinicalAttachmentSchema,
  parseArchiveClinicalAttachment,
  parseCreateClinicalAttachment,
  parseDownloadClinicalAttachment,
  parseFinalizeClinicalAttachment,
  parseGetClinicalAttachment,
  parseLinkClinicalAttachment,
  parseListClinicalAttachments,
  parseRequestClinicalAttachmentUpload,
} from '../../src/schemas/clinicalAttachment.schema.js'
import {
  finalizeDocumentUpload,
  requestDocumentDownload,
  requestDocumentUpload,
} from './documentStorageWorkflow.js'

const attachmentError = (code, message) => Object.assign(new Error(message), { code })
const fingerprint = (value) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex')

function assertOwner(patient, uid) {
  if (!patient) throw attachmentError('NOT_FOUND', 'Paciente não encontrado.')
  if (patient.userId !== uid) throw attachmentError('FORBIDDEN', 'Acesso não autorizado.')
}

function replay(operation, kind, input) {
  if (!operation) return null
  if (operation.kind !== kind || operation.fingerprint !== fingerprint(input)) {
    throw attachmentError('CONFLICT', 'requestId reutilizado com outro payload.')
  }
  return operation.result
}

function auditValue(repository, { uid, input, documentId, action, status, targetId = null }) {
  return {
    schemaVersion: 1,
    actorId: uid,
    patientId: input.patientId,
    documentId,
    requestId: input.requestId,
    action,
    status,
    targetId,
    occurredAt: repository.timestamp(),
    source: 'backend',
  }
}

function createAudit(transaction, repository, details) {
  transaction.create(
    `auditLogs/${repository.createId('auditLogs')}`,
    auditValue(repository, details),
  )
}

async function consentContext(repository, patientId, category) {
  const requiredConsentType = DOCUMENT_CATEGORY_CONFIG[category]?.requiredConsentType || null
  if (!requiredConsentType) {
    return {
      requiredConsentType: null,
      consentId: null,
      consentVersion: null,
      validatedAt: repository.timestamp(),
      validationResult: 'not_required',
    }
  }
  const matching = (await repository.listConsents(patientId))
    .filter((item) => item.consentType === requiredConsentType)
    .sort((a, b) => Number(b.version?.number || 0) - Number(a.version?.number || 0))
  const current = matching.find((item) => item.active === true && item.revoked !== true) || null
  const historical = current || matching[0] || null
  return {
    requiredConsentType,
    consentId: historical?.id || null,
    consentVersion: historical?.version?.number || null,
    validatedAt: repository.timestamp(),
    validationResult: current ? 'valid' : 'denied',
  }
}

async function recordConsentDenied(repository, { uid, input, documentId = null }) {
  await repository.recordAudit(auditValue(repository, {
    uid,
    input,
    documentId,
    action: 'clinical_attachment_consent_denied',
    status: 'denied',
  }))
}

export async function validateClinicalLinks({ uid, patientId, clinicalContext, repository }) {
  const context = {
    evolutionId: clinicalContext?.evolutionId || null,
    appointmentId: clinicalContext?.appointmentId || null,
    homeCareVisitId: clinicalContext?.homeCareVisitId || null,
    relatedProfessionalId: clinicalContext?.relatedProfessionalId || uid,
  }
  if (context.relatedProfessionalId !== uid) {
    throw attachmentError('INVALID_LINK', 'Profissional relacionado não autorizado.')
  }
  let appointment = null
  if (context.evolutionId) {
    const evolution = await repository.read(
      `patients/${patientId}/evolutions/${context.evolutionId}`,
    )
    if (!evolution || (evolution.patientId && evolution.patientId !== patientId)) {
      throw attachmentError('INVALID_LINK', 'Evolução não pertence ao paciente.')
    }
  }
  if (context.appointmentId) {
    appointment = await repository.read(`schedules/${context.appointmentId}`)
    if (!appointment || appointment.patientId !== patientId || appointment.userId !== uid) {
      throw attachmentError('INVALID_LINK', 'Agendamento não pertence ao paciente e usuário.')
    }
  }
  if (context.homeCareVisitId) {
    if (!appointment || context.homeCareVisitId !== 'current') {
      throw attachmentError('INVALID_LINK', 'Vínculo de Home Care inválido.')
    }
    const visit = await repository.read(
      `schedules/${context.appointmentId}/homeCareVisit/current`,
    )
    if (
      !visit || visit.patientId !== patientId || visit.appointmentId !== context.appointmentId ||
      visit.userId !== uid
    ) {
      throw attachmentError('INVALID_LINK', 'Atendimento domiciliar não pertence ao vínculo informado.')
    }
  }
  return context
}

export async function validateRequiredConsent({ patientId, category, repository }) {
  return consentContext(repository, patientId, category)
}

export async function createAttachmentDraft({ uid, payload, repository }) {
  const input = parseCreateClinicalAttachment(payload)
  const operationPath = `clinicalAttachmentOperations/${input.requestId}`
  const [patient, operation] = await Promise.all([
    repository.read(`patients/${input.patientId}`),
    repository.read(operationPath),
  ])
  assertOwner(patient, uid)
  const previous = replay(operation, 'create_draft', input)
  if (previous) return { ...previous, replayed: true }
  const clinicalContext = await validateClinicalLinks({
    uid, patientId: input.patientId, clinicalContext: input.clinicalContext, repository,
  })
  const validatedConsent = await consentContext(repository, input.patientId, input.category)
  if (validatedConsent.validationResult === 'denied') {
    await recordConsentDenied(repository, { uid, input })
    throw attachmentError('CONSENT_REQUIRED', 'Consentimento específico obrigatório não encontrado.')
  }
  const documentId = repository.createId(`patients/${input.patientId}/documents`)
  const documentPath = `patients/${input.patientId}/documents/${documentId}`
  const config = DOCUMENT_CATEGORY_CONFIG[input.category]
  const result = { documentId, status: 'draft', consentContext: validatedConsent }
  return repository.runTransaction(async (transaction) => {
    const [latestPatient, latestOperation] = await transaction.readMany([
      `patients/${input.patientId}`, operationPath,
    ])
    assertOwner(latestPatient, uid)
    const replayed = replay(latestOperation, 'create_draft', input)
    if (replayed) return { ...replayed, replayed: true }
    const timestamp = repository.timestamp()
    const document = clinicalAttachmentSchema.parse({
      schemaVersion: 2,
      patientId: input.patientId,
      ownerId: uid,
      organizationId: latestPatient.organizationId || uid,
      category: input.category,
      title: input.title,
      description: input.description,
      documentDate: input.documentDate,
      clinicalContext,
      consentContext: validatedConsent,
      status: 'draft',
      sensitivityLevel: config.defaultSensitivityLevel,
      accessLevel: config.defaultAccessLevel,
      currentVersionId: null,
      currentVersionNumber: null,
      totalVersions: 0,
      lastVersionCreatedAt: null,
      retentionPolicyId: null,
      retentionStatus: 'not_applicable',
      retentionUntil: null,
      retentionReviewAt: null,
      legalHold: false,
      legalHoldReason: null,
      legalHoldAt: null,
      legalHoldBy: null,
      integrityBlocked: false,
      file: null,
      attachmentFinalizedAt: null,
      archivedBy: null,
      archivedAt: null,
      archiveReason: null,
      createdBy: uid,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    transaction.create(documentPath, document)
    createAudit(transaction, repository, {
      uid, input, documentId,
      action: 'clinical_attachment_draft_created', status: 'draft',
    })
    transaction.create(operationPath, {
      kind: 'create_draft',
      fingerprint: fingerprint(input),
      result,
      createdAt: timestamp,
    })
    return { ...result, replayed: false }
  })
}

export async function requestAttachmentUpload({ uid, payload, repository }) {
  const input = parseRequestClinicalAttachmentUpload(payload)
  const operationPath = `clinicalAttachmentOperations/${input.requestId}`
  const documentPath = `patients/${input.patientId}/documents/${input.documentId}`
  const [patient, document, operation] = await Promise.all([
    repository.read(`patients/${input.patientId}`),
    repository.read(documentPath),
    repository.read(operationPath),
  ])
  assertOwner(patient, uid)
  const previous = replay(operation, 'request_upload', input)
  if (previous) return { ...previous, replayed: true }
  if (!document || document.ownerId !== uid || document.status !== 'draft') {
    throw attachmentError('CONFLICT', 'Anexo não está em rascunho.')
  }
  assertCategoryFile({
    category: document.category,
    declaredMimeType: input.declaredMimeType,
    size: input.size,
  })
  await validateClinicalLinks({
    uid, patientId: input.patientId, clinicalContext: document.clinicalContext, repository,
  })
  const validatedConsent = await consentContext(repository, input.patientId, document.category)
  if (validatedConsent.validationResult === 'denied') {
    await recordConsentDenied(repository, { uid, input, documentId: input.documentId })
    throw attachmentError('CONSENT_REQUIRED', 'Consentimento específico obrigatório não encontrado.')
  }
  const config = DOCUMENT_CATEGORY_CONFIG[document.category]
  const result = await requestDocumentUpload({
    uid,
    repository,
    clinicalAttachmentMode: true,
    payload: {
      patientId: input.patientId,
      documentId: input.documentId,
      requestId: input.requestId,
      category: document.category,
      title: document.title,
      description: document.description,
      documentDate: document.documentDate,
      clinicalContext: document.clinicalContext,
      consentContext: validatedConsent,
      sensitivityLevel: config.defaultSensitivityLevel,
      accessLevel: config.defaultAccessLevel,
      originalFileName: input.originalFileName,
      declaredMimeType: input.declaredMimeType,
      size: input.size,
    },
  })
  return repository.runTransaction(async (transaction) => {
    const [stored] = await transaction.readMany([operationPath])
    const replayed = replay(stored, 'request_upload', input)
    if (replayed) return { ...replayed, replayed: true }
    createAudit(transaction, repository, {
      uid, input, documentId: input.documentId,
      action: 'clinical_attachment_upload_requested', status: 'pending_upload',
    })
    transaction.create(operationPath, {
      kind: 'request_upload', fingerprint: fingerprint(input), result,
      createdAt: repository.timestamp(),
    })
    return { ...result, replayed: false }
  })
}

function referenceFor(context, patientId, documentId, uid, timestamp) {
  return {
    schemaVersion: 1,
    documentId,
    patientId,
    linkedBy: uid,
    linkedAt: timestamp,
    context,
  }
}

function persistLinks(transaction, repository, { uid, input, document }) {
  const timestamp = repository.timestamp()
  const context = document.clinicalContext || {}
  const reference = referenceFor(context, input.patientId, input.documentId, uid, timestamp)
  if (context.evolutionId) {
    transaction.set(
      `patients/${input.patientId}/evolutions/${context.evolutionId}/attachments/${input.documentId}`,
      reference,
    )
    createAudit(transaction, repository, {
      uid, input, documentId: input.documentId,
      action: 'clinical_attachment_linked_to_evolution', status: 'linked',
      targetId: context.evolutionId,
    })
  }
  if (context.appointmentId) {
    transaction.set(
      `schedules/${context.appointmentId}/attachments/${input.documentId}`,
      reference,
    )
    createAudit(transaction, repository, {
      uid, input, documentId: input.documentId,
      action: 'clinical_attachment_linked_to_appointment', status: 'linked',
      targetId: context.appointmentId,
    })
  }
  if (context.homeCareVisitId) {
    transaction.set(
      `schedules/${context.appointmentId}/homeCareVisit/current/attachments/${input.documentId}`,
      reference,
    )
    createAudit(transaction, repository, {
      uid, input, documentId: input.documentId,
      action: 'clinical_attachment_linked_to_home_care', status: 'linked',
      targetId: context.appointmentId,
    })
  }
}

export async function finalizeAttachment({ uid, payload, repository, scanner, integrityService = null }) {
  const input = parseFinalizeClinicalAttachment(payload)
  const operationPath = `clinicalAttachmentOperations/${input.requestId}`
  const documentPath = `patients/${input.patientId}/documents/${input.documentId}`
  const [patient, document, operation] = await Promise.all([
    repository.read(`patients/${input.patientId}`),
    repository.read(documentPath),
    repository.read(operationPath),
  ])
  assertOwner(patient, uid)
  const previous = replay(operation, 'finalize', input)
  if (previous) return { ...previous, replayed: true }
  if (!document || document.ownerId !== uid) throw attachmentError('NOT_FOUND', 'Anexo não encontrado.')
  await validateClinicalLinks({
    uid, patientId: input.patientId, clinicalContext: document.clinicalContext, repository,
  })
  const validatedConsent = await consentContext(repository, input.patientId, document.category)
  if (validatedConsent.validationResult === 'denied') {
    await repository.runTransaction(async (transaction) => {
      const [latest] = await transaction.readMany([documentPath])
      if (latest && latest.status === 'pending_upload') {
        transaction.update(documentPath, {
          status: 'blocked',
          consentContext: validatedConsent,
          file: { ...latest.file, status: 'blocked', scanStatus: 'failed' },
          updatedAt: repository.timestamp(),
        })
      }
      createAudit(transaction, repository, {
        uid, input, documentId: input.documentId,
        action: 'clinical_attachment_consent_denied', status: 'blocked',
      })
    })
    throw attachmentError('CONSENT_REQUIRED', 'Consentimento foi revogado ou não está mais válido.')
  }
  await repository.runTransaction(async (transaction) => {
    const [latest] = await transaction.readMany([documentPath])
    if (latest) transaction.update(documentPath, {
      consentContext: validatedConsent,
      updatedAt: repository.timestamp(),
    })
  })
  const storageResult = await finalizeDocumentUpload({
    uid, payload: input, repository, scanner, integrityService,
  })
  const result = {
    documentId: input.documentId,
    status: storageResult.status,
    available: storageResult.available,
    finalized: storageResult.available,
  }
  return repository.runTransaction(async (transaction) => {
    const [latest, stored] = await transaction.readMany([documentPath, operationPath])
    const replayed = replay(stored, 'finalize', input)
    if (replayed) return { ...replayed, replayed: true }
    createAudit(transaction, repository, {
      uid, input, documentId: input.documentId,
      action: 'clinical_attachment_uploaded', status: storageResult.status,
    })
    createAudit(transaction, repository, {
      uid, input, documentId: input.documentId,
      action: 'clinical_attachment_scan_completed', status: storageResult.status,
    })
    if (storageResult.available) {
      transaction.update(documentPath, {
        attachmentFinalizedAt: repository.timestamp(),
        updatedAt: repository.timestamp(),
      })
      persistLinks(transaction, repository, { uid, input, document: latest })
      createAudit(transaction, repository, {
        uid, input, documentId: input.documentId,
        action: 'clinical_attachment_finalized', status: 'available',
      })
    }
    transaction.create(operationPath, {
      kind: 'finalize', fingerprint: fingerprint(input), result,
      createdAt: repository.timestamp(),
    })
    return { ...result, replayed: false }
  })
}

function sanitizeAttachment(id, value) {
  if (value.schemaVersion == null) {
    return {
      id,
      schemaVersion: 1,
      legacy: true,
      patientId: value.patientId || null,
      category: 'other',
      title: value.title || value.name || 'Documento legado',
      description: null,
      documentDate: null,
      clinicalContext: {},
      consentContext: null,
      status: 'blocked',
      scanStatus: 'failed',
      available: false,
      fileName: value.name || 'Documento legado',
      mimeType: value.type || 'application/octet-stream',
      size: value.size || 0,
      createdAt: value.createdAt || null,
    }
  }
  if (value.schemaVersion !== 2) {
    throw attachmentError('UNSUPPORTED_SCHEMA', `Versão documental não suportada: ${value.schemaVersion}`)
  }
  return {
    id,
    schemaVersion: 2,
    legacy: false,
    patientId: value.patientId,
    category: DOCUMENT_CATEGORY_CONFIG[value.category] ? value.category : 'other',
    title: value.title,
    description: value.description,
    documentDate: value.documentDate,
    clinicalContext: value.clinicalContext || {},
    consentContext: value.consentContext || null,
    status: value.status,
    scanStatus: value.file?.scanStatus || 'pending',
    available: value.status === 'available' && value.file?.scanStatus === 'clean',
    fileName: value.file?.originalFileName || value.title,
    mimeType: value.file?.detectedMimeType || value.file?.declaredMimeType || null,
    size: value.file?.size || 0,
    createdAt: typeof value.createdAt?.toDate === 'function'
      ? value.createdAt.toDate().toISOString()
      : value.createdAt || null,
    archivedAt: value.archivedAt || null,
    archiveReason: value.archiveReason || null,
    currentVersionId: value.currentVersionId || null,
    currentVersionNumber: value.currentVersionNumber || (value.currentVersionId ? 1 : null),
    totalVersions: value.totalVersions || (value.currentVersionId ? 1 : 0),
    legalHold: value.legalHold === true,
    legalHoldReason: value.legalHoldReason || null,
    retentionStatus: value.retentionStatus || 'not_applicable',
    integrityBlocked: value.integrityBlocked === true,
  }
}

export async function listPatientAttachments({ uid, payload, repository }) {
  const input = parseListClinicalAttachments(payload)
  const patient = await repository.read(`patients/${input.patientId}`)
  assertOwner(patient, uid)
  const records = await repository.listDocuments(input.patientId)
  return {
    attachments: records
      .map(({ id, value }) => sanitizeAttachment(id, value))
      .filter((item) => input.includeArchived || item.status !== 'archived')
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))),
  }
}

export async function getAttachment({ uid, payload, repository }) {
  const input = parseGetClinicalAttachment(payload)
  const [patient, document] = await Promise.all([
    repository.read(`patients/${input.patientId}`),
    repository.read(`patients/${input.patientId}/documents/${input.documentId}`),
  ])
  assertOwner(patient, uid)
  if (!document) throw attachmentError('NOT_FOUND', 'Anexo não encontrado.')
  return { attachment: sanitizeAttachment(input.documentId, document) }
}

export async function linkAttachment({ uid, payload, repository }) {
  const input = parseLinkClinicalAttachment(payload)
  const operationPath = `clinicalAttachmentOperations/${input.requestId}`
  const documentPath = `patients/${input.patientId}/documents/${input.documentId}`
  const [patient, document, operation] = await Promise.all([
    repository.read(`patients/${input.patientId}`),
    repository.read(documentPath),
    repository.read(operationPath),
  ])
  assertOwner(patient, uid)
  const previous = replay(operation, 'link', input)
  if (previous) return { ...previous, replayed: true }
  if (!document || document.status !== 'available' || document.file?.scanStatus !== 'clean') {
    throw attachmentError('CONFLICT', 'Somente anexos disponíveis podem ser vinculados.')
  }
  const config = DOCUMENT_CATEGORY_CONFIG[document.category]
  if (!config.allowedClinicalLinks.includes(input.linkType)) {
    throw attachmentError('INVALID_LINK', 'Vínculo não permitido para a categoria.')
  }
  const field = {
    evolution: 'evolutionId', appointment: 'appointmentId', home_care: 'homeCareVisitId',
  }[input.linkType]
  const alreadyLinked = input.linkType === 'home_care'
    ? document.clinicalContext?.homeCareVisitId === 'current' &&
      document.clinicalContext?.appointmentId === input.targetId
    : document.clinicalContext?.[field] === input.targetId
  if (alreadyLinked) {
    const result = {
      documentId: input.documentId,
      linkType: input.linkType,
      targetId: input.targetId,
      alreadyLinked: true,
    }
    return repository.runTransaction(async (transaction) => {
      const [stored] = await transaction.readMany([operationPath])
      const replayed = replay(stored, 'link', input)
      if (replayed) return { ...replayed, replayed: true }
      transaction.create(operationPath, {
        kind: 'link', fingerprint: fingerprint(input), result,
        createdAt: repository.timestamp(),
      })
      return { ...result, replayed: false }
    })
  }
  const clinicalContext = {
    ...(document.clinicalContext || {}),
    [field]: input.linkType === 'home_care' ? 'current' : input.targetId,
    ...(input.linkType === 'home_care' ? { appointmentId: input.targetId } : {}),
  }
  const validated = await validateClinicalLinks({
    uid, patientId: input.patientId, clinicalContext, repository,
  })
  const result = { documentId: input.documentId, linkType: input.linkType, targetId: input.targetId }
  return repository.runTransaction(async (transaction) => {
    const [, stored] = await transaction.readMany([documentPath, operationPath])
    const replayed = replay(stored, 'link', input)
    if (replayed) return { ...replayed, replayed: true }
    transaction.update(documentPath, { clinicalContext: validated, updatedAt: repository.timestamp() })
    persistLinks(transaction, repository, {
      uid, input, document: { ...document, clinicalContext: validated },
    })
    transaction.create(operationPath, {
      kind: 'link', fingerprint: fingerprint(input), result,
      createdAt: repository.timestamp(),
    })
    return { ...result, replayed: false }
  })
}

export const linkAttachmentToEvolution = (options) => linkAttachment({
  ...options, payload: { ...options.payload, linkType: 'evolution' },
})
export const linkAttachmentToAppointment = (options) => linkAttachment({
  ...options, payload: { ...options.payload, linkType: 'appointment' },
})
export const linkAttachmentToHomeCareVisit = (options) => linkAttachment({
  ...options, payload: { ...options.payload, linkType: 'home_care' },
})

export async function archiveAttachment({ uid, payload, repository }) {
  const input = parseArchiveClinicalAttachment(payload)
  const operationPath = `clinicalAttachmentOperations/${input.requestId}`
  const documentPath = `patients/${input.patientId}/documents/${input.documentId}`
  const [patient, operation] = await Promise.all([
    repository.read(`patients/${input.patientId}`), repository.read(operationPath),
  ])
  assertOwner(patient, uid)
  const previous = replay(operation, 'archive', input)
  if (previous) return { ...previous, replayed: true }
  const result = { documentId: input.documentId, status: 'archived' }
  return repository.runTransaction(async (transaction) => {
    const [document, stored] = await transaction.readMany([documentPath, operationPath])
    const replayed = replay(stored, 'archive', input)
    if (replayed) return { ...replayed, replayed: true }
    if (!document || document.ownerId !== uid) throw attachmentError('NOT_FOUND', 'Anexo não encontrado.')
    if (document.status === 'archived') {
      throw attachmentError('CONFLICT', 'Anexo já está arquivado.')
    }
    if (document.legalHold === true) {
      throw attachmentError('LEGAL_HOLD', 'Anexo sob legal hold não pode ser arquivado.')
    }
    if (['draft', 'pending_upload', 'uploaded_to_quarantine', 'scanning'].includes(document.status)) {
      throw attachmentError('CONFLICT', 'Anexo em processamento não pode ser arquivado.')
    }
    const timestamp = repository.timestamp()
    transaction.update(documentPath, {
      status: 'archived', archivedBy: uid, archivedAt: timestamp,
      archiveReason: input.reason, updatedAt: timestamp,
    })
    createAudit(transaction, repository, {
      uid, input, documentId: input.documentId,
      action: 'clinical_attachment_archived', status: 'archived',
    })
    transaction.create(operationPath, {
      kind: 'archive', fingerprint: fingerprint(input), result, createdAt: timestamp,
    })
    return { ...result, replayed: false }
  })
}

export async function requestAttachmentDownload({ uid, payload, repository, now = new Date() }) {
  const input = parseDownloadClinicalAttachment(payload)
  const operationPath = `clinicalAttachmentOperations/${input.requestId}`
  const documentPath = `patients/${input.patientId}/documents/${input.documentId}`
  const [patient, document, operation] = await Promise.all([
    repository.read(`patients/${input.patientId}`),
    repository.read(documentPath),
    repository.read(operationPath),
  ])
  assertOwner(patient, uid)
  const previous = replay(operation, 'download', input)
  if (previous) return { ...previous, replayed: true }
  if (!document || document.ownerId !== uid || document.status === 'archived') {
    await repository.recordAudit(auditValue(repository, {
      uid, input, documentId: input.documentId,
      action: 'clinical_attachment_download_denied', status: document?.status || 'not_found',
    }))
    throw attachmentError('FORBIDDEN', 'Anexo indisponível para download.')
  }
  let result
  try {
    result = await requestDocumentDownload({ uid, payload: input, repository, now })
  } catch (error) {
    await repository.recordAudit(auditValue(repository, {
      uid, input, documentId: input.documentId,
      action: 'clinical_attachment_download_denied', status: document.status,
    }))
    throw error
  }
  return repository.runTransaction(async (transaction) => {
    const [stored] = await transaction.readMany([operationPath])
    const replayed = replay(stored, 'download', input)
    if (replayed) return { ...replayed, replayed: true }
    createAudit(transaction, repository, {
      uid, input, documentId: input.documentId,
      action: 'clinical_attachment_download_requested', status: 'available',
    })
    createAudit(transaction, repository, {
      uid, input, documentId: input.documentId,
      action: 'clinical_attachment_download_granted', status: 'available',
    })
    transaction.create(operationPath, {
      kind: 'download', fingerprint: fingerprint(input), result,
      createdAt: repository.timestamp(),
    })
    return { ...result, replayed: false }
  })
}

export async function listAttachmentLinkOptions({ uid, payload, repository }) {
  const input = parseListClinicalAttachments({ ...payload, includeArchived: false })
  const patient = await repository.read(`patients/${input.patientId}`)
  assertOwner(patient, uid)
  const options = await repository.listLinkOptions(input.patientId, uid)
  return {
    evolutions: options.evolutions.map((item) => ({
      id: item.id,
      date: item.serviceDate || item.date || null,
      status: item.status || 'legacy',
    })),
    appointments: options.appointments.map((item) => ({
      id: item.id,
      date: item.date || null,
      startTime: item.startTime || null,
      serviceType: item.serviceType || 'clinic',
      status: item.status || null,
      homeCareAvailable: item.serviceType === 'home_care',
    })),
  }
}
