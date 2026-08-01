import {
  authenticateDocumentRequest,
  createDocumentStorageRepository,
} from '../_lib/documentStorageFirebase.js'
import { createDocumentStorageHandler } from '../_lib/documentStorageHandler.js'
import { listDocumentMetadata } from '../_lib/documentStorageWorkflow.js'

export default createDocumentStorageHandler({
  authenticate: authenticateDocumentRequest,
  repository: createDocumentStorageRepository(),
  operation: listDocumentMetadata,
  successStatus: 200,
})
