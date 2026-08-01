import { createDocumentIntegrityService } from './documentIntegrityService.js'
import { createDocumentStorageHandler } from './documentStorageHandler.js'
import { createClinicalAttachmentRepository, authenticateClinicalAttachmentRequest } from './clinicalAttachmentFirebase.js'
import { createMalwareScanner } from './malwareScanner.js'

export function versionHandler(operation, options = {}) {
  return createDocumentStorageHandler({
    authenticate: authenticateClinicalAttachmentRequest,
    repository: createClinicalAttachmentRepository(),
    operation,
    ...options,
  })
}

export const versionScanner = () => createMalwareScanner(process.env)
export const versionIntegrity = () => createDocumentIntegrityService(process.env)
