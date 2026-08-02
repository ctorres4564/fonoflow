import { auth } from '../firebase/config.js'
import { assertCategoryFile, assertDeclaredFile } from '../config/documentStorage.js'
import { uploadFileToQuarantine } from './documentStorageService.js'

async function authorized(path, { method = 'POST', payload } = {}) {
  const token = await auth.currentUser?.getIdToken()
  if (!token) throw new Error('Usuário não autenticado.')
  const response = await fetch(path, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error?.message || 'Operação de versão não concluída.')
  return data
}

const route = (documentId, suffix = '') =>
  `/api/documents/${encodeURIComponent(documentId)}${suffix}`
const withRequestId = (payload) => ({ ...payload, requestId: payload.requestId || crypto.randomUUID() })

export function createVersion(payload) {
  return authorized(route(payload.documentId, '/versions/create'), { payload: withRequestId(payload) })
}

export async function requestVersionUpload({ patientId, documentId, versionId, file, requestId }) {
  return authorized(route(documentId, `/versions/${encodeURIComponent(versionId)}/request-upload`), {
    payload: withRequestId({ patientId, documentId, versionId, requestId,
      originalFileName: file.name, declaredMimeType: file.type, size: file.size }),
  })
}

export function finalizeVersion(payload) {
  return authorized(route(payload.documentId, `/versions/${encodeURIComponent(payload.versionId)}/finalize`), {
    payload: withRequestId(payload),
  })
}

export async function createAndUploadVersion({ patientId, documentId, category, changeReason,
  duplicateJustification = null, file, onProgress }) {
  assertDeclaredFile({ fileName: file.name, declaredMimeType: file.type, size: file.size })
  assertCategoryFile({ category, declaredMimeType: file.type, size: file.size })
  const draft = await createVersion({ patientId, documentId, changeReason, duplicateJustification })
  const authorization = await requestVersionUpload({ patientId, documentId,
    versionId: draft.versionId, file })
  await uploadFileToQuarantine({ authorization, file, onProgress })
  const result = await finalizeVersion({ patientId, documentId, versionId: draft.versionId,
    uploadId: authorization.uploadId })
  onProgress?.(100)
  return result
}

export async function listVersions(patientId, documentId) {
  const query = new URLSearchParams({ patientId, documentId })
  return authorized(`${route(documentId, '/versions')}?${query}`, { method: 'GET' })
}

export async function getVersion(patientId, documentId, versionId) {
  const query = new URLSearchParams({ patientId, documentId, versionId })
  return authorized(`${route(documentId, `/versions/${encodeURIComponent(versionId)}`)}?${query}`, { method: 'GET' })
}

export function restoreVersion(payload) {
  return authorized(route(payload.documentId, `/versions/${encodeURIComponent(payload.versionId)}/restore`), {
    payload: withRequestId(payload),
  })
}

export function verifyIntegrity(payload) {
  return authorized(route(payload.documentId, '/integrity/verify'), { payload: withRequestId(payload) })
}

export function applyLegalHold(payload) {
  return authorized(route(payload.documentId, '/legal-hold/apply'), { payload: withRequestId(payload) })
}

export function removeLegalHold(payload) {
  return authorized(route(payload.documentId, '/legal-hold/remove'), { payload: withRequestId(payload) })
}

export function evaluateRetention(payload) {
  return authorized(route(payload.documentId, '/retention/evaluate'), { payload: withRequestId(payload) })
}

export const documentVersionService = {
  createVersion, requestVersionUpload, finalizeVersion, createAndUploadVersion,
  listVersions, getVersion, restoreVersion, verifyIntegrity,
  applyLegalHold, removeLegalHold, evaluateRetention,
}
