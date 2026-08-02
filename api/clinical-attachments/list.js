import { listPatientAttachments } from '../_lib/clinicalAttachmentWorkflow.js'
import { attachmentHandler } from '../_lib/clinicalAttachmentEndpoint.js'

export default attachmentHandler(listPatientAttachments)
