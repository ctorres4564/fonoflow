import {
  assertCategoryFile,
  assertDeclaredFile,
  DOCUMENT_CATEGORY_CONFIG,
} from '../config/documentStorage.js'
import { getAuditEvents } from './auditService.js'
import { consentService } from './consentService.js'
import { documentStorageService, uploadFileToQuarantine } from './documentStorageService.js'
import { auth } from '../firebase/config.js'

async function request(path, payload) {
  const token = await auth.currentUser?.getIdToken()
  if (!token) throw new Error('Usuário não autenticado.')
  const response = await fetch(path, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error?.message || 'Operação de anexo não concluída.')
  return data
}

export function createAttachmentDraft(payload) {
  return request('/api/clinical-attachments/create-draft', {
    ...payload,
    requestId: payload.requestId || crypto.randomUUID(),
  })
}

export async function requestAttachmentUpload({ patientId, documentId, file, requestId }) {
  const authorization = await request('/api/clinical-attachments/request-upload', {
    patientId,
    documentId,
    requestId: requestId || crypto.randomUUID(),
    originalFileName: file.name,
    declaredMimeType: file.type,
    size: file.size,
  })
  return authorization
}

export function finalizeAttachment(payload) {
  return request('/api/clinical-attachments/finalize', {
    ...payload,
    requestId: payload.requestId || crypto.randomUUID(),
  })
}

export async function uploadAttachment({ draft, file, onProgress }) {
  const authorization = await requestAttachmentUpload({
    patientId: draft.patientId,
    documentId: draft.documentId,
    file,
  })
  await uploadFileToQuarantine({ authorization, file, onProgress })
  return finalizeAttachment({
    patientId: draft.patientId,
    documentId: draft.documentId,
    uploadId: authorization.uploadId,
  })
}

export async function createAndUploadAttachment({ patientId, metadata, file, onProgress }) {
  assertDeclaredFile({
    fileName: file.name,
    declaredMimeType: file.type,
    size: file.size,
  })
  assertCategoryFile({
    category: metadata.category,
    declaredMimeType: file.type,
    size: file.size,
  })
  const draft = await createAttachmentDraft({ patientId, ...metadata })
  const result = await uploadAttachment({
    draft: { ...draft, patientId }, file, onProgress,
  })
  return { ...result, documentId: draft.documentId }
}

export async function listPatientAttachments(patientId, includeArchived = false) {
  const result = await request('/api/clinical-attachments/list', { patientId, includeArchived })
  return result.attachments
}

export async function getAttachment(patientId, documentId) {
  const result = await request('/api/clinical-attachments/get', { patientId, documentId })
  return result.attachment
}

export async function listAttachmentLinkOptions(patientId) {
  return request('/api/clinical-attachments/link-options', { patientId })
}

export function validateClinicalLinks(category, clinicalContext = {}) {
  const config = DOCUMENT_CATEGORY_CONFIG[category]
  if (!config) return { valid: false, message: 'Categoria inválida.' }
  if (clinicalContext.homeCareVisitId && !clinicalContext.appointmentId) {
    return { valid: false, message: 'Home Care exige um agendamento.' }
  }
  return { valid: true }
}

export async function validateRequiredConsent(patientId, category) {
  const required = DOCUMENT_CATEGORY_CONFIG[category]?.requiredConsentType || null
  if (!required) return { valid: true, requiredConsentType: null }
  const valid = await consentService.hasValidConsent(patientId, required)
  return { valid, requiredConsentType: required }
}

export function linkAttachment(payload) {
  return request('/api/clinical-attachments/link', {
    ...payload,
    requestId: payload.requestId || crypto.randomUUID(),
  })
}
export const linkAttachmentToEvolution = (payload) =>
  linkAttachment({ ...payload, linkType: 'evolution', targetId: payload.evolutionId })
export const linkAttachmentToAppointment = (payload) =>
  linkAttachment({ ...payload, linkType: 'appointment', targetId: payload.appointmentId })
export const linkAttachmentToHomeCareVisit = (payload) =>
  linkAttachment({ ...payload, linkType: 'home_care', targetId: payload.appointmentId })

export function archiveAttachment(payload) {
  return request('/api/clinical-attachments/archive', {
    ...payload,
    requestId: payload.requestId || crypto.randomUUID(),
  })
}

export function requestAttachmentDownload(patientId, documentId) {
  return documentStorageService.requestDownload({
    patientId, documentId, clinicalAttachment: true,
  })
}

export async function getAttachmentAuditTrail(documentId) {
  const events = await getAuditEvents(200)
  return events.filter((event) =>
    event.documentId === documentId || event.resourceId === documentId,
  )
}

export const clinicalAttachmentService = {
  createAttachmentDraft,
  requestAttachmentUpload,
  finalizeAttachment,
  uploadAttachment,
  createAndUploadAttachment,
  listPatientAttachments,
  getAttachment,
  listAttachmentLinkOptions,
  validateClinicalLinks,
  validateRequiredConsent,
  linkAttachment,
  linkAttachmentToEvolution,
  linkAttachmentToAppointment,
  linkAttachmentToHomeCareVisit,
  archiveAttachment,
  requestDownload: requestAttachmentDownload,
  getAttachmentAuditTrail,
}
