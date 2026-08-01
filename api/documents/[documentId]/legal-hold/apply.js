import { applyDocumentLegalHold } from '../../../_lib/documentVersionWorkflow.js'
import { versionHandler } from '../../../_lib/documentVersionEndpoint.js'

export default versionHandler(applyDocumentLegalHold)
