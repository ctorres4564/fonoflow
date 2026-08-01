import { finalizeAttachment } from '../_lib/clinicalAttachmentWorkflow.js'
import { createMalwareScanner } from '../_lib/malwareScanner.js'
import { attachmentHandler } from '../_lib/clinicalAttachmentEndpoint.js'
import { createDocumentIntegrityService } from '../_lib/documentIntegrityService.js'

export default attachmentHandler(finalizeAttachment, {
  scanner: createMalwareScanner(process.env),
  integrityService: createDocumentIntegrityService(process.env),
})
