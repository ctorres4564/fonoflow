import { requestDownload,secureUpload,subscribeDocumentMetadata } from './documentStorageService'
export const subscribeDocuments=subscribeDocumentMetadata
export const uploadDocument=secureUpload
export async function deleteDocument(){throw new Error('Exclusão direta foi desativada. Use o futuro fluxo auditado de arquivamento.')}
export async function getSecureDocumentDownload(patientId,documentId){return requestDownload({patientId,documentId})}
