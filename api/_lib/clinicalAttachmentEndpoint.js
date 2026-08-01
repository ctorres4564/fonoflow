import {
  authenticateClinicalAttachmentRequest,
  createClinicalAttachmentRepository,
} from './clinicalAttachmentFirebase.js'
import { createDocumentStorageHandler } from './documentStorageHandler.js'

export function attachmentHandler(operation, options = {}) {
  return createDocumentStorageHandler({
    authenticate: authenticateClinicalAttachmentRequest,
    repository: createClinicalAttachmentRepository(),
    operation,
    ...options,
  })
}
