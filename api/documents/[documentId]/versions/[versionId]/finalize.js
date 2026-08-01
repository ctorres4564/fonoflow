import { finalizeDocumentVersion } from '../../../../_lib/documentVersionWorkflow.js'
import { versionHandler, versionIntegrity, versionScanner } from '../../../../_lib/documentVersionEndpoint.js'

export default versionHandler(finalizeDocumentVersion, {
  scanner: versionScanner(), integrityService: versionIntegrity(),
})
