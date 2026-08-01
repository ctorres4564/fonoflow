import { verifyDocumentIntegrity } from '../../../_lib/documentVersionWorkflow.js'
import { versionHandler, versionIntegrity } from '../../../_lib/documentVersionEndpoint.js'

export default versionHandler(verifyDocumentIntegrity, { integrityService: versionIntegrity() })
