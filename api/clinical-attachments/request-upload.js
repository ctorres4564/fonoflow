import { requestAttachmentUpload } from '../_lib/clinicalAttachmentWorkflow.js'
import { attachmentHandler } from '../_lib/clinicalAttachmentEndpoint.js'

export default attachmentHandler(requestAttachmentUpload, { successStatus: 201 })
