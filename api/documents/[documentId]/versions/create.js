import { createDocumentVersion } from '../../../_lib/documentVersionWorkflow.js'
import { versionHandler } from '../../../_lib/documentVersionEndpoint.js'

export default versionHandler(createDocumentVersion, { successStatus: 201 })
